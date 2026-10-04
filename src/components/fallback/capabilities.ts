import { useSyncExternalStore } from 'react'

/**
 * 降级检测。
 *
 * 判定「是否应当放弃 3D 场景、落到静态 fallback」，并给出原因。
 * 本模块不依赖 store 和 App，可以在任何地方单独引用。
 */

export type FallbackReason =
  /** 拿不到任何 WebGL 上下文 */
  | 'no-webgl'
  /** 运行期 context 创建失败 / context lost，由场景层显式上报 */
  | 'context-lost'
  /** 用户开启了流量节省 */
  | 'save-data'
  /** deviceMemory / hardwareConcurrency 粗判为低性能设备 */
  | 'low-device'
  /** ?fallback=1 或代码显式强制（调试、开发） */
  | 'forced'

export type Capabilities = {
  /** WebGL1 或 WebGL2 至少有一个可用 */
  webgl: boolean
  webgl2: boolean
  saveData: boolean
  /** navigator.deviceMemory（GB），不支持时为 null */
  deviceMemory: number | null
  /** navigator.hardwareConcurrency，不支持时为 null */
  hardwareConcurrency: number | null
  /** 粗判低性能设备 */
  lowDevice: boolean
  /** 综合结论：是否应当走静态降级 */
  shouldFallback: boolean
  /** 触发降级的首要原因；不降级时为 null */
  reason: FallbackReason | null
}

type NavigatorLike = Navigator & {
  connection?: { saveData?: boolean }
  deviceMemory?: number
}

/* ── URL 覆盖：?fallback=1 强制降级，?fallback=0 强制禁用降级 ── */

function readUrlOverride(): boolean | null {
  if (typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('fallback')
  if (raw === null) return null
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'on') return true
  if (raw === '0' || raw === 'false' || raw === 'off') return false
  return null
}

/* ── 探测 ─────────────────────────────────────────────── */

/**
 * 探测 WebGL 是否真的可用。
 * 只探测一次并缓存：创建上下文本身有成本，反复创建会挤占 GPU 资源。
 * 探测用的上下文会立刻通过 WEBGL_lose_context 释放。
 */
function probeWebGL(): { webgl: boolean; webgl2: boolean } {
  if (typeof document === 'undefined') return { webgl: false, webgl2: false }
  try {
    const canvas = document.createElement('canvas')
    const attrs: WebGLContextAttributes = { failIfMajorPerformanceCaveat: false }
    const gl2 = canvas.getContext('webgl2', attrs)
    const gl = gl2 ?? canvas.getContext('webgl', attrs)
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context') as WEBGL_lose_context | null
      ext?.loseContext()
    }
    return { webgl: gl !== null, webgl2: gl2 !== null }
  } catch {
    return { webgl: false, webgl2: false }
  }
}

function computeCapabilities(): Capabilities {
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as NavigatorLike | undefined
  const { webgl, webgl2 } = probeWebGL()
  const saveData = nav?.connection?.saveData === true
  const deviceMemory = typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : null
  const hardwareConcurrency =
    typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null

  // 粗判：内存 ≤2GB 或逻辑核心 ≤2 视为低性能。
  // 保守取值，宁可少降级，也不要把中端机误判成低端机。
  const lowDevice =
    (deviceMemory !== null && deviceMemory <= 2) ||
    (hardwareConcurrency !== null && hardwareConcurrency <= 2)

  const override = readUrlOverride()
  let reason: FallbackReason | null = null
  if (override === true) reason = 'forced'
  else if (forcedReason !== null) reason = forcedReason
  else if (!webgl) reason = 'no-webgl'
  else if (saveData) reason = 'save-data'
  else if (lowDevice) reason = 'low-device'

  // ?fallback=0 用于调试：即使命中上面任一条件也强行走 3D 路径
  if (override === false) reason = null

  return {
    webgl,
    webgl2,
    saveData,
    deviceMemory,
    hardwareConcurrency,
    lowDevice,
    shouldFallback: reason !== null,
    reason,
  }
}

/* ── 快照与订阅 ───────────────────────────────────────── */

let forcedReason: FallbackReason | null = null
let snapshot: Capabilities | null = null
const listeners = new Set<() => void>()

const SERVER_SNAPSHOT: Capabilities = {
  webgl: true,
  webgl2: true,
  saveData: false,
  deviceMemory: null,
  hardwareConcurrency: null,
  lowDevice: false,
  shouldFallback: false,
  reason: null,
}

/** 读取（并缓存）当前能力快照。返回值引用稳定，可直接比较。 */
export function getCapabilities(): Capabilities {
  snapshot ??= computeCapabilities()
  return snapshot
}

/** 丢弃缓存并通知订阅者重新读取 */
export function refreshCapabilities(): Capabilities {
  snapshot = null
  const next = getCapabilities()
  for (const fn of listeners) fn()
  return next
}

/**
 * 场景层在运行期发现 WebGL 不可用时调用，例如：
 * - `<Canvas onError>` / `webglcontextcreationerror`
 * - `webglcontextlost` 且安全重建失败
 */
export function forceFallback(reason: FallbackReason = 'context-lost'): void {
  if (forcedReason === reason) return
  forcedReason = reason
  refreshCapabilities()
}

/** 撤销强制降级（例如 context 成功恢复） */
export function clearForcedFallback(): void {
  if (forcedReason === null) return
  forcedReason = null
  refreshCapabilities()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/**
 * 组件内读取能力快照。forceFallback / refreshCapabilities 会触发重渲染。
 *
 * ```tsx
 * const caps = useCapabilities()
 * return caps.shouldFallback ? <StaticFallback reason={caps.reason} /> : <HeroSceneCanvas />
 * ```
 */
export function useCapabilities(): Capabilities {
  return useSyncExternalStore(subscribe, getCapabilities, getServerSnapshot)
}

function getServerSnapshot(): Capabilities {
  return SERVER_SNAPSHOT
}

/** 降级原因的中文说明，供 fallback 界面直接展示 */
export const FALLBACK_REASON_TEXT: Record<FallbackReason, string> = {
  'no-webgl': '当前浏览器不支持 WebGL',
  'context-lost': '3D 渲染上下文创建失败',
  'save-data': '已开启流量节省模式',
  'low-device': '设备性能不足以流畅运行 3D 场景',
  forced: '已手动切换到静态版本',
}
