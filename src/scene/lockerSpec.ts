/* ============================================================================
 * 柜体尺寸规格
 *
 * 全部从 参考画面 上量出来。换算关系：
 *   落位帧里柜体外框横跨 232→1089px（857px = 4 单位）→ 水平 214.25 px/单位
 *   纵向 47→649px（602px = 2.822 单位）              → 垂直 213.3 px/单位
 *   世界 x = (屏幕x − 660.5) / 214.25
 *   世界 y = (649 − 屏幕y) / 213.3
 *
 * 每个数后面括号里是原始像素读数，方便换画幅或换素材时复核。
 * ========================================================================== */

import { BAY_COUNT, BACK_Z, FRONT_Z, LOCKER_H, LOCKER_W } from './sceneConfig'

/* ── 壳体 ─────────────────────────────────────────────────── */

/** 左右侧板的正面可见宽度（实测 231→239px = 8px） */
export const SIDE_T = 0.036
/** 顶盖厚度（实测 47→56.5px = 9.5px） */
export const CAP_T = 0.045
/** 顶盖向前出挑，形成门顶那道横向暗缝 */
export const CAP_OVERHANG = 0.03
/** 底座（踢脚）高度（实测 640→649px = 9px） */
export const PLINTH_H = 0.042
/** 背板厚度 */
export const BACK_T = 0.03
/** 柜位之间立柱的正面可见宽度（实测 447→457px ≈ 10px，取含缝的中值） */
export const DIVIDER_T = 0.05

/** 每个柜位的开口宽度（含门两侧的缝） */
export const BAY_PITCH = (LOCKER_W - 2 * SIDE_T - (BAY_COUNT - 1) * DIVIDER_T) / BAY_COUNT
/** 开口的左边缘 x（第 i 个柜位，i 从 0 起） */
export function bayLeft(i: number): number {
  return -LOCKER_W / 2 + SIDE_T + i * (BAY_PITCH + DIVIDER_T)
}
/** 开口中心 x */
export function bayCenter(i: number): number {
  return bayLeft(i) + BAY_PITCH / 2
}

/** 开口的上下沿 */
export const OPENING_TOP = LOCKER_H - CAP_T
export const OPENING_BOTTOM = PLINTH_H
export const OPENING_H = OPENING_TOP - OPENING_BOTTOM

/** 柜腔内表面：比开口再往里一点，避免和壳体面片打架 */
export const CAVITY_BACK_Z = BACK_Z + BACK_T

/* ── 柜门 ─────────────────────────────────────────────────── */

/** 门宽（实测 240→438px = 198px） */
export const DOOR_W = 0.924
/** 门高（实测 64.5→640px = 575.5px） */
export const DOOR_H = 2.698
/**
 * 门在开口里的位置：左边和下边基本贴合，右边（铰链侧）和上边各留一条缝。
 * 实测落位帧 bay1 门 240→438px、开口 239.6→442px，右侧那条 4px 的暗缝
 * 就是铰链侧的门缝；门顶到顶盖之间还有 8px 的横向暗缝。
 */
export const DOOR_HINGE_GAP = BAY_PITCH - DOOR_W
/** 门底的世界 y（实测与开口下沿齐平） */
export const DOOR_BOTTOM = OPENING_BOTTOM
/** 门顶到开口上沿的暗缝（实测 8px = 0.037） */
export const DOOR_TOP_GAP = 0.037
/** 门厚（实测自由边端面投影 797→809px，除掉透视放大 ≈ 0.05） */
export const DOOR_T = 0.05
/** 门外表面所在的 z：与柜体前平面齐平 */
export const DOOR_FRONT_Z = FRONT_Z
/** 门体中心 y */
export const DOOR_CY = OPENING_BOTTOM + DOOR_H / 2

/**
 * 铰链轴的世界 x：门右边缘，也就是开口右沿往里让出一条缝。
 * 实测落位帧门内侧的铰链边在屏幕 x=645（世界 −0.077）；
 * 门厚一半在 137° 下会把内侧面再往左推 0.017，反推转轴约 −0.06，
 * 与这里算出来的 −0.035 差 5px，在容差内。
 */
export function hingeX(i: number): number {
  return bayLeft(i) + DOOR_W
}

/* ── 门面细节 ─────────────────────────────────────────────── */

/** 通风槽组宽度（实测 307→369px = 63px） */
export const VENT_W = 0.294
/** 一组 5 条 */
export const VENT_SLATS = 5
/** 单条槽的高度与间隙（实测行距 15px、暗缝 4.5px） */
export const VENT_SLAT_H = 0.049
export const VENT_SLAT_GAP = 0.021
/** 通风槽组总高（5 条 + 4 道缝，实测 67px = 0.314） */
export const VENT_H = VENT_SLATS * VENT_SLAT_H + (VENT_SLATS - 1) * VENT_SLAT_GAP
/** 上下两组通风槽的中心，按「距门顶的比例」给（实测中心 y=156 / 579px） */
export const VENT_TOP_F = 0.159
export const VENT_BOTTOM_F = 0.894

/** 把手中心：距门左边缘 0.178、距门顶 0.580（实测中心 275, 398px） */
export const HANDLE_X_F = 0.178
export const HANDLE_Y_F = 0.58
/** 把手面板尺寸（实测 34×90px） */
export const HANDLE_W = 0.159
export const HANDLE_H = 0.422

/* ── 第 2 个柜位的隔板 ────────────────────────────────────── */

/** 隔板上表面的世界 y（实测屏幕 185 / 371px） */
export const SHELF_Y = [2.175, 1.303] as const
export const SHELF_T = 0.05

/** 前平面（柜门外表面）到相机方向的 z，供热点与贴花使用 */
export const DOOR_PLANE_Z = DOOR_FRONT_Z
