/* ============================================================================
 * 开场时钟
 *
 * 主时间线只有**一个**时间源。相机、柜门、物件批次都从这里读同一个 `ms`，
 * 不允许各自开 setTimeout 或 CSS animation-delay。
 *
 * 它故意不是 React state：时钟每帧都在变，写进 store 会把整棵场景树
 * 每帧重渲染一次。R3F 在 useFrame 里读这个模块级对象，
 * 只动 three 的对象，不触发 React 渲染。
 * ========================================================================== */

/** 时间原点：揭幕层播完的那一刻（参考参考 1.77s） */
const clock = { ms: 0, playing: false }

/** 开发期冻结：?t=1190 把开场定格在第 1190ms，用于逐帧比对参考帧 */
let frozen: number | null = null

export function readFrozenTime(): number | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('t')
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 初始化（挂载时调一次）：读开发期冻结参数 */
export function initIntroClock() {
  frozen = readFrozenTime()
  if (frozen !== null) clock.ms = frozen
}

/** 当前开场时间（毫秒） */
export function introTime(): number {
  return frozen ?? clock.ms
}

/** 时钟是否在走 */
export function introPlaying(): boolean {
  return frozen === null && clock.playing
}

export function setIntroPlaying(v: boolean) {
  clock.playing = frozen === null && v
}

/** 推进时钟。dt 已经在调用方做过卡帧截断 */
export function advanceIntro(dt: number) {
  if (frozen !== null) return
  clock.ms += dt
}

/** 跳到某个时刻（Reduced Motion 直接跳到终点、被打断时对齐状态） */
export function seekIntro(ms: number) {
  if (frozen !== null) return
  clock.ms = ms
}

/** 是否处在开发期冻结模式 */
export function isIntroFrozen(): boolean {
  return frozen !== null
}
