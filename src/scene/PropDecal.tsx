import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  MeshDepthMaterial,
  RGBADepthPacking,
  SRGBColorSpace,
  type Group,
  type MeshStandardMaterial,
  type Texture,
} from 'three'
import { introTime } from '../experience/experienceClock'
import { easeBy, type PropSpec } from './propSpecs'

/**
 * 透明区被裁掉的阈值。
 *
 * 取 0.5 而不是 0.1：素材层实测 mip4 的覆盖率漂移，
 * `alphaTest=0.1` 时最差 **+26.6%** —— 物件缩小后剪影会整整胖一圈；
 * 0.5 时降到 +9.7%。0.9–2.0px 的抗锯齿软边由 alpha 混合保住，
 * 不会因为提高阈值就变锯齿。
 *
 * 入场淡入时阈值会**按同比例下调**（见 useFrame），
 * 这样淡入过程中剪影不变，不会出现「从核心往外长出来」的怪相。
 */
const ALPHA_TEST = 0.5

/** 各向异性上限。再高对 1320×724 下的斜视贴片没有可见收益，只烧带宽 */
const MAX_ANISOTROPY = 8

/**
 * 一件贴片物件。
 *
 * 关键点：
 * 1. **深度写入是开的**，所以贴片与柜体、贴片与贴片之间的遮挡由深度缓冲决定，
 *    不靠绘制顺序。翻开的门挡住柜腔深处的书，是真遮挡。
 * 2. **配了 `customDepthMaterial`**。默认的深度材质不认 alpha，
 *    整块矩形都会进阴影贴图，柜腔里会出现一片方形黑影。
 *    这里给深度材质同样的 map 与 alphaTest，投出来的才是物件的轮廓。
 * 3. 入场动画每帧直接改 three 对象，不写 React state。
 * 4. 材质用 Metallic-Roughness 的 standard 材质而不是 basic：
 *    柜腔里光少，贴片就该跟着暗下去，和柜体共用同一套光照。
 * 5. **只投影不接收**。这些替代素材是预渲染的 3D 小物件，明暗已经烘焙在贴图里；
 *    再叠一层实时硬阴影，就会出现「柜口上沿在一排书脊上切出一条笔直亮暗分界」
 *    的假象（实测那条线落在 y=2.42，正是柜口上沿沿主光方向投下来的边），
 *    正是「固定烘焙阴影与实时阴影方向冲突」。
 *    所以贴片参与投射（对柜腔、隔板、地面），但自己不接收。
 */
export default function PropDecal({ spec }: { spec: PropSpec }) {
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  // 贴图配置写成 useTexture 的 onLoad 回调，而不是自己开 effect 去改 hook 的返回值
  const configure = useCallback(
    (t: Texture | Texture[]) => {
      const one = Array.isArray(t) ? t[0] : t
      // TextureLoader 默认按线性空间处理，不改会整体偏亮发白
      one.colorSpace = SRGBColorSpace
      one.anisotropy = Math.min(MAX_ANISOTROPY, maxAnisotropy)
      one.needsUpdate = true
    },
    [maxAnisotropy],
  )
  const tex = useTexture(spec.url, configure)
  const group = useRef<Group>(null)
  const mat = useRef<MeshStandardMaterial>(null)

  /** 贴图是按 alpha 包围盒裁紧的，所以高度直接由贴图比例决定，不另外标注 */
  const height = useMemo(() => {
    const img = tex.image as { width: number; height: number } | undefined
    const ratio = img && img.width && img.height ? img.width / img.height : 1
    return spec.width / ratio
  }, [tex, spec.width])

  /** 锚点到贴片中心的偏移：底部锚点就把贴片整体抬起半个高度 */
  const offsetY = spec.anchor === 'top' ? -height / 2 : spec.anchor === 'center' ? 0 : height / 2

  /** 阴影用的深度材质：认得 alpha，投出来的是轮廓不是矩形 */
  const depthMaterial = useMemo(
    () =>
      new MeshDepthMaterial({
        depthPacking: RGBADepthPacking,
        map: tex,
        alphaTest: ALPHA_TEST,
      }),
    [tex],
  )
  useEffect(() => () => depthMaterial.dispose(), [depthMaterial])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const u = (introTime() - spec.at_ms) / spec.dur
    if (u <= 0) {
      // 还没到出场时刻：整组隐藏，连阴影一起省掉
      if (g.visible) g.visible = false
      return
    }
    g.visible = true
    const e = u >= 1 ? 1 : easeBy(spec.ease, u)
    const back = 1 - e
    const f = spec.from
    g.position.set(
      spec.at[0] + (f.dx ?? 0) * back,
      spec.at[1] + (f.dy ?? 0) * back,
      spec.at[2] + (f.dz ?? 0) * back,
    )
    g.rotation.set(0, (spec.yaw ?? 0) + (f.yaw ?? 0) * back, spec.roll ?? 0)
    const s = 1 - (1 - (f.scale ?? 1)) * back
    g.scale.setScalar(s)
    if (mat.current) {
      const o = u >= 1 ? 1 : Math.min(1, u * 2.4)
      mat.current.opacity = o
      // 阈值跟着 opacity 等比降，判定的是「原始 alpha ≥ 0.5」而不是
      // 「乘过 opacity 的 alpha ≥ 0.5」，淡入全程剪影一致。
      // 下限 0.02 是为了别让 alphaTest 归零 —— 归零会掉 USE_ALPHATEST 宏，
      // 触发一次着色器重编译。
      mat.current.alphaTest = Math.max(0.02, ALPHA_TEST * o)
    }
  })

  return (
    <group ref={group} name={spec.name} visible={false}>
      <mesh
        position={[0, offsetY, 0]}
        castShadow={spec.cast ?? false}
        customDepthMaterial={depthMaterial}
      >
        <planeGeometry args={[spec.width, height]} />
        <meshStandardMaterial
          ref={mat}
          map={tex}
          transparent
          alphaTest={ALPHA_TEST}
          depthWrite
          roughness={0.86}
          metalness={0}
        />
      </mesh>
    </group>
  )
}
