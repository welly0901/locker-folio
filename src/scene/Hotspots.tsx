import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AdditiveBlending, Vector3, type Group, type Mesh } from 'three'
import { isSettled } from '../experience/experienceMachine'
import { useSceneCapabilities, useSceneState, useStore } from '../store'
import { currentPose, flyTo, releaseCamera } from './cameraDirector'
import { restPose } from './cameraPath'
import {
  activateHotspot,
  FOCUS_MS,
  movingHotspotAnchor,
  registerHotspot,
} from './hotspotActions'
import { HOTSPOTS, type HotspotSpec } from './hotspotSpecs'

/** 点击扩散圆环的时长，取 0.3–0.5s */
const RIPPLE_MS = 420

const _v = new Vector3()
const _normal = new Vector3()

/**
 * 一个柜内热点。
 *
 * 三层分开，互不覆盖对方的 transform：
 *   1. **交互层**：热点对应的真实物件本身负责点击与拖拽；不再另铺一块
 *      放大的透明平面。透明平面会盖住相邻物件，并在 pointerdown 阶段吞掉
 *      拖拽，这是“所有东西都能移动”的直接冲突。
 *   2. **反馈层**：真实物件 hover / focus 时的静态圆环 + 点击扩散圆环。
 *      两者共用同一段几何，不活动时 `visible={false}`，同样不占 draw call。
 *   3. **无障碍层**：一个真正的 `<button>`，用 drei 的 Html 挂在锚点上。
 *      它 `pointer-events: none` —— 指针交互一律交给 raycaster，
 *      但键盘 Tab 与读屏仍然到得了它，Enter / Space 触发同一个入口。
 */
function Hotspot({ spec, enabled }: { spec: HotspotSpec; enabled: boolean }) {
  const root = useRef<Group>(null)
  const ripple = useRef<Mesh>(null)
  const rippleAt = useRef(0)
  const [active, setActive] = useState(false)
  const { gl } = useThree()
  const portalRef = useRef<HTMLElement>(gl.domElement.parentElement ?? document.body)

  const radius = Math.max(spec.size[0], spec.size[1]) / 2

  /** 打开对应内容。具体流程在 hotspotActions，贴花本体点击走的是同一条 */
  const open = useCallback(() => {
    if (!enabled) return
    activateHotspot(spec.id)
  }, [enabled, spec.id])

  /* 把自己登记到动作总线：贴花本体被点 / 被 hover 时也能触发同一套反馈 */
  useEffect(
    () =>
      registerHotspot(spec.id, {
        anchor: () => {
          const group = root.current
          if (!group) return [spec.at[0], spec.at[1], spec.at[2]]
          group.getWorldPosition(_v)
          return [_v.x, _v.y, _v.z]
        },
        focusHeight: spec.focusHeight,
        // 承载面法线 = 热点自己这一组的世界 +Z：门转到哪它就跟到哪
        facing:
          spec.focusFacing === 'surface'
            ? () => {
                const group = root.current
                if (!group) return null
                group.getWorldDirection(_normal)
                return [_normal.x, _normal.y, _normal.z]
              }
            : undefined,
        pulse: () => {
          rippleAt.current = performance.now()
        },
        setActive,
      }),
    [spec],
  )

  useFrame(() => {
    // skills / work / contact 的视觉物件现在可以移动。命中框、反馈圆环和
    // 无障碍标签跟随实体物件的实时世界坐标，不再留在初始位置。
    const anchor = movingHotspotAnchor(spec.id)
    if (anchor && root.current) {
      _v.set(anchor[0], anchor[1], anchor[2])
      // world 热点直接挂在场景根下；门面/门内侧热点的父级随铰链或门心定位，
      // 因此要把实时世界坐标反算回父级局部坐标，不能直接塞进 position。
      if ((spec.frame === 'door2inner' || spec.frame === 'door1face') && root.current.parent) {
        root.current.parent.worldToLocal(_v)
      }
      root.current.position.copy(_v)
    }

    const r = ripple.current
    if (!r) return
    const u = (performance.now() - rippleAt.current) / RIPPLE_MS
    if (rippleAt.current === 0 || u >= 1) {
      if (r.visible) r.visible = false
      return
    }
    r.visible = true
    const s = radius * (0.5 + u * 1.15)
    r.scale.set(s, s, 1)
    const m = r.material as { opacity: number }
    m.opacity = 0.85 * (1 - u) ** 2
  })

  const on = enabled && active
  const label = spec.labelOffset ?? [0, 0, 0]

  return (
    <group
      ref={root}
      position={[spec.at[0], spec.at[1], spec.at[2]]}
      name={`Hotspot_${spec.id}`}
    >
      {/* hover / focus 的静态圆环 */}
      <mesh visible={on} scale={[radius, radius, 1]} renderOrder={20}>
        <ringGeometry args={[0.9, 1, 56]} />
        <meshBasicMaterial
          color="#b06a44"
          transparent
          opacity={0.55}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* 点击的扩散圆环 */}
      <mesh ref={ripple} visible={false} renderOrder={21}>
        <ringGeometry args={[0.82, 1, 56]} />
        <meshBasicMaterial
          color="#b06a44"
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* 无障碍层：真正的按钮，键盘和读屏走这条路 */}
      <Html
        position={[label[0], label[1], label[2]]}
        center
        pointerEvents="none"
        zIndexRange={[6, 0]}
        wrapperClass="hot3d"
        portal={portalRef}
      >
        <button
          type="button"
          className="hot3d__btn"
          data-on={on || undefined}
          tabIndex={enabled ? 0 : -1}
          aria-label={spec.label}
          data-hot-id={spec.id}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          onClick={open}
        >
          <b>{spec.caption}</b>
          <i>{spec.id === 'work' ? 'SELECTED WORK' : spec.id.toUpperCase()}</i>
        </button>
      </Html>
    </group>
  )
}

/** 柜腔与柜外的三个热点（世界坐标） */
export function WorldHotspots() {
  const caps = useSceneCapabilities()
  return (
    <>
      {HOTSPOTS.filter((h) => h.frame === 'world').map((h) => (
        <Hotspot key={h.id} spec={h} enabled={caps.hotspots} />
      ))}
    </>
  )
}

/** 挂在第 2 扇门内侧的 ABOUT / CONTACT 热点：跟着门一起转，不需要每帧同步坐标 */
export function DoorHotspots() {
  const caps = useSceneCapabilities()
  return (
    <>
      {HOTSPOTS.filter((h) => h.frame === 'door2inner').map((h) => (
        <Hotspot key={h.id} spec={h} enabled={caps.hotspots} />
      ))}
    </>
  )
}

/** 挂在第 1 扇关闭门门面上的 AWARDS 热点：与海报共用同一个门面内容组坐标系 */
export function DoorOneHotspots() {
  const caps = useSceneCapabilities()
  return (
    <>
      {HOTSPOTS.filter((h) => h.frame === 'door1face').map((h) => (
        <Hotspot key={h.id} spec={h} enabled={caps.hotspots} />
      ))}
    </>
  )
}

/**
 * 镜头返回（第 3 步）。
 *
 * 浮层退出后状态机进 `returning`，这里把镜头从当前视觉位置平滑送回宽景，
 * 落位后投 RETURN_DONE。不放在 Hotspot 里是因为它和具体某个热点无关，
 * 而且必须只有一份。
 */
export function CameraReturn() {
  const state = useSceneState()
  useEffect(() => {
    if (state !== 'returning') return
    flyTo(currentPose(), restPose(), FOCUS_MS, () => {
      releaseCamera()
      useStore.getState().send({ type: 'RETURN_DONE' })
    })
  }, [state])

  // 顺带兜一种情况：开场还没跑完就被浮层打断，镜头会停在半路。
  // 这时把它平滑送到稳定态机位，而不是原地冻住（最后一条）。
  // 已经在稳定态机位上就什么都不做，免得每次回到 idle 都空跑一次。
  useEffect(() => {
    if (!isSettled(state)) return
    const now = currentPose()
    const rest = restPose()
    const off = Math.hypot(
      now.pos[0] - rest.pos[0],
      now.pos[1] - rest.pos[1],
      now.pos[2] - rest.pos[2],
    )
    if (off < 0.01) return
    flyTo(now, rest, FOCUS_MS, releaseCamera)
  }, [state])

  return null
}
