import { useEffect, useId, useRef, useState } from 'react'
import { NAV } from '../data/content'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useStore, type Overlay } from '../store'
import './nav.css'

/** 窄屏折叠断点，必须与 nav.css 里的 media query 保持一致 */
const COMPACT_QUERY = '(max-width: 640px)'

export default function Nav() {
  const overlay = useStore((s) => s.overlay)
  const openOverlay = useStore((s) => s.openOverlay)

  // 窄屏把四项文字折叠成一个 MENU 开关，避免 ABOUT / SKILLS /
  // SELECTED WORK / CONTACT 在小屏上互相挤压
  const compact = useMediaQuery(COMPACT_QUERY)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  // 断点切换时收起，避免残留展开态（渲染期修正，不额外走一轮 effect）
  const [prevCompact, setPrevCompact] = useState(compact)
  if (prevCompact !== compact) {
    setPrevCompact(compact)
    setOpen(false)
  }

  // 展开时：Escape 收起并把焦点还给开关；点击菜单外部收起
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // 折叠且未展开时给 <ul> 加 hidden：菜单项真正退出 Tab 顺序
  const collapsed = compact && !open

  return (
    <nav className="nav" aria-label="主导航" ref={rootRef} data-compact={compact || undefined}>
      {compact && (
        <button
          ref={toggleRef}
          type="button"
          className="nav__item nav__toggle u-tap-target"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="nav__label">{open ? 'CLOSE' : 'MENU'}</span>
          <span className="nav__caret" aria-hidden="true" />
          <span className="nav__rule" />
        </button>
      )}

      <ul className="nav__list" id={menuId} hidden={collapsed}>
        {NAV.map((n) => (
          <li className="nav__cell" key={n.id}>
            <button
              type="button"
              className="nav__item u-tap-target"
              data-active={overlay === n.id}
              aria-current={overlay === n.id ? 'true' : undefined}
              onClick={() => {
                openOverlay(n.id as Overlay)
                setOpen(false)
              }}
            >
              <span className="nav__label">{n.label}</span>
              <span className="nav__rule" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
