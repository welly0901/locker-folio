/* ============================================================================
 * 用户缩放（双指缩放 / 滚轮缩放）
 *
 * 没有这一层的话，自动推近走完、柜体占满画面之后就**再也退不回去**了。
 *
 * 为什么是「dolly 倍率」而不是一套自由相机：
 *   镜头有三个来源（显式 pose > 调度器 > 开场时间线），每一个都是标定过的
 *   绝对机位。如果让用户直接改机位，任何一次自动镜头都会把用户的操作抹掉，
 *   反过来用户一动就会把标定构图毁掉。改成「沿注视方向的标量倍率」之后，
 *   它和 `distanceScaleFor` 的窄屏补偿是同一种东西 —— 一个乘在半径上的系数，
 *   与机位来源正交，谁在驱动镜头都能叠加。
 *
 * 状态是模块级的，不是 React state：缩放每帧都在收敛，写进 store 会把整棵
 * 场景树每帧重渲染。UI 只订阅**目标值**的变化，那是离散的。
 * ========================================================================== */

/**
 * 缩放范围。1 = 标定机位。
 *
 * 上限盯着「退回落位宽景」这一个目标：稳定态 ABOUT_POSE 到注视点 4.936，
 * 落位宽景 WIDE_POSE 是 7.291，比值 1.477，取 1.55 留一点余量。
 *
 * 一开始放到 1.9，实测退得过头 —— 柜体缩成画面中间一小块，四周全是空地，
 * 既跑出了标定过的灯光范围，也不是「看全貌」想要的构图。
 * 这不是自由漫游，是「把自动推近撤销掉」，所以上限就应该停在宽景附近。
 *
 * 下限 0.55 对应比 About 近景再推近一倍，够看清工牌上的字，
 * 再近就会穿进门板的近裁剪面。
 */
export const ZOOM_MIN = 0.55
export const ZOOM_MAX = 1.55

/** 每一步按钮 / 一次滚轮刻度的乘性步长 */
const STEP = 1.16
/** 收敛速度：每秒把剩余差距消掉的比例 */
const LAMBDA = 11
/** 差距小于这个就算到位，避免永远差一点点导致一直续帧 */
const EPS = 0.0015

let value = 1
let goal = 1

const listeners = new Set<() => void>()

function clamp(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
}

function notify() {
  for (const l of listeners) l()
}

/** 订阅**目标值**的变化。目标只在用户输入时变，不是每帧 */
export function subscribeZoom(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 当前目标倍率（UI 读这个判断要不要显示「归位」） */
export function zoomGoal(): number {
  return goal
}

/** 此刻实际生效的倍率 */
export function zoomValue(): number {
  return value
}

/** 是否已经收敛。没收敛时 CameraRig 要继续续帧 */
export function zoomSettled(): boolean {
  return Math.abs(value - goal) < EPS
}

function setGoal(next: number) {
  const c = clamp(next)
  if (c === goal) return
  goal = c
  notify()
}

/** 乘性缩放。factor > 1 拉远，< 1 推近 */
export function zoomBy(factor: number) {
  setGoal(goal * factor)
}

/** 按一步。dir = +1 拉远，-1 推近 */
export function zoomStep(dir: 1 | -1) {
  zoomBy(dir > 0 ? STEP : 1 / STEP)
}

/** 回到标定机位 */
export function resetZoom() {
  setGoal(1)
}

/**
 * 立刻归位，不做过渡。
 *
 * 点热点进局部聚焦时用：聚焦机位是按「目标占画面多少比例」反算出来的，
 * 上面再叠一层用户倍率的话，取景就不是标定的那个了。但也不能硬跳 ——
 * 所以只把**目标**归 1，实际值仍由 step() 平滑追上去，
 * 和镜头飞行是同一段时间里并行收敛的，看起来就是一次连贯的推近。
 */
export function releaseZoom() {
  setGoal(1)
}

/**
 * 推进一帧，返回此刻该用的倍率。
 * 用与帧率无关的指数逼近，掉帧时收敛速度不变。
 */
export function stepZoom(dt: number): number {
  if (zoomSettled()) {
    value = goal
    return value
  }
  // 按需渲染模式下，静止一段时间后的第一帧 dt 就是「距上次渲染多久」——
  // 场景停了 5 秒的话 dt=5，exp(-55) 直接把倍率拍到目标上，滚轮一下就跳到底。
  // 截到 50ms（20fps 的一帧）之后，无论从多久的静止里醒来，第一帧都只走一小步。
  const step = Math.min(0.05, Math.max(0, dt))
  value += (goal - value) * (1 - Math.exp(-LAMBDA * step))
  return value
}

/** 测试用：把状态复位 */
export function _resetZoomStateForTest() {
  value = 1
  goal = 1
  listeners.clear()
}
