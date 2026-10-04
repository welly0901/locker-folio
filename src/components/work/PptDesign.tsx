import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PPT_DESIGN } from '../../data/content'
import { releaseImages, SIZES, workImage } from './imageSources'

/** DESIGN › 02 PPT DESIGN —— 最简单的平铺展示，点击图片放大查看 */
export default function PptDesign({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const total = PPT_DESIGN.pages.length

  const close = useCallback(() => setZoom(null), [])

  // 离开栏目时断开图片引用
  useEffect(() => {
    const root = rootRef.current
    return () => releaseImages(root)
  }, [])

  // 切到其他段落时关闭放大层
  useEffect(() => {
    if (!active) close()
  }, [active, close])

  // 放大层键盘：Esc 关闭，左右切换
  useEffect(() => {
    if (zoom === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') setZoom((z) => (z === null ? z : Math.max(0, z - 1)))
      if (e.key === 'ArrowRight')
        setZoom((z) => (z === null ? z : Math.min(total - 1, z + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, close, total])

  // 进入/离开放大层时锁定纵向滚动
  useEffect(() => {
    if (zoom !== null) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [zoom])

  return (
    <div className="ppt" data-active={active} ref={rootRef} data-vscroll>
      <div className="ppt__head">
        <span className="ppt__kicker">{PPT_DESIGN.kicker}</span>
        <h1 className="ppt__title">
          {PPT_DESIGN.title}
          <em>{PPT_DESIGN.cn}</em>
        </h1>
      </div>

      <div className="ppt__list">
        {PPT_DESIGN.pages.map((p, i) => (
          <button
            type="button"
            className="ppt__card"
            key={p}
            onClick={() => setZoom(i)}
            aria-label={`放大查看 PPT 设计 ${i + 1}`}
          >
            <img
              {...workImage('ppt', p)}
              sizes={SIZES.ppt}
              alt={`PPT 版式设计 ${i + 1}`}
              decoding="async"
              draggable={false}
            />
            <span className="ppt__zoomHint" aria-hidden>
              点击放大
            </span>
          </button>
        ))}
      </div>

      {zoom !== null &&
        createPortal(
          <div
            className="ppt__lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="PPT 大图预览"
            onClick={close}
          >
          <button
            type="button"
            className="ppt__lbClose"
            onClick={close}
            aria-label="关闭"
          >
            ×
          </button>

          {zoom > 0 && (
            <button
              type="button"
              className="ppt__lbArrow"
              data-dir="prev"
              onClick={(e) => {
                e.stopPropagation()
                setZoom(zoom - 1)
              }}
              aria-label="上一张"
            >
              ‹
            </button>
          )}

          <figure className="ppt__lbFig" onClick={(e) => e.stopPropagation()}>
            <img
              {...workImage('ppt', PPT_DESIGN.pages[zoom])}
              sizes="92vw"
              alt={`PPT 版式设计 ${zoom + 1}`}
              decoding="async"
              draggable={false}
            />
            <figcaption>
              {String(zoom + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </figcaption>
          </figure>

          {zoom < total - 1 && (
            <button
              type="button"
              className="ppt__lbArrow"
              data-dir="next"
              onClick={(e) => {
                e.stopPropagation()
                setZoom(zoom + 1)
              }}
              aria-label="下一张"
            >
              ›
            </button>
          )}
          </div>,
          document.body,
        )}
    </div>
  )
}
