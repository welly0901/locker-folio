import { useEffect, useRef, useState } from 'react'
import type { Overlay } from '../../store'

/**
 * 浮层生命周期阶段。
 * 对应状态机的 overlayOpening / overlayOpen / overlayClosing 三态。
 * 目前先落在 OverlayHost 的局部状态里，等首屏状态机稳定后再决定是否上提到 store。
 */
export type OverlayPhase = 'opening' | 'open' | 'closing'

/** 进入动画时长：与各浮层自身的入场动画对齐 */
export const OVERLAY_ENTER_MS = 420
/** 退出动画时长：与 overlay.css 里的 ovhOut 对齐；播完才允许卸载 */
export const OVERLAY_EXIT_MS = 300

type Lifecycle = { active: Overlay; phase: OverlayPhase }

function next(prev: Lifecycle, overlay: Overlay, reduced: boolean): Lifecycle {
  if (overlay) {
    // 同一个浮层且不在退出中：保持原状，避免重复播放入场
    if (prev.active === overlay && prev.phase !== 'closing') return prev
    return { active: overlay, phase: reduced ? 'open' : 'opening' }
  }
  if (!prev.active) return prev
  if (reduced) return { active: null, phase: 'open' }
  if (prev.phase === 'closing') return prev
  return { active: prev.active, phase: 'closing' }
}

/**
 * 把 store 里的 `overlay`（只有 “哪一个 / 没有”）展开成可播放退出动画的三态。
 *
 * - store 从 null 变为某个浮层：挂载并进入 `opening`，动画结束后转 `open`
 * - store 变回 null：**不立刻卸载**，先进入 `closing`，退出动画播完才把 active 置空
 * - 关闭动画途中又被打开：直接取消 closing 重新进入 opening，不会出现残留遮罩
 * - Reduced Motion：不走任何定时器，直接落到 `open` 或直接卸载
 */
export function useOverlayLifecycle(overlay: Overlay, reduced: boolean) {
  const [state, setState] = useState<Lifecycle>(() => ({ active: overlay, phase: 'open' }))
  const [seen, setSeen] = useState<Overlay>(overlay)

  // 渲染期直接推导，避免先渲染一帧错误状态再由 effect 纠正
  if (seen !== overlay) {
    setSeen(overlay)
    const n = next(state, overlay, reduced)
    if (n !== state) setState(n)
  }

  // 动画计时：opening → open；closing → 卸载
  useEffect(() => {
    if (!state.active || state.phase === 'open' || reduced) return
    const ms = state.phase === 'opening' ? OVERLAY_ENTER_MS : OVERLAY_EXIT_MS
    const id = window.setTimeout(() => {
      setState((s) => {
        if (s.phase === 'opening') return { active: s.active, phase: 'open' }
        if (s.phase === 'closing') return { active: null, phase: 'open' }
        return s
      })
    }, ms)
    return () => window.clearTimeout(id)
  }, [state, reduced])

  return state
}

/** 在浮层真正卸载（active: 有 → null）的那一刻执行一次回调，用于焦点归还 */
export function useOnOverlayUnmounted(active: Overlay, run: () => void) {
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })
  const prev = useRef<Overlay>(active)
  useEffect(() => {
    if (prev.current && !active) runRef.current()
    prev.current = active
  }, [active])
}
