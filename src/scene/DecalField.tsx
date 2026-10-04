import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Plane,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Texture,
} from 'three'
import { useDecalAtlas } from './decalAtlas'
import { type DecalSpec } from './decalSpecs'

/**
 * cutout 的裁切阈值。
 *
 * 取 0.5 不是 0.1：素材层实测 mip4 的覆盖率漂移，
 * `alphaTest=0.1` 时最差 **+26.6%**（远景剪影整整胖一圈），0.5 时降到 **+9.7%**。
 * 软边由 `alphaToCoverage` 配 canvas 的 MSAA 拿回来，不靠 alpha 混合 ——
 * 这样贴花走不透明队列，重叠时不会有排序错误。
 */
const ALPHA_TEST = 0.5
/** 同一面上多张贴花的层间距，避免 z-fighting 又看不出漂浮 */
const LAYER_STEP = 0.0008
/** 判定「这是拖拽不是点击」的屏幕位移阈值 */
const DRAG_THRESHOLD_PX = 5
/** hover 时贴花抬起的高度与放大比例 */
const HOVER_LIFT = 0.012
const HOVER_SCALE = 1.04
/** 轻微摆动的幅度（弧度）与角频率 */
const SWAY_RAD = 0.035
const SWAY_HZ = 1.15

const _plane = new Plane()
const _hitWorld = new Vector3()
const _normal = new Vector3()
const _origin = new Vector3()
const _local = new Vector3()

/* ── 材质 ─────────────────────────────────────────────────── */

/**
 * 图集材质。
 *
 * 每个实例要从图集里取自己那一格，所以给几何加一条 `uvRect` 实例属性
 * （[u0, v0, du, dv]），在顶点着色器里把 `vMapUv` 重映射到那一格。
 * 这样十几张贴花共用一张纹理、一次 draw call，符合 draw call 预算。
 */
function makeAtlasMaterial(map: Texture, mode: 'cutout' | 'blend'): MeshStandardMaterial {
  const m =
    mode === 'blend'
      ? // 真半透明（washi 胶带）：走混合，不写深度，排在 cutout 之后
        new MeshStandardMaterial({
          map,
          transparent: true,
          depthWrite: false,
          roughness: 0.9,
          metalness: 0,
        })
      : new MeshStandardMaterial({
          map,
          transparent: false,
          alphaTest: ALPHA_TEST,
          alphaToCoverage: true,
          depthWrite: true,
          roughness: 0.9,
          metalness: 0,
        })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = uvRect.xy + vMapUv * uvRect.zw;\n#endif',
      )
  }
  // onBeforeCompile 改了着色器源码，要让 three 重新生成 program 缓存键
  m.customProgramCacheKey = () => `decal-atlas-${mode}`
  return m
}

/* ── 组件 ─────────────────────────────────────────────────── */

export type DecalFieldHandle = {
  /** 逐实例的面内偏移（门板局部单位），拖拽写这里 */
  offsets: Float32Array
  specs: readonly DecalSpec[]
  /** 把 offsets 的改动刷进实例矩阵 */
  apply(): void
}

/**
 * 一个承载面上的全部贴花。
 *
 * 用 InstancedMesh 而不是一张一个 mesh：柜门上十几张贴纸，
 * 一张一个 draw call 会直接顶穿 35 的上限。合成图集后
 * 一个面只占 1 个 draw call，而且每个实例仍有独立变换 ——
 * 拖拽和 raycaster 的 `instanceId` 都还能用。
 *
 * 坐标系：以承载面中心为原点，+X 向右、+Y 向上，单位是世界单位。
 * 传进来的 spec 用的是「相对门面的百分比」，在这里换算成局部坐标。
 */
function DecalLayer({
  specs,
  width,
  height,
  name,
  mode,
  interactive = false,
  onTap,
  onHover,
  onPositionChange,
  handleRef,
}: {
  specs: readonly DecalSpec[]
  /** 承载面的世界宽高 */
  width: number
  height: number
  name: string
  mode: 'cutout' | 'blend'
  /** 当前是否允许交互（由状态机的能力表决定） */
  interactive?: boolean
  /** 位移没过阈值 = 点击 */
  onTap?: (id: string) => void
  /** 指针进出某张贴花 */
  onHover?: (id: string | null, on: boolean) => void
  /** 拖拽后的承载面局部坐标，供与贴花绑定的热点跟随。 */
  onPositionChange?: (
    id: string,
    position: readonly [x: number, y: number, z: number],
  ) => void
  handleRef?: { current: DecalFieldHandle | null }
}) {
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const invalidate = useThree((s) => s.invalidate)
  const atlas = useDecalAtlas(maxAnisotropy)
  const mesh = useRef<InstancedMesh>(null)

  /** 指针状态。全部放 ref：每帧都在变，进 React state 会重渲染整棵场景树 */
  const state = useRef<{
    hover: number
    drag: null | {
      index: number
      pointerId: number
      grabX: number
      grabY: number
      fromX: number
      fromY: number
      startX: number
      startY: number
      moved: boolean
    }
    lift: Float32Array
    /** 逐张的拖拽偏移。放 ref 而不是 useMemo：它在事件回调里被改写，
        useMemo 的返回值属于「渲染产物」，改它会被 lint 判为跨渲染副作用 */
    offsets: Float32Array
    dirty: boolean
  }>({
    hover: -1,
    drag: null,
    lift: new Float32Array(0),
    offsets: new Float32Array(0),
    dirty: true,
  })

  /**
   * 图集里没有的（加载失败）直接跳过；再按 cutout / blend 分组 ——
   * 两种混合方式不能共用一个材质，所以一个承载面最多两个 InstancedMesh。
   */
  const placed = useMemo(
    () => specs.filter((s) => atlas.entries.get(s.url)?.mode === mode),
    [specs, atlas, mode],
  )

  const geometry = useMemo(() => new PlaneGeometry(1, 1), [])
  const material = useMemo(() => makeAtlasMaterial(atlas.texture, mode), [atlas, mode])
  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  /** 每个实例的静态布局，拖拽偏移在此基础上叠加 */
  const layout = useMemo(
    () =>
      placed.map((s) => {
        const entry = atlas.entries.get(s.url)!
        const w = s.width * width
        const h = w / entry.aspect
        return {
          x: (s.left + s.width / 2) * width - width / 2,
          y: height / 2 - (s.top * height + h / 2),
          w,
          h,
          rot: ((s.rot ?? 0) * Math.PI) / 180,
          rect: entry.rect,
        }
      }),
    [placed, atlas, width, height],
  )

  useLayoutEffect(() => {
    state.current.lift = new Float32Array(layout.length)
    state.current.offsets = new Float32Array(layout.length * 2)
    state.current.hover = -1
    state.current.drag = null
    state.current.dirty = true
  }, [layout])

  useLayoutEffect(() => {
    const im = mesh.current
    if (!im) return
    const uv = new Float32Array(layout.length * 4)
    layout.forEach((l, i) => uv.set(l.rect, i * 4))
    im.geometry.setAttribute('uvRect', new InstancedBufferAttribute(uv, 4))
    im.count = layout.length
  }, [layout])

  /**
   * 把三份互不相干的量合成一条实例矩阵。
   *
   * 硬要求是「拖拽位移、hover lift 和轻微摆动拆分到不同父子节点，
   * 禁止竞争同一个 transform」。这里没有父子节点可拆（一个 InstancedMesh
   * 只有一层矩阵），但要害不是「有几个节点」而是「会不会互相覆盖」——
   * 三份量分别存在三个数组里，每帧**相加**成一条矩阵，谁都不会写掉谁：
   *   drag  → offsets[i]（拖到哪就是哪，只有指针改它）
   *   hover → lift[i]（0→1 的插值，只有指针进出改它）
   *   sway  → 由时间和 lift 算出来，不落盘
   */
  const apply = useMemo(() => {
    const m = new Matrix4()
    const q = new Quaternion()
    const e = new Euler()
    const p = new Vector3()
    const s = new Vector3()
    return (nowSec: number) => {
      const im = mesh.current
      if (!im) return
      const { lift: lifts, offsets } = state.current
      if (lifts.length !== layout.length) return
      layout.forEach((l, i) => {
        const lift = lifts[i]
        // 摆动只在被指到的那张上发生，幅度随 lift 淡入淡出
        const sway = lift * SWAY_RAD * Math.sin(nowSec * SWAY_HZ * Math.PI * 2 + i)
        e.set(0, 0, l.rot + sway)
        q.setFromEuler(e)
        p.set(
          l.x + offsets[i * 2],
          l.y + offsets[i * 2 + 1],
          i * LAYER_STEP + lift * HOVER_LIFT,
        )
        const k = 1 + lift * (HOVER_SCALE - 1)
        s.set(l.w * k, l.h * k, 1)
        im.setMatrixAt(i, m.compose(p, q, s))
      })
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
    }
  }, [layout])

  useLayoutEffect(() => {
    apply(0)
    if (handleRef) {
      handleRef.current = { offsets: state.current.offsets, specs: placed, apply: () => apply(0) }
    }
    return () => {
      if (handleRef) handleRef.current = null
    }
  }, [apply, placed, handleRef])

  /* ── 指针：hover / 拖拽 / 点击───────────────────── */

  /** 把射线与承载面的局部平面求交，换算成面内局部坐标 */
  const localHit = useCallback((e: ThreeEvent<PointerEvent>): Vector3 | null => {
    const im = mesh.current
    if (!im) return null
    im.updateWorldMatrix(true, false)
    _normal.set(0, 0, 1).transformDirection(im.matrixWorld).normalize()
    _origin.setFromMatrixPosition(im.matrixWorld)
    _plane.setFromNormalAndCoplanarPoint(_normal, _origin)
    if (!e.ray.intersectPlane(_plane, _hitWorld)) return null
    return im.worldToLocal(_local.copy(_hitWorld))
  }, [])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const i = e.instanceId
    if (i === undefined || !placed[i]?.draggable || !interactive) return
    const hit = localHit(e)
    if (!hit) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const off = state.current.offsets
    state.current.drag = {
      index: i,
      pointerId: e.pointerId,
      grabX: hit.x - off[i * 2],
      grabY: hit.y - off[i * 2 + 1],
      fromX: off[i * 2],
      fromY: off[i * 2 + 1],
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = state.current.drag
    if (!d || d.pointerId !== e.pointerId) return
    e.stopPropagation()
    if (!d.moved) {
      const far = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      if (far < DRAG_THRESHOLD_PX) return
      d.moved = true
    }
    const hit = localHit(e)
    if (!hit) return
    const l = layout[d.index]
    // 按贴花的实际尺寸限制在门板边界内
    const maxX = Math.max(0, (width - l.w) / 2)
    const maxY = Math.max(0, (height - l.h) / 2)
    const off = state.current.offsets
    off[d.index * 2] = clamp(hit.x - d.grabX, -maxX - l.x, maxX - l.x)
    off[d.index * 2 + 1] = clamp(hit.y - d.grabY, -maxY - l.y, maxY - l.y)
    onPositionChange?.(placed[d.index].id, [
      l.x + off[d.index * 2],
      l.y + off[d.index * 2 + 1],
      d.index * LAYER_STEP,
    ])
    state.current.dirty = true
    // demand 渲染下事件本身不会触发一帧，必须自己踢一脚（：只在有事发生时渲染）
    invalidate()
  }

  const endDrag = (e: ThreeEvent<PointerEvent>, cancelled: boolean) => {
    const d = state.current.drag
    if (!d || d.pointerId !== e.pointerId) return
    state.current.drag = null
    if (cancelled) {
      // pointercancel 只取消拖拽：位置回到按下时的样子，且**不触发点击**
      const off = state.current.offsets
      off[d.index * 2] = d.fromX
      off[d.index * 2 + 1] = d.fromY
      const l = layout[d.index]
      onPositionChange?.(placed[d.index].id, [
        l.x + d.fromX,
        l.y + d.fromY,
        d.index * LAYER_STEP,
      ])
      state.current.dirty = true
      invalidate()
      return
    }
    if (!d.moved) onTap?.(placed[d.index].id)
  }

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    const i = e.instanceId
    if (i === undefined || !interactive) return
    e.stopPropagation()
    state.current.hover = i
    state.current.dirty = true
    invalidate()
    if (placed[i]?.draggable) document.body.style.cursor = 'grab'
    onHover?.(placed[i]?.id ?? null, true)
  }

  const onOut = () => {
    const prev = state.current.hover
    state.current.hover = -1
    state.current.dirty = true
    invalidate()
    document.body.style.cursor = ''
    if (prev >= 0) onHover?.(placed[prev]?.id ?? null, false)
  }

  /* 每帧把 lift 往目标值收敛并重算矩阵；全部归零后停下来，不留常驻循环 */
  useFrame((_, dt) => {
    const st = state.current
    const lift = st.lift
    const want = st.drag ? st.drag.index : st.hover
    let busy = false
    const k = Math.min(1, dt * 9)
    for (let i = 0; i < lift.length; i += 1) {
      const target = i === want ? 1 : 0
      const next = lift[i] + (target - lift[i]) * k
      const v = Math.abs(next - target) < 0.002 ? target : next
      if (v !== lift[i]) {
        lift[i] = v
        busy = true
      }
      if (v > 0) busy = true
    }
    if (!busy && !st.dirty) return
    st.dirty = false
    apply(performance.now() / 1000)
    invalidate()
  })

  if (layout.length === 0) return null
  return (
    <instancedMesh
      ref={mesh}
      name={name}
      args={[geometry, material, layout.length]}
      renderOrder={mode === 'blend' ? 1 : 0}
      frustumCulled={false}
      onPointerOver={onOver}
      onPointerOut={onOut}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onLostPointerCapture={(e) => endDrag(e as unknown as ThreeEvent<PointerEvent>, true)}
    />
  )
}

/**
 * 一个承载面上的全部贴花。内部按 cutout / blend 拆成两层，
 * 调用方不用关心哪张是半透明的 —— 判定写在图集表里，换素材自动跟着变。
 */
export default function DecalField(props: {
  specs: readonly DecalSpec[]
  width: number
  height: number
  name: string
  interactive?: boolean
  onTap?: (id: string) => void
  onHover?: (id: string | null, on: boolean) => void
  onPositionChange?: (
    id: string,
    position: readonly [x: number, y: number, z: number],
  ) => void
  handleRef?: { current: DecalFieldHandle | null }
}) {
  return (
    <>
      <DecalLayer {...props} mode="cutout" name={`${props.name}_Cutout`} />
      <DecalLayer {...props} mode="blend" name={`${props.name}_Blend`} handleRef={undefined} />
    </>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
