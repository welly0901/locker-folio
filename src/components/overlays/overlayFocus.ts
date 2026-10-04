import { NAV } from '../../data/content'

/**
 * 焦点来源追踪。
 *
 * 浮层是通过 store action 打开的，组件挂载时已经拿不到“是谁打开的”。
 * Safari / Firefox 点击 <button> 又不会把它变成 activeElement，
 * 所以这里在捕获阶段记录最后一次交互命中的可聚焦元素，作为归还目标的首选。
 */
let lastInteractive: HTMLElement | null = null
let lastInteractiveAt = 0

/** 超过这个时间的历史交互不再算作“打开来源” */
const RECENT_MS = 3000

const INTERACTIVE = 'a[href],button,[role="button"],input,select,textarea,[tabindex]'

function remember(e: Event) {
  const t = e.target
  if (!(t instanceof Element)) return
  const el = t.closest<HTMLElement>(INTERACTIVE)
  if (!el) return
  lastInteractive = el
  lastInteractiveAt = performance.now()
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', remember, true)
  document.addEventListener('keydown', remember, true)
}

/**
 * 浮层打开的那一刻，抓住“打开它的那个元素”。
 * 优先用刚刚被真实交互命中的元素：Safari / Firefox 点击 button 不会改变
 * activeElement，直接读 activeElement 会拿到上一次残留的焦点。
 */
export function captureOpener(): HTMLElement | null {
  if (lastInteractive?.isConnected && performance.now() - lastInteractiveAt < RECENT_MS) {
    return lastInteractive
  }
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : null
}

function usable(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (!el.isConnected) return false
  if (el.closest('[inert]')) return false
  // 隐藏元素没有盒子，focus() 会落空
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

function navButton(overlay: string): HTMLElement | null {
  const byData = document.querySelector(`[data-nav-id="${overlay}"]`)
  if (usable(byData)) return byData

  const label = NAV.find((n) => n.id === overlay)?.label
  if (!label) return null

  const byAria = document.querySelector(`.nav [aria-label^="${label}"]`)
  if (usable(byAria)) return byAria

  const byText = Array.from(document.querySelectorAll<HTMLElement>('.nav__item')).find((el) =>
    el.textContent?.trim().startsWith(label),
  )
  if (usable(byText)) return byText

  // 窄屏：点完菜单项 Nav 会立刻折叠并给 <ul> 加 hidden，上面几个查找全部落空。
  // 此时真正的调用入口是 MENU 开关本身，焦点还给它，用户能直接再展开菜单。
  // 不做这一步会一路退到柜体热点上。
  const toggle = document.querySelector('.nav__toggle')
  return usable(toggle) ? toggle : null
}

function hotspot(overlay: string): HTMLElement | null {
  const el = document.querySelector(`.hot--${overlay}`)
  return usable(el) ? el : null
}

/**
 * 解析焦点归还目标，按可靠度从高到低：
 * 1. 打开浮层的那个元素（柜内热点或导航按钮）
 * 2. store 记录的入口类型对应的控件：hotspot → 柜体热点，nav → 顶部导航按钮
 * 3. 另一类入口
 *
 * 导航按钮的查找顺序是 data-nav-id → aria-label → 可见文案，
 * 这样 Nav 加不加 data 属性都能命中。
 */
export function resolveRestoreTarget(
  overlay: string,
  source: HTMLElement | null,
  kind: 'hotspot' | 'nav' | null,
): HTMLElement | null {
  if (usable(source)) return source
  return kind === 'hotspot'
    ? (hotspot(overlay) ?? navButton(overlay))
    : (navButton(overlay) ?? hotspot(overlay))
}
