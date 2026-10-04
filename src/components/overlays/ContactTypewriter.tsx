import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { NoToneMapping } from 'three'
import { useCapabilities } from '../fallback'
import { TypewriterModel } from '../../scene/PhysicalProps'

/**
 * 软木板底部的打字机。
 *
 * 用的就是柜门里那台 `TypewriterModel`（真实网格：圆角机身、29 个独立键帽、
 * 压纸滚筒、回车杆），不是另画一台。这里只负责把它正面取景、给两三盏灯，
 * 并在没有 WebGL 时退回原来那套纯 CSS 平面打字机。
 */

/* ── 取景 ─────────────────────────────────────────────
 *
 * 下面三个数是从 TypewriterModel 的实际几何量出来的，不是试出来的。
 * 模型局部包围盒（原点 = 背板贴门那一面的中心，Z=0 就是磁吸面）：
 *   x ∈ [-0.410, 0.360]  —— 左端 -0.410 是回车杆，机身本体只到 ±0.36
 *   y ∈ [-0.331,  0.245] —— 下端是前倾 21.8° 的键盘托板前下缘
 *   z ∈ [ 0.001,  0.439] —— 最前是空格键，整机厚 0.438
 *
 * 相机放在 [0, 0, 1.03] 正对 -Z，模型整体上抬 0.172，于是画幅：
 *   上沿裁在背板 y≈0.085 处 —— 背板上半、压纸板和那张印着 CONTACT 的纸
 *     全部出画。它们本来就被 HTML 打字纸（.cb__paper）盖住，露出来只会
 *     和表单里的抬头打架；裁掉之后画面正好是「滚筒 + 机身 + 键盘」，
 *     与被替换掉的 CSS 平面画一致。
 *   下沿 -0.939、回车杆顶端 +0.953 —— 两头各留约 5% 余量，不会切到。
 *   最宽处是键盘前下角 |x| = 0.936 倍半宽（见下面的画幅宽高比）。
 */
const CAMERA_FOV = 30
const CAMERA_Z = 1.03
const MODEL_LIFT = 0.172

/**
 * 平面降级版打字机。
 *
 * 就是原来写在 ContactBoard 里的那段 CSS 矢量画，样式仍在 contact.css。
 * 不包一层 div：这些 span 要直接当 `.cb__machine` 的子节点，
 * `.cb__levers` / `.cb__bodyShell` 的负 margin 才叠得回去。
 */
function FlatTypewriter() {
  return (
    <>
      <span className="cb__roller">
        <i className="cb__knob cb__knob--l" />
        <i className="cb__knob cb__knob--r" />
      </span>
      <span className="cb__levers">
        <i />
        <i />
      </span>
      <span className="cb__bodyShell">
        <span className="cb__keys">
          {Array.from({ length: 3 }, (_, r) => (
            <span key={r} className="cb__keyRow">
              {Array.from({ length: r === 2 ? 11 : 12 }, (_, k) => (
                <i key={k} />
              ))}
            </span>
          ))}
          <span className="cb__space" />
        </span>
      </span>
    </>
  )
}

/**
 * frameloop="demand" 下 R3F 不会自己往下画第二帧。打字机是静止的，
 * 挂载后补一帧就够，之后这块画布对主线程零成本。
 */
function DrawOnce() {
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => invalidate(), [invalidate])
  return null
}

/**
 * 这块画布的灯。
 *
 * 方向沿用柜内场景那套（主光左上前方、右侧补光），但不共用
 * LightsAndShadows —— 它的强度和 ContactShadows 是按柜体调的。
 * 这里不开阴影：画面只有一个物件、没有地面，形体靠主光的方向感交代，
 * 省掉一张 shadow map。
 */
function MachineLights() {
  return (
    <>
      {/* 天空浅冷、地面偏暖，保证机身背光面不是死黑 */}
      <hemisphereLight args={['#eaf2fb', '#cfc6bd', 0.95]} />
      {/* 主光：左上前方，键帽和滚筒的高光落在左上 */}
      <directionalLight position={[-2.4, 3.2, 4.2]} intensity={2} />
      {/* 右侧补光：没有阴影就更不能让右半边掉进暗部 */}
      <directionalLight position={[3.4, 0.8, 3]} intensity={0.45} />
    </>
  )
}

/** CONTACT 浮层里的打字机；外层 `.cb__machine` 由 ContactBoard 提供 */
export default function ContactTypewriter() {
  const capabilities = useCapabilities()
  const [canvasFailed, setCanvasFailed] = useState(false)

  // 探测不到 WebGL、Save-Data、低性能设备或运行期丢上下文时都走平面版。
  // 首屏场景在同样的条件下也已经是静态版，两边保持一致。
  if (canvasFailed || !capabilities.webgl || capabilities.shouldFallback) {
    return <FlatTypewriter />
  }

  return (
    // Canvas 内部任何一次 suspend 都会把 <Canvas> 自己抛出去；不在这里接住，
    // 就会一路冒到 OverlayHost 那个 fallback={null} 的边界，整个浮层变空白。
    <Suspense fallback={<FlatTypewriter />}>
      <div className="cb__machineGl">
        <Canvas
          // R3F 会给根 div 写死 pointer-events: auto，把 .cb__machine 上的
          // none 覆盖掉。打字纸（.cb__paper）压在这块画布上面，必须还它 none，
          // 否则输入框和 TYPE NOTE 按钮会被画布吃掉点击。
          style={{ pointerEvents: 'none' }}
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ fov: CAMERA_FOV, near: 0.1, far: 4, position: [0, 0, CAMERA_Z] }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
            // 与首屏场景一致：不做色调映射，曝光完全由灯光强度决定，
            // 机身奶油色才和柜门里那台是同一个颜色
            toneMapping: NoToneMapping,
          }}
          fallback={<FlatTypewriter />}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault()
                setCanvasFailed(true)
              },
              { once: true },
            )
          }}
        >
          <MachineLights />
          {/* 模型里那张 CONTACT 抬头是运行期画到 canvas 上的贴图，
              万一某天它改成异步资源，这层 Suspense 保证画布本身不被挂起 */}
          <Suspense fallback={null}>
            <group position={[0, MODEL_LIFT, 0]}>
              <TypewriterModel />
            </group>
            {/* 放在 Suspense 里面：补的那一帧必须发生在模型真的挂上之后 */}
            <DrawOnce />
          </Suspense>
        </Canvas>
      </div>
    </Suspense>
  )
}
