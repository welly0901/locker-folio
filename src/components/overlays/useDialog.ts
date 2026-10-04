import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visible(el: HTMLElement) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

/** 浮层内当前真正可以 Tab 到的元素，按 DOM 顺序 */
function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && visible(el),
  )
}

type Options = {
  /** 指向 role="dialog" 的元素 */
  ref: RefObject<HTMLElement | null>
  /** 浮层是否已挂载：挂载即生效 inert 与 focus trap */
  active: boolean
  /**
   * 焦点接管的时机键：进入动画完成后再交出键盘焦点；
   * 值变化（如作品页在浮层内切换子视图）时重新接管，避免焦点掉到 body。
   */
  focusKey: string | null
  onEscape: () => void
}

/**
 * dialog 行为集合：
 * 背景 inert、焦点限制在浮层内、Escape 关闭、页面滚动锁定。
 *
 * 滚动锁只加在 documentElement 上，不动 body 定位，
 * 因此作品页内部的 `.vl__scroll` 等滚动容器不受影响。
 */
export function useDialog({ ref, active, focusKey, onEscape }: Options) {
  // 1) 背景 inert + 页面滚动锁
  useLayoutEffect(() => {
    const host = ref.current
    if (!active || !host) return

    const marked: HTMLElement[] = []
    let node: HTMLElement | null = host
    while (node && node !== document.body && node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib === node || !(sib instanceof HTMLElement)) continue
        if (sib.hasAttribute('inert')) continue
        sib.setAttribute('inert', '')
        marked.push(sib)
      }
      node = node.parentElement
    }

    const root = document.documentElement
    const prevOverflow = root.style.overflow
    root.style.overflow = 'hidden'

    return () => {
      for (const el of marked) el.removeAttribute('inert')
      root.style.overflow = prevOverflow
    }
  }, [ref, active])

  // 2) Escape 关闭
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      escapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])

  // 3) Focus trap：Tab / Shift+Tab 在浮层内循环，出不去
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const list = focusables(root)
      if (!list.length) {
        e.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const cur = document.activeElement
      if (!(cur instanceof HTMLElement) || !root.contains(cur) || cur === root) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus({ preventScroll: true })
        return
      }
      if (e.shiftKey && cur === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [ref, active])

  // 4) 进入动画完成后再接管焦点
  useEffect(() => {
    if (!active || !focusKey) return
    const root = ref.current
    if (!root) return
    if (root.contains(document.activeElement)) return
    root.focus({ preventScroll: true })
  }, [ref, active, focusKey])
}
