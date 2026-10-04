/* ============================================================================
 * 首屏主时间线
 *
 * 全站**唯一**的开场时序来源。相机、柜门、物件批次、热点启用时机
 * 都从这里取时刻，CSS 里不再保留任何 animation-delay，JS 里也不再有
 * 拼接用的 setTimeout。
 *
 * 时间原点 t=0 定义为**揭幕层播完的那一刻**。
 * 参考参考里这一刻是 1.77s，所以下面每个时刻 = 参考时间 − 1.77s。
 *
 * 参考里实测（参考画面）：
 *   2.00s 小比例闭柜（t=0.23）   2.60s 四门仍全关（t=0.83）
 *   2.96s 门已过 90°（t=1.19）   3.36s 门到位（t=1.59）
 *   3.76s 文件盒/背包/吉他入场（t=1.99）
 *   4.16s 全部落位（t=2.39）     6.40s 自动推近结束（t=4.63）
 * ========================================================================== */

import type { SceneEvent } from './experienceMachine'

/** 一条时间线事件：到达 `at`（毫秒）时向状态机投递 `event` */
export type TimelineCue = { at: number; event: SceneEvent }

/** 相机 approach 段：从小比例斜视闭柜旋正推近到宽景 */
export const APPROACH_START = 0
export const APPROACH_END = 1230

/** 柜门段：0° → 终点角，参考参考 2.60s 起、3.40s 到位 */
export const DOOR_START = 830
export const DOOR_END = 1630

/**
 * 物件四个批次的时间窗。
 *
 * 每一批的边界都由参考帧卡死，具体到每件物件的起止写在 scene/propSpecs.ts：
 *   t=1190 只有寻字板与打字机  t=1590 加书/唱片机/背包
 *   t=1990 加文件盒与吉他      t=2390 全部落位
 */
export const PROPS_START = 860
export const PROPS_END = 2390

/**
 * 无输入自动推近 About。
 *
 * 三个时刻分工不同，别混：
 *   `AUTOFOCUS_START` 相机开始动    —— 4.16s 还是宽景，所以在它之后
 *   `AUTOFOCUS_ARRIVE` 相机到位      —— 4.76s 已经停在近景
 *   `AUTOFOCUS_END`   状态机推进到 idle
 *
 * 参考的推近 4.76s 就已经到位（4.76s 与 5.56s 两处的边缘检测 —— 柜位立柱、
 * 门缝、bay4 把手 —— 逐条对比全部落在 1px 以内，整帧灰度平均绝对差只有 3.35，
 * 差异来自鼠标指针和贴纸微动），之后是**停住等用户操作**。
 *
 * AUTOFOCUS_END 曾经定在 4630（对齐参考里 6.40s 的首次点击）。那是错的：
 * 6.40s 是原片里**那个人**碰巧何时点了一下，不是交互该何时可用。相机 2990
 * 到位后画面完全静止，而热点与拖拽要等到 4630 才开——中间 1.64s 里用户
 * 看着一幅静止的画面却点不动任何东西。交互开关应当跟着相机走，不跟着
 * 参考的鼠标走，所以收在到位后 120ms（留一点收尾余量）。
 */
export const AUTOFOCUS_START = 2420
export const AUTOFOCUS_ARRIVE = 2990
export const AUTOFOCUS_END = AUTOFOCUS_ARRIVE + 120

/**
 * 状态机在开场序列里的推进节点。
 *
 * 注意：这些时刻是**状态边界**（决定当前允许什么输入），
 * 不等于视觉动画的起止 —— 视觉是多轨叠加的，比如第一批物件
 * 在 opening 状态里就已经开始出现了，和参考一致。
 */
export const INTRO_EVENTS: readonly TimelineCue[] = [
  { at: DOOR_START, event: { type: 'APPROACH_DONE' } },
  { at: DOOR_END, event: { type: 'DOOR_DONE' } },
  { at: PROPS_END, event: { type: 'PROPS_DONE' } },
  { at: AUTOFOCUS_END, event: { type: 'AUTOFOCUS_DONE' } },
]

/** 开场序列的总长度：自动推近结束的时刻 */
export const INTRO_END = AUTOFOCUS_END

/**
 * 开发期整体放慢倍数：`?slow=6` 把开场拉长 6 倍，方便逐帧核对。
 * 生产环境永远返回 1。
 */
export function introTimeScale(): number {
  if (!import.meta.env.DEV || typeof location === 'undefined') return 1
  const n = Number(new URLSearchParams(location.search).get('slow'))
  return Number.isFinite(n) && n > 0 ? n : 1
}
