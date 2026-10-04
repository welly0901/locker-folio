import { useMemo } from 'react'
import { listenMediaQuery, matchMediaQuery, useMediaQuery } from './useMediaQuery'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 用户是否要求减少动效。
 *
 * 会持续监听 media query 的变化（系统设置可以在运行中被改动），
 * 不是只在挂载时读一次。
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY)
}

/** 一次性读取，供 store、时间线等非 React 代码使用 */
export function prefersReducedMotion(): boolean {
  return matchMediaQuery(REDUCED_MOTION_QUERY)
}

/** 订阅偏好变化，返回取消订阅函数 */
export function onReducedMotionChange(onChange: () => void): () => void {
  return listenMediaQuery(REDUCED_MOTION_QUERY, onChange)
}

/** 纯函数：Reduced Motion 下把时长压到 0，其余原样返回 */
export function motionDuration(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms
}

/**
 * 等待一段动画时间。
 *
 * - `reduced` 为 true 时立即完成，不排定时器，真正跳过等待
 *   （Reduced Motion 下不保留 Loader、Reveal 或 animation-delay 的空等待）。
 * - 传入 `signal` 可以被中断；resolve 的布尔值表示是否正常走完，
 *   `false` 代表被中断，调用方据此放弃后续步骤即可，不必 try/catch。
 */
export function waitFor(
  ms: number,
  options?: { reduced?: boolean; signal?: AbortSignal },
): Promise<boolean> {
  const reduced = options?.reduced ?? prefersReducedMotion()
  const signal = options?.signal
  if (signal?.aborted) return Promise.resolve(false)
  const delay = motionDuration(ms, reduced)
  if (delay <= 0) return Promise.resolve(true)

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, delay)
    function onAbort() {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export type MotionTiming = {
  /** 当前是否处于 Reduced Motion */
  reduced: boolean
  /** 动画时长（毫秒），Reduced Motion 下为 0 */
  duration: (ms: number) => number
  /** 动画时长（CSS 字符串），可直接写进 style */
  cssDuration: (ms: number) => string
  /** 等待一段动画时间，Reduced Motion 下立即完成 */
  wait: (ms: number, signal?: AbortSignal) => Promise<boolean>
}

/**
 * 组件内使用的计时器集合。返回对象在偏好不变时保持引用稳定，
 * 可以安全放进 useEffect 依赖。
 *
 * ```tsx
 * const motion = useMotionTiming()
 * useEffect(() => {
 *   const ac = new AbortController()
 *   void (async () => {
 *     if (!(await motion.wait(1200, ac.signal))) return
 *     setStage('opened')
 *   })()
 *   return () => ac.abort()
 * }, [motion])
 * ```
 */
export function useMotionTiming(): MotionTiming {
  const reduced = useReducedMotion()
  return useMemo<MotionTiming>(
    () => ({
      reduced,
      duration: (ms) => motionDuration(ms, reduced),
      cssDuration: (ms) => `${motionDuration(ms, reduced)}ms`,
      wait: (ms, signal) => waitFor(ms, { reduced, signal }),
    }),
    [reduced],
  )
}
