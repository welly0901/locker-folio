/**
 * 作品页共享帧调度器。
 *
 * 要点：
 * - 全站作品页只有一条 requestAnimationFrame 循环，拖拽与惯性共用它，不各起一个。
 * - 没有订阅者时循环立刻停止；订阅者回调返回 `false` 表示自己已经静止，会被自动摘掉。
 * - 页面 `visibilitychange` 隐藏时暂停，重新可见时以新的时间基准续跑，不会补帧。
 * - 高频指针数据由订阅方存在 ref 里，这里只负责“何时跑帧”，不碰任何全局状态。
 */

/** 帧回调；`dt` 为距上一帧的毫秒数（已钳制），返回 false 表示结束订阅 */
export type FrameFn = (dt: number) => boolean | void

const subs = new Set<FrameFn>()
let rafId = 0
let last = 0

/** 开发期自证用的计数器：静止时 frames 不应再增长 */
export type FrameStats = { frames: number; runs: number; subs: number; running: boolean }
const stats: FrameStats = { frames: 0, runs: 0, subs: 0, running: false }

if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __lfFrames: FrameStats }).__lfFrames = stats
}

function tick(now: number) {
  rafId = 0
  const dt = Math.min(64, now - last)
  last = now
  if (import.meta.env.DEV) stats.frames++

  for (const fn of subs) {
    let alive: boolean | void = false
    try {
      alive = fn(dt)
    } catch (err) {
      console.error('[frameLoop] 帧回调异常，已摘除', err)
    }
    if (alive === false) subs.delete(fn)
  }

  if (import.meta.env.DEV) stats.subs = subs.size
  if (subs.size > 0) schedule()
  else stop()
}

function schedule() {
  if (rafId || typeof document === 'undefined' || document.hidden) return
  rafId = requestAnimationFrame(tick)
  if (import.meta.env.DEV) stats.running = true
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  if (import.meta.env.DEV) stats.running = false
}

function onVisibility() {
  if (document.hidden) {
    stop()
  } else if (subs.size > 0) {
    last = performance.now()
    if (import.meta.env.DEV) stats.runs++
    schedule()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onVisibility)
}

/** 订阅帧循环；重复订阅同一个函数不会叠加 */
export function startFrames(fn: FrameFn) {
  if (subs.has(fn)) {
    schedule()
    return
  }
  if (subs.size === 0) {
    last = performance.now()
    if (import.meta.env.DEV) stats.runs++
  }
  subs.add(fn)
  if (import.meta.env.DEV) stats.subs = subs.size
  schedule()
}

/** 退订；最后一个订阅者离开时循环随之停止 */
export function stopFrames(fn: FrameFn) {
  subs.delete(fn)
  if (import.meta.env.DEV) stats.subs = subs.size
  if (subs.size === 0) stop()
}

/** 当前是否有帧在跑（测试与自证用） */
export function framesRunning() {
  return rafId !== 0
}
