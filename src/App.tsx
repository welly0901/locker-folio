import { lazy, Suspense, useEffect } from 'react'
import Loader from './components/Loader'
import Reveal from './components/Reveal'
import Nav from './components/Nav'
import OverlayHost from './components/overlays/OverlayHost'
import { StaticFallback, useCapabilities } from './components/fallback'
import ExperienceOrchestrator from './experience/ExperienceOrchestrator'
import { useStore } from './store'

/**
 * three + R3F 有 240KB gzip，独立成 chunk，绝不进主包。
 *
 * `lazy` 只有在真正渲染到它时才发起 import，而它要等 Loader 走完
 * phase 切到 scene 才被渲染 —— 于是「下载解析 904KB 的 three」和
 * 「加载首屏图片」变成串行，实测在 t0+1.5s 处有 384ms 的主线程长停顿。
 * 这里在模块求值时就把 import 发出去（**只是预热，不渲染**），
 * chunk 的下载解析和 Loader 的资源加载并行跑，长停顿被摊掉。
 */
const heroChunk = () => import('./scene/HeroSceneCanvas')
const HeroSceneCanvas = lazy(heroChunk)
void heroChunk()

export default function App() {
  const phase = useStore((s) => s.phase)
  const send = useStore((s) => s.send)
  const overlay = useStore((s) => s.overlay)
  const openOverlay = useStore((s) => s.openOverlay)
  const caps = useCapabilities()
  const showScene = phase !== 'loading'

  /*
   * 静态降级分支不跑 Loader / 揭幕 / 开场，但状态机不能停在 `loading` ——
   * `REQUEST_OVERLAY` 在场景不可见时是被忽略的，四个入口会点不开。
   * 这里把它一次性推到「静态开柜」这个稳定态，语义上正好对应静态版本。
   */
  useEffect(() => {
    if (!caps.shouldFallback) return
    useStore.getState().setPhase('scene')
  }, [caps.shouldFallback])

  // 开发期直达：/?v=about&w=design
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const q = new URLSearchParams(location.search)
    const v = q.get('v')
    if (!v) return
    const st = useStore.getState()
    st.setPhase('scene')
    st.openOverlay(v as never)
    const w = q.get('w')
    if (w) setTimeout(() => useStore.getState().setWorkView(w as never), 60)
  }, [])

  /*
   * 无 WebGL / Save-Data / 低性能设备走静态版本。
   * 判到降级就完全不挂 Canvas —— 这些设备上连创建上下文都可能失败，
   * 挂上去只会得到一块空白画布，正是降级要避免的。
   * 内容浮层和导航照常可用，所以四个入口一个都不少。
   */
  if (caps.shouldFallback) {
    return (
      <div className="stage">
        <StaticFallback
          reason={caps.reason}
          activeId={overlay}
          onSelect={(id) => openOverlay(id)}
        />
        <OverlayHost />
      </div>
    )
  }

  return (
    <div className="stage">
      {/* 场景状态机的时钟与 Reduced Motion 同步：不渲染任何东西 */}
      <ExperienceOrchestrator />
      {showScene && (
        <Suspense fallback={null}>
          <HeroSceneCanvas />
        </Suspense>
      )}
      {phase === 'scene' && <Nav />}

      {/* 四个浮层的统一宿主：dialog 语义、背景 inert、focus trap、
          退出动画播完才卸载、焦点归还，全部在 OverlayHost 内部完成 */}
      <OverlayHost />

      {/* Loader / Reveal 直接把完成事件投给状态机。
          不能再走 store 的 setPhase 兼容层 —— 那条路里 'scene' 会连发
          ASSETS_READY + REVEAL_DONE + SKIP_INTRO，最后一发直接把开场跳过。
          开发期直达 ?v= 仍然走兼容层，那种场合本来就该跳过开场。 */}
      {phase === 'loading' && <Loader onReady={() => send({ type: 'ASSETS_READY' })} />}
      {phase === 'reveal' && <Reveal onDone={() => send({ type: 'REVEAL_DONE' })} />}
    </div>
  )
}
