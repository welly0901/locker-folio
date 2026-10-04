/* ============================================================================
 * 场景状态机
 *
 * 这里是首屏体验的**唯一状态来源**。它替代了原来的
 * `phase: loading | reveal | scene` + Scene 内部一个 `entered` 布尔值。
 *
 * 三条硬规则：
 *   1. 纯函数。没有 setTimeout、没有 DOM、没有 zustand，可以直接单元测试。
 *   2. 状态只由**完成事件**推进（RevealDone / ApproachDone / DoorDone …），
 *      不允许由散落的魔法定时器直接 setState。时长归主时间线管，
 *      时间线跑完一段就往这里投一个完成事件。
 *   3. 每个状态都要明确回答四件事：允许什么输入、相机在哪、门开多少、
 *      哪一批物件可见。这些写在 CAPABILITIES 表里，UI 只读表不自己判断。
 *
 * 运行方式（无需额外依赖）：
 *   bun src/experience/experienceMachine.test.ts
 * ========================================================================== */

import type { Overlay } from '../store'

/* ── 状态 ─────────────────────────────────────────────────── */

export type SceneState =
  /** 资源加载中，Loader 在屏幕上 */
  | 'loading'
  /** 有阻塞资源失败，可重试或降级继续 */
  | 'loadError'
  /** 青蓝方格揭幕播放中，主场景已完成首帧 */
  | 'reveal'
  /** 小比例斜视闭柜 → 旋正推近 */
  | 'approach'
  /** 第二扇门绕右铰链打开 */
  | 'opening'
  /** 柜内物件按批次出现 */
  | 'stagingProps'
  /** 无用户输入也自动推近 About 工牌 */
  | 'autoFocusAbout'
  /** 场景稳定，所有热点可操作 */
  | 'idle'
  /** 相机正在飞向某个热点 */
  | 'focusing'
  /** 浮层挂载并播放进入动画 */
  | 'overlayOpening'
  /** 浮层完全打开，焦点已交给浮层 */
  | 'overlayOpen'
  /** 浮层播放退出动画，尚未卸载 */
  | 'overlayClosing'
  /** 相机从浮层构图回到宽景 */
  | 'returning'
  /** Reduced Motion：跳过全部长动画，直接落在信息完整的静态开柜 */
  | 'reducedMotionReady'

/** 相机来源：热点进入要先做局部推近，顶部导航不强制重复推近 */
export type OverlaySource = 'hotspot' | 'nav'

export type SceneEvent =
  /** 首屏阻塞资源全部 ready */
  | { type: 'ASSETS_READY' }
  /** 阻塞资源失败 */
  | { type: 'ASSETS_FAILED' }
  /** 用户点重试 / 以降级模式继续 */
  | { type: 'ASSETS_CONTINUE' }
  /** 揭幕层最后一格播完 */
  | { type: 'REVEAL_DONE' }
  /** 相机 approach 段跑完 */
  | { type: 'APPROACH_DONE' }
  /** 门到达终点角度 */
  | { type: 'DOOR_DONE' }
  /** 最后一批物件落位 */
  | { type: 'PROPS_DONE' }
  /** 自动推近 About 完成 */
  | { type: 'AUTOFOCUS_DONE' }
  /** 请求打开某个浮层 */
  | { type: 'REQUEST_OVERLAY'; overlay: Exclude<Overlay, null>; source: OverlaySource }
  /** 局部镜头聚焦完成 */
  | { type: 'FOCUS_DONE' }
  /** 浮层进入动画播完 */
  | { type: 'OVERLAY_ENTERED' }
  /** 请求关闭浮层 */
  | { type: 'CLOSE_OVERLAY' }
  /** 浮层退出动画播完、已卸载 */
  | { type: 'OVERLAY_EXITED' }
  /** 相机回到宽景 */
  | { type: 'RETURN_DONE' }
  /** 跳过开场动画（无障碍入口 / Reduced Motion / 开发参数） */
  | { type: 'SKIP_INTRO' }
  /** 自动序列途中收到用户输入 */
  | { type: 'USER_INTERRUPT' }

export type SceneContext = {
  state: SceneState
  /** 当前（或正在打开 / 正在关闭）的浮层 */
  overlay: Overlay
  /** 打开浮层的来源，决定关闭后相机回到哪 */
  source: OverlaySource | null
  /** 已经播过一次开场自动序列；中断后不再重播（页面重显不重复播首屏） */
  introPlayed: boolean
  /** 用户要求减少动效：稳定态用 reducedMotionReady 而不是 idle */
  reduced: boolean
}

export const INITIAL_CONTEXT: SceneContext = {
  state: 'loading',
  overlay: null,
  source: null,
  introPlayed: false,
  reduced: false,
}

/* ── 能力表 ───────────────────────────────────────────────── */

export type Capabilities = {
  /** 柜内热点是否可点 */
  hotspots: boolean
  /** 柜门贴花是否可拖 */
  drag: boolean
  /** 顶部导航是否可用 */
  nav: boolean
  /** 是否允许自由平移 / 缩放 */
  freeCamera: boolean
  /** 是否处在会被用户输入打断的自动镜头段 */
  interruptible: boolean
  /** 是否需要连续渲染（demand rendering 的开关） */
  animating: boolean
}

const NONE: Capabilities = {
  hotspots: false,
  drag: false,
  nav: false,
  freeCamera: false,
  interruptible: false,
  animating: false,
}

/** 每个状态允许什么。UI 一律读这张表，不要在组件里自己 if 状态名。 */
export const CAPABILITIES: Record<SceneState, Capabilities> = {
  loading: NONE,
  loadError: NONE,
  reveal: { ...NONE, animating: true },
  approach: { ...NONE, animating: true, interruptible: true },
  /*
   * 从柜门开始翻开的那一刻起，热点与拖拽就全部放开。
   *
   * 早先这四个开场状态的 hotspots / drag 都是 false，要等 AUTOFOCUS_END 才开，
   * 于是用户对着一幅门已开、物件已就位的画面点不动任何东西 —— 动画是给他看的，
   * 不是拦他的。三条依赖都经得起中途插入：
   *   · 热点锚点挂在模型节点上，门转到哪它跟到哪；
   *   · 入场动画只写物件内部的 Reveal 层，拖拽写外层，两层互不覆盖；
   *   · 点热点后镜头调度器的优先级高于开场时间线，不会被推近拽回去。
   * freeCamera 仍然留到稳定态：开场镜头还在走位时再让用户缩放会互相打架。
   */
  opening: { ...NONE, hotspots: true, drag: true, animating: true, interruptible: true },
  stagingProps: { ...NONE, hotspots: true, drag: true, nav: true, animating: true, interruptible: true },
  autoFocusAbout: { ...NONE, hotspots: true, drag: true, nav: true, animating: true, interruptible: true },
  idle: { hotspots: true, drag: true, nav: true, freeCamera: true, interruptible: false, animating: false },
  focusing: { ...NONE, nav: true, animating: true, interruptible: true },
  overlayOpening: { ...NONE, animating: true },
  overlayOpen: { ...NONE },
  overlayClosing: { ...NONE, animating: true },
  returning: { ...NONE, nav: true, animating: true, interruptible: true },
  reducedMotionReady: { hotspots: true, drag: true, nav: true, freeCamera: true, interruptible: false, animating: false },
}

/** 已经可以看到主场景（Loader 已经离场） */
export function isSceneVisible(state: SceneState): boolean {
  return state !== 'loading' && state !== 'loadError'
}

/** 开场自动序列是否还在跑 */
export function isIntroRunning(state: SceneState): boolean {
  return state === 'approach' || state === 'opening' || state === 'stagingProps' || state === 'autoFocusAbout'
}

/** 自动序列跑完、场景可以自由操作的稳定态 */
export function isSettled(state: SceneState): boolean {
  return state === 'idle' || state === 'reducedMotionReady'
}

/* ── 转换 ─────────────────────────────────────────────────── */

/** 中断 / 关闭浮层后要回到的稳定态 */
function restingState(ctx: SceneContext): SceneState {
  return ctx.reduced ? 'reducedMotionReady' : 'idle'
}

/**
 * 纯转换函数。返回新的 context；不认识的事件原样返回**同一个对象引用**，
 * 这样 zustand 的 `set` 可以靠引用相等跳过一次无意义渲染。
 */
export function reduce(ctx: SceneContext, event: SceneEvent): SceneContext {
  const s = ctx.state

  switch (event.type) {
    case 'ASSETS_READY':
      if (s !== 'loading' && s !== 'loadError') return ctx
      return { ...ctx, state: 'reveal' }

    case 'ASSETS_FAILED':
      if (s !== 'loading') return ctx
      return { ...ctx, state: 'loadError' }

    case 'ASSETS_CONTINUE':
      if (s !== 'loadError') return ctx
      return { ...ctx, state: 'reveal' }

    case 'REVEAL_DONE':
      if (s !== 'reveal') return ctx
      return { ...ctx, state: 'approach' }

    case 'APPROACH_DONE':
      if (s !== 'approach') return ctx
      return { ...ctx, state: 'opening' }

    case 'DOOR_DONE':
      if (s !== 'opening') return ctx
      return { ...ctx, state: 'stagingProps' }

    case 'PROPS_DONE':
      if (s !== 'stagingProps') return ctx
      // 物件落位后**不等任何点击**，直接进入自动推近
      return { ...ctx, state: 'autoFocusAbout' }

    case 'AUTOFOCUS_DONE':
      if (s !== 'autoFocusAbout') return ctx
      return { ...ctx, state: restingState(ctx), introPlayed: true }

    case 'SKIP_INTRO': {
      // Reduced Motion 与「跳过动画」入口共用：直接落到信息完整的静态开柜
      if (!isSceneVisible(s) || isSettled(s)) return ctx
      if (s === 'overlayOpening' || s === 'overlayOpen' || s === 'overlayClosing') return ctx
      return { ...ctx, state: 'reducedMotionReady', introPlayed: true }
    }

    case 'USER_INTERRUPT': {
      // 只打断「无操作时才该继续」的自动推近段。approach / opening / stagingProps
      // 是开场叙事，用户随手点一下不应该把柜门卡在半开。
      if (s !== 'autoFocusAbout' && s !== 'returning' && s !== 'focusing') return ctx
      return { ...ctx, state: restingState(ctx), introPlayed: true, overlay: null, source: null }
    }

    case 'REQUEST_OVERLAY': {
      if (!isSceneVisible(s)) return ctx
      // 浮层已经开着时切换目标：直接换内容，不重播镜头
      if (s === 'overlayOpen' || s === 'overlayOpening') {
        if (ctx.overlay === event.overlay) return ctx
        return { ...ctx, state: 'overlayOpening', overlay: event.overlay, source: event.source }
      }
      // 从柜内热点进入要先做局部镜头聚焦；顶部导航直接开
      const next: SceneState = event.source === 'hotspot' ? 'focusing' : 'overlayOpening'
      return { ...ctx, state: next, overlay: event.overlay, source: event.source, introPlayed: true }
    }

    case 'FOCUS_DONE':
      if (s !== 'focusing') return ctx
      return { ...ctx, state: 'overlayOpening' }

    case 'OVERLAY_ENTERED':
      if (s !== 'overlayOpening') return ctx
      return { ...ctx, state: 'overlayOpen' }

    case 'CLOSE_OVERLAY':
      if (s !== 'overlayOpen' && s !== 'overlayOpening' && s !== 'focusing') return ctx
      // focusing 阶段就取消：浮层还没挂上，直接回到稳定态
      if (s === 'focusing') return { ...ctx, state: restingState(ctx), overlay: null, source: null }
      return { ...ctx, state: 'overlayClosing' }

    case 'OVERLAY_EXITED': {
      if (s !== 'overlayClosing') return ctx
      // 热点进入过的要把相机送回宽景；顶部导航进入的原地就是宽景
      const back: SceneState = ctx.source === 'hotspot' ? 'returning' : restingState(ctx)
      return { ...ctx, state: back, overlay: null, source: null }
    }

    case 'RETURN_DONE':
      if (s !== 'returning') return ctx
      return { ...ctx, state: restingState(ctx) }

    default:
      return ctx
  }
}

/** 调试用：状态的中文名 */
export const STATE_LABEL: Record<SceneState, string> = {
  loading: '加载中',
  loadError: '加载失败',
  reveal: '揭幕',
  approach: '相机推近',
  opening: '开门',
  stagingProps: '物件入场',
  autoFocusAbout: '自动推近 About',
  idle: '稳定',
  focusing: '镜头聚焦',
  overlayOpening: '浮层进入',
  overlayOpen: '浮层打开',
  overlayClosing: '浮层退出',
  returning: '相机返回',
  reducedMotionReady: '静态开柜',
}
