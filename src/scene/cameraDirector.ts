/* ============================================================================
 * 镜头调度
 *
 * 开场那条时间线由 `cameraPath.introPose()` 管到底。开场之后的镜头就不再是
 * 「时间的函数」了 —— 它取决于用户点了什么、什么时候点的，所以需要一个
 * 能被打断、能报告完成的调度器。
 *
 * 三条硬规则，和时钟一样：
 *   1. 模块级状态，不是 React state。镜头每帧都在动，写进 store 会把整棵
 *      场景树每帧重渲染。
 *   2. **从当前视觉状态出发**。被打断时新镜头的起点是「此刻画面上的机位」，
 *      不是某个预设起点，所以不会跳回去再飞。
 *   3. 完成时回调一次，由调用方投 FOCUS_DONE / RETURN_DONE 给状态机 ——
 *      状态推进永远由完成事件驱动，不由定时器。
 * ========================================================================== */

import type { CameraPose } from './cameraPath'
import { CAMERA_FOV } from './sceneConfig'

type Shot = {
  from: CameraPose
  to: CameraPose
  /** performance.now() 的起点 */
  t0: number
  dur: number
  done?: () => void
  fired: boolean
}

const OUT: { pos: [number, number, number]; target: [number, number, number] } = {
  pos: [0, 0, 0],
  target: [0, 0, 0],
}

let shot: Shot | null = null
/** 镜头飞完之后停在哪。null = 交还给开场时间线 */
let held: CameraPose | null = null

/**
 * 上一帧实际用掉的机位。
 * 打断时新镜头要从**此刻画面上的位置**起飞，所以 CameraRig 每帧回写一份，
 * 谁要发起新镜头就从这里取起点（「从当前视觉状态平滑转向目标」）。
 */
const current: { pos: [number, number, number]; target: [number, number, number] } = {
  pos: [0, 0, 0],
  target: [0, 0, 0],
}

export function noteCurrentPose(p: CameraPose) {
  for (let c = 0; c < 3; c += 1) {
    current.pos[c] = p.pos[c]
    current.target[c] = p.target[c]
  }
}

export function currentPose(): CameraPose {
  return current
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/** 复制一份，避免把 introPose 复用的那个可变对象存进 shot */
function clonePose(p: CameraPose): CameraPose {
  return { pos: [p.pos[0], p.pos[1], p.pos[2]], target: [p.target[0], p.target[1], p.target[2]] }
}

/**
 * 飞到某个机位。`from` 传当前**视觉上**的机位（调用方从每帧插值结果里取），
 * 这样中途改目标不会先跳回起点。
 */
export function flyTo(from: CameraPose, to: CameraPose, dur: number, done?: () => void) {
  shot = { from: clonePose(from), to: clonePose(to), t0: performance.now(), dur, done, fired: false }
  held = null
}

/** 放弃当前镜头任务，把控制权交回开场时间线 */
export function releaseCamera() {
  shot = null
  held = null
}

/** 调度器是否正在接管镜头 */
export function cameraDirected(): boolean {
  return shot !== null || held !== null
}

/**
 * 当前该用哪个机位。没有镜头任务时返回 null，由调用方回落到开场时间线。
 * 飞完之后返回终点机位并**保持**，直到 releaseCamera()。
 */
export function directedPose(now: number): CameraPose | null {
  if (!shot) return held
  const u = shot.dur <= 0 ? 1 : Math.min(1, (now - shot.t0) / shot.dur)
  const e = easeInOutCubic(u)
  for (let c = 0; c < 3; c += 1) {
    OUT.pos[c] = shot.from.pos[c] + (shot.to.pos[c] - shot.from.pos[c]) * e
    OUT.target[c] = shot.from.target[c] + (shot.to.target[c] - shot.from.target[c]) * e
  }
  if (u >= 1 && !shot.fired) {
    shot.fired = true
    held = shot.to
    const cb = shot.done
    shot = null
    cb?.()
    return held
  }
  return OUT
}

/**
 * 算一个「把某个锚点拍满画面」的机位。
 *
 * 默认方向沿用当前机位到锚点的方向 —— 局部聚焦是**推近**，不是绕着飞。
 * 距离由「希望这个物件占画面高度的比例」反算：
 *   屏幕在距离 d 处覆盖的世界高度 = 2·d·tan(fov/2)
 *   要让 h 占 fill 比例 ⇒ d = h / (2·fill·tan(fov/2))
 *
 * `facing` 给出「从锚点指向机位」的世界方向时改走这条：门内侧的工牌要的是
 * **正面**近景（参考点开 ABOUT 就是正对门面），而门开到 135° 时沿当前视线
 * 直推只会把那面斜着怼到画幅里，工牌被压成一条。方向由承载面的法线给，
 * 门转到哪个角度都成立。
 */
export function focusPoseFor(
  anchor: readonly [number, number, number],
  worldHeight: number,
  fill: number,
  fromPose: CameraPose,
  facing?: readonly [number, number, number] | null,
): CameraPose {
  let dx = fromPose.pos[0] - anchor[0]
  let dy = fromPose.pos[1] - anchor[1]
  let dz = fromPose.pos[2] - anchor[2]
  if (facing && Math.hypot(facing[0], facing[1], facing[2]) > 1e-4) {
    dx = facing[0]
    dy = facing[1]
    dz = facing[2]
  }
  const len = Math.hypot(dx, dy, dz) || 1
  const half = Math.tan((CAMERA_FOV * Math.PI) / 360)
  const d = worldHeight / (2 * fill * half)
  return {
    pos: [anchor[0] + (dx / len) * d, anchor[1] + (dy / len) * d, anchor[2] + (dz / len) * d],
    target: [anchor[0], anchor[1], anchor[2]],
  }
}
