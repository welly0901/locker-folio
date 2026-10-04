/**
 * 静态降级模块。
 *
 * 本模块自成一体，不引用 App / store / Scene，可以在任何位置挂载。
 * 场景层接入方式：
 *
 * ```tsx
 * import { useCapabilities, forceFallback, StaticFallback } from './components/fallback'
 *
 * function Hero() {
 *   const caps = useCapabilities()
 *   const openOverlay = useStore((s) => s.openOverlay)
 *   const overlay = useStore((s) => s.overlay)
 *
 *   if (caps.shouldFallback) {
 *     return (
 *       <StaticFallback
 *         reason={caps.reason}
 *         image={STATIC_HERO_IMAGE}   // 预渲染图就绪后传入，缺省会显示占位块
 *         activeId={overlay}
 *         onSelect={(id) => openOverlay(id)}
 *       />
 *     )
 *   }
 *
 *   // WebGL context 创建失败 / 丢失且重建失败时，切到静态版本
 *   return <HeroSceneCanvas onUnrecoverable={() => forceFallback('context-lost')} />
 * }
 * ```
 *
 * 调试：URL 加 `?fallback=1` 强制走静态版本，`?fallback=0` 强制走 3D 版本。
 */

export { default as StaticFallback } from './StaticFallback'
export type { NavId, StaticFallbackProps } from './StaticFallback'
export {
  FALLBACK_REASON_TEXT,
  clearForcedFallback,
  forceFallback,
  getCapabilities,
  refreshCapabilities,
  useCapabilities,
} from './capabilities'
export type { Capabilities, FallbackReason } from './capabilities'
