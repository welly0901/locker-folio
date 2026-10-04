/* ============================================================================
 * 热点动作总线
 *
 * 为什么要这么一层：ABOUT 这个入口是**一张既能点又能拖的贴花**。
 * 命中它的射线可能落在两个不同的 mesh 上 ——
 *   · 贴花本体（InstancedMesh，负责拖拽，尺寸贴着轮廓）
 *   · 热点命中框（放大一圈的不可见平面，负责好点）
 * 两边都要能触发同一个入口、同一套反馈，又不能互相持有对方的引用。
 * 所以做成一张按 id 索引的小注册表，谁先拿到指针谁调用。
 *
 * 它不是状态，只是回调登记处，所以是模块级的：这些回调每帧都可能被
 * 射线命中查询，走 React state 会把整棵场景树重渲染。
 * ========================================================================== */

import { useStore } from '../store'
import { currentPose, flyTo, focusPoseFor } from './cameraDirector'
import type { HotspotId } from './hotspotSpecs'
import { releaseZoom } from './userZoom'

/** 局部镜头聚焦时长 */
export const FOCUS_MS = 620
/** 聚焦后目标占画面高度的比例。按参考近景反推约 0.50 */
export const FOCUS_FILL = 0.52

type Registration = {
  /** 命中框此刻的世界坐标（门在转时它也在动，所以是函数不是值） */
  anchor: () => [number, number, number]
  /** 目标在画面里希望占到的世界高度 */
  focusHeight: number
  /** 「从锚点指向机位」的世界方向；只有要求正对承载面的热点会给 */
  facing?: () => [number, number, number] | null
  /** 播一次扩散圆环 */
  pulse: () => void
  /** 设置 hover / focus 的可视状态 */
  setActive: (on: boolean) => void
}

const registry = new Map<HotspotId, Registration>()

/**
 * 可移动实体物件的实时锚点。
 *
 * skills / work / contact 不再是一张固定世界坐标的贴片：唱片机、文件盒和
 * 打字机都可以沿各自承载面移动。镜头聚焦必须读取物件此刻的位置，不能继续
 * 使用 hotspotSpecs 里的初始坐标。这里单独维护 getter，避免把每帧坐标写进
 * React / Zustand 导致整棵场景树重渲染。
 */
const movingAnchors = new Map<HotspotId, () => [number, number, number]>()

export function registerHotspot(id: HotspotId, reg: Registration): () => void {
  registry.set(id, reg)
  return () => {
    if (registry.get(id) === reg) registry.delete(id)
  }
}

export function registerHotspotAnchor(
  id: HotspotId,
  anchor: () => [number, number, number],
): () => void {
  movingAnchors.set(id, anchor)
  return () => {
    if (movingAnchors.get(id) === anchor) movingAnchors.delete(id)
  }
}

/** 仅返回实体物件注册的动态锚点；没有覆盖时由 Hotspot 自己使用 spec.at。 */
export function movingHotspotAnchor(id: HotspotId): [number, number, number] | null {
  return movingAnchors.get(id)?.() ?? null
}

/** 让某个热点进入 / 退出 hover 态。贴花本体被 hover 时也走这条路 */
export function setHotspotActive(id: HotspotId, on: boolean) {
  registry.get(id)?.setActive(on)
}

/**
 * 触发一个热点：扩散圆环 → 局部镜头聚焦 → 聚焦完成后浮层才挂载。
 *
 * 状态机的推进仍然只由完成事件驱动：这里只投 REQUEST_OVERLAY，
 * FOCUS_DONE 由镜头调度器落位时回调发出。
 */
export function activateHotspot(id: HotspotId) {
  const reg = registry.get(id)
  const st = useStore.getState()
  if (!st.scene) return
  reg?.pulse()
  st.openOverlay(id, 'hotspot')
  if (!reg) return
  // 聚焦机位是按「目标占画面多少比例」反算的，用户的缩放倍率再叠上去
  // 取景就不是标定的那个了。归位只改目标值，实际值由 stepZoom 在这段
  // 飞行时间里平滑追上来，看起来是一次连贯的推近，不是跳变。
  releaseZoom()
  const anchor = movingAnchors.get(id)?.() ?? reg.anchor()
  const to = focusPoseFor(
    anchor,
    reg.focusHeight,
    FOCUS_FILL,
    currentPose(),
    reg.facing?.() ?? null,
  )
  flyTo(currentPose(), to, FOCUS_MS, () => useStore.getState().send({ type: 'FOCUS_DONE' }))
}
