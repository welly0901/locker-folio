import { useCallback, useSyncExternalStore } from 'react'

/**
 * 订阅一条 media query 并在其变化时重渲染。
 *
 * 用 useSyncExternalStore 而不是 useEffect + useState，
 * 保证首帧读到的就是真实值，不会先渲染一帧错误的分支。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => listenMediaQuery(query, onChange),
    [query],
  )
  const getSnapshot = useCallback(() => matchMediaQuery(query), [query])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** 一次性读取，供非 React 代码使用；环境不支持时返回 false */
export function matchMediaQuery(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/** 订阅一条 media query 的变化，返回取消订阅函数 */
export function listenMediaQuery(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return noop
  const mql = window.matchMedia(query)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getServerSnapshot() {
  return false
}

function noop() {}
