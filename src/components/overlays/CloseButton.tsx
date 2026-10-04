import { useEffect, useRef } from 'react'
import { useStore } from '../../store'

/**
 * 浮层右上角关闭按钮。
 *
 * Escape 正常由 OverlayHost 的 dialog 统一处理（还要负责作品子页面先退回文件夹）。
 * 这里只在浮层没有被 OverlayHost 包起来时兜底，避免 App 还没接上 OverlayHost
 * 的过渡期里 Escape 失效；两者不会同时生效。
 */
export default function CloseButton({ onClose }: { onClose?: () => void }) {
  const closeOverlay = useStore((s) => s.closeOverlay)
  const handle = onClose ?? closeOverlay
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (ref.current?.closest('[role="dialog"]')) return
      handle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handle])

  return (
    <button ref={ref} type="button" className="ov__close" aria-label="关闭" onClick={() => handle()}>
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <path d="M3 3l10 10M13 3L3 13" />
      </svg>
    </button>
  )
}
