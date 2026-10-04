/* ============================================================================
 * 相机路径
 *
 * 每个关键帧都是从 参考画面 的对应帧上解算出来的机位，不是手调的。
 * 解算方法见 sceneConfig.ts 顶部；解算是在「柜体背面平面 z=0」的坐标系里
 * 做的，这里已经统一减掉 D/2 = 0.27，换算到「柜体底面中心为原点」。
 *
 * 时间原点 t=0 = 揭幕层播完（参考参考 1.77s），与 experienceTimeline 一致。
 * ========================================================================== */

import { AUTOFOCUS_ARRIVE, AUTOFOCUS_START } from '../experience/experienceTimeline'
import { REFERENCE_ASPECT } from './sceneConfig'

/** 一组相机位姿：世界坐标的机位与注视点 */
export type CameraPose = {
  pos: readonly [number, number, number]
  target: readonly [number, number, number]
}

export type PoseKey = CameraPose & { at: number }

const TZ = -0.27

/**
 * approach 段的机位关键帧。
 *
 * 1190 这一帧最初用轮廓角点解，得到方位角 −19.3°，
 * 结果柜壳外轮廓对得上、柜内竖线却整体偏右 18px ——
 * 轮廓角点在小偏航下几乎不含约束，方位角和距离可以互相补偿。
 * 改用**前平面上的竖线与横线**（门缝、立柱、门顶、底座）重解后
 * 方位角是 −10.0°，同一套方法在开门帧上自检 rms 0.96px、
 * 也复现出了同一个落位机位，说明方法本身是对的。
 *
 * | 时间线 | 参考 | 解算残差 |
 * |---|---|---|
 * | 0     | 1.77s | 由 1.90/2.00 两帧外推 |
 * | 130   | 1.90s | rms 0.75px |
 * | 230   | 2.00s | 联合拟合 rms 0.87px |
 * | 430   | 2.20s | 同上 |
 * | 630   | 2.40s | 同上 |
 * | 830   | 2.60s | 同上 |
 * | 1190  | 2.96s | rms 2.77px（用前平面竖线/横线重解，见下） |
 * | 1590  | 3.36s | rms 0.72px，落位 |
 *
 * 起手机位在柜体**左前上方**：方位角 −49°、仰角 +27°，
 * 所以画面里看得到柜体的左侧面和顶面，与参考一致。
 */
export const APPROACH_KEYS: readonly PoseKey[] = [
  { at: 0, pos: [-9.35, 7.66, 8.16], target: [0.44, 1.0, TZ] },
  { at: 130, pos: [-9.209, 7.551, 8.121], target: [0.435, 1.004, TZ] },
  { at: 230, pos: [-8.908, 7.348, 8.05], target: [0.446, 1.008, TZ] },
  { at: 430, pos: [-7.964, 6.607, 7.952], target: [0.396, 1.049, TZ] },
  { at: 630, pos: [-6.504, 5.455, 7.663], target: [0.325, 1.107, TZ] },
  { at: 830, pos: [-4.311, 4.019, 7.379], target: [0.219, 1.183, TZ] },
  { at: 1190, pos: [-1.264, 2.263, 7.167], target: [0.053, 1.295, TZ] },
  { at: 1590, pos: [0, 1.577, 7.017], target: [0, 1.337, TZ] },
]

/** 落位后的宽景机位 = approach 的最后一个关键帧 */
export const WIDE_POSE: CameraPose = APPROACH_KEYS[APPROACH_KEYS.length - 1]

/** approach 段结束的时刻 */
export const APPROACH_LAST = APPROACH_KEYS[APPROACH_KEYS.length - 1].at

/**
 * 无输入自动推近 About 的终点机位。
 *
 * 从 4.76s 那一帧解出来的。这一帧里柜体已经被视口上下裁掉，
 * 能用的只有前平面上的竖线和几条横线，所以沿用上一轮的判据（不用轮廓角点）：
 *
 * | 约束 | 世界量 | 实测屏幕 | 残差 |
 * |---|---|---|---|
 * | bay1\|bay2 立柱左右沿 | x=−1.0195 / −0.9695（z=0.27）| 329 / 342 | −4.8 / −1.3 |
 * | bay3\|bay4 立柱左右沿 | x=+0.9695 / +1.0195 | 973 / 986 | +2.4 / +5.6 |
 * | bay4 开口右沿 / 柜体右外沿 | x=1.964 / 2.0 | 1298 / 1312 | −0.9 / −3.3 |
 * | 门铰链边 / 自由边 | 135° 下的两条竖棱 | 636 / 900 | +8.3 / −5.2 |
 * | 上层 / 中层隔板前沿 | y=2.175 / 1.303（z=0.2）| 89 / 376 | +1.6 / −2.9 |
 * | bay4 把手上下沿 | y=1.386 / 0.964 | 348 / 486 | +0.4 / +0.8 |
 *
 * 5 个未知量（机位 xyz + 偏航 + 俯仰）对 12 条约束做最小二乘：
 * **rms 3.88px、最大 8.32px**（画幅 1320×724），远小于 3% 的容差。
 * 解出偏航 +0.99°、俯仰 −3.42° —— 几乎正对，就是一次纯推近。
 *
 * 门那两条的残差（+8.3 / −5.2）方向相反，说明这一帧反解出来的门角比 135°
 * 略大（按同一台相机反解约 140°）。早先是在开门帧上用三条独立量法定的
 * 135°±3°，那一帧门离相机更远、透视放大更小，测量更可靠，所以**不据此改门角**；
 * 13px 的差落在门面投影宽 5% 的容差内（152px × 5% = 7.6px，两条各占一半）。
 */
export const ABOUT_POSE: CameraPose = {
  pos: [-0.074, 1.605, 4.656],
  target: [0.012, 1.31, TZ],
}

/* ── 插值 ─────────────────────────────────────────────────── */

/** 非均匀 Catmull-Rom：用相邻关键帧的有限差分做切线，保证经过每个关键帧 */
function hermite(p0: number, p1: number, m0: number, m1: number, s: number, h: number): number {
  const s2 = s * s
  const s3 = s2 * s
  return (
    (2 * s3 - 3 * s2 + 1) * p0 +
    (s3 - 2 * s2 + s) * h * m0 +
    (-2 * s3 + 3 * s2) * p1 +
    (s3 - s2) * h * m1
  )
}

function tangent(keys: readonly PoseKey[], i: number, pick: (k: PoseKey) => number): number {
  const prev = keys[Math.max(0, i - 1)]
  const next = keys[Math.min(keys.length - 1, i + 1)]
  const dt = next.at - prev.at
  return dt === 0 ? 0 : (pick(next) - pick(prev)) / dt
}

const OUT: { pos: [number, number, number]; target: [number, number, number] } = {
  pos: [0, 0, 0],
  target: [0, 0, 0],
}

/**
 * 取某个时刻的机位。时间在范围外时钳到首尾关键帧，
 * 所以 reveal 阶段（t<0）柜体就已经稳稳停在 approach 起手姿态上 ——
 * 参考里方格还没散完柜体就已经在画面里了，不能等散完再淡入。
 */
export function poseAt(ms: number, keys: readonly PoseKey[] = APPROACH_KEYS): CameraPose {
  if (ms <= keys[0].at) return keys[0]
  const last = keys[keys.length - 1]
  if (ms >= last.at) return last

  let i = 0
  while (i < keys.length - 2 && ms > keys[i + 1].at) i += 1
  const a = keys[i]
  const b = keys[i + 1]
  const h = b.at - a.at
  const s = (ms - a.at) / h

  for (let c = 0; c < 3; c += 1) {
    OUT.pos[c] = hermite(
      a.pos[c],
      b.pos[c],
      tangent(keys, i, (k) => k.pos[c]),
      tangent(keys, i + 1, (k) => k.pos[c]),
      s,
      h,
    )
    OUT.target[c] = hermite(
      a.target[c],
      b.target[c],
      tangent(keys, i, (k) => k.target[c]),
      tangent(keys, i + 1, (k) => k.target[c]),
      s,
      h,
    )
  }
  return OUT
}

/* ── 开场主镜头 ───────────────────────────────────────────── */

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

const AUTO: { pos: [number, number, number]; target: [number, number, number] } = {
  pos: [0, 0, 0],
  target: [0, 0, 0],
}

/**
 * 开场任意时刻的机位 —— 相机在整条开场时间线上**只有这一个来源**。
 *
 * 两段拼起来：
 *   t ≤ AUTOFOCUS_START  走 approach 的关键帧曲线（标定）
 *   之后                  从宽景平滑推到 ABOUT_POSE，到位后停住
 *
 * 停住这段是有依据的，不是偷懒：4.76s 和 5.56s 两处的边缘位置
 * 逐条对比都在 1px 以内，参考在 4.76s 就已经推到位了。
 */
export function introPose(ms: number): CameraPose {
  if (ms <= AUTOFOCUS_START) return poseAt(ms)
  const u = Math.min(1, (ms - AUTOFOCUS_START) / (AUTOFOCUS_ARRIVE - AUTOFOCUS_START))
  const e = easeInOutCubic(u)
  for (let c = 0; c < 3; c += 1) {
    AUTO.pos[c] = WIDE_POSE.pos[c] + (ABOUT_POSE.pos[c] - WIDE_POSE.pos[c]) * e
    AUTO.target[c] = WIDE_POSE.target[c] + (ABOUT_POSE.target[c] - WIDE_POSE.target[c]) * e
  }
  return AUTO
}

/**
 * 稳定态机位 —— 开场跑完之后镜头停在哪。
 *
 * 就是自动推近的终点：参考里 4.76s 推到位后一直停到 6.40s 第一次点击，
 * 所以「稳定态」不是宽景，而是 About 近景。浮层关闭后的返回目标也是它。
 */
export function restPose(): CameraPose {
  return ABOUT_POSE
}

/**
 * 窄画幅补偿。
 *
 * 标定画幅是 1320×724（宽高比 1.823）。视口更窄时如果只保持垂直 FOV，
 * 柜体左右会被切掉，所以按宽高比把机位整体后撤，保证水平构图不丢内容。
 * 视口更宽时不动，多出来的宽度让给背景 —— 与参考一致。
 */
export function distanceScaleFor(aspect: number): number {
  return aspect >= REFERENCE_ASPECT ? 1 : REFERENCE_ASPECT / aspect
}
