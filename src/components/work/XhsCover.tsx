import { useEffect, useRef, useState } from 'react'
import { XHS_COVER } from '../../data/content'
import { releaseImages, SIZES, workImage } from './imageSources'

/** DESIGN › 04 XIAOHONGSHU COVER —— 左右无缝循环轮播（拖拽 / 触控板 / 箭头 / 键盘） */
export default function XhsCover({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<(dir: 1 | -1) => void>(() => {})
  const [idx, setIdx] = useState(0)

  const total = XHS_COVER.pages.length

  // 三份拷贝：clone | original | clone，pos 在中段循环、越界后无感回绕
  const pages3 = [...XHS_COVER.pages, ...XHS_COVER.pages, ...XHS_COVER.pages]

  // 离开栏目时断开图片引用
  useEffect(() => {
    const root = rootRef.current
    return () => releaseImages(root)
  }, [])

  /* 轮播引擎：所有位移直接写 transform，保证跟手与顺滑 */
  useEffect(() => {
    const viewport = viewportRef.current!
    const track = trackRef.current!

    let step = 0 // 单张步距（卡片宽 + 间距）
    let pos = total // 绝对位置，初始落在中段第一张
    let settleToken = 0

    const drag = {
      on: false,
      dx: 0,
      startX: 0,
      lock: '' as '' | 'h' | 'v',
      lastDx: 0,
      lastT: 0,
      vel: 0,
    }

    const apply = (animate: boolean) => {
      track.style.transition = animate
        ? 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none'
      const base = (viewport.clientWidth - step) / 2
      const x = base - pos * step + drag.dx
      track.style.transform = `translate3d(${x.toFixed(2)}px, -50%, 0)`
    }

    /* 到中段边界后无感回绕（transitionend 为主、延时兜底） */
    const normalize = () => {
      let changed = false
      if (pos >= total * 2) {
        pos -= total
        changed = true
      } else if (pos < total) {
        pos += total
        changed = true
      }
      if (changed) apply(false)
    }
    const armSettle = () => {
      const t = ++settleToken
      window.setTimeout(() => {
        if (t === settleToken) normalize()
      }, 680)
    }
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== track || e.propertyName !== 'transform') return
      settleToken++
      normalize()
    }

    const stepTo = (dir: 1 | -1) => {
      settleToken++
      pos += dir
      setIdx(((pos % total) + total) % total)
      apply(true)
      armSettle()
    }
    apiRef.current = stepTo

    /* ── 指针拖拽：1:1 跟手，松手按位移 + 速度预判落位 ── */
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.xhs__arrow')) return
      drag.on = true
      drag.dx = 0
      drag.lock = ''
      drag.startX = e.clientX
      drag.lastDx = 0
      drag.lastT = performance.now()
      drag.vel = 0
      settleToken++ // 交互期间取消待执行的回绕
      try {
        viewport.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      track.classList.add('is-drag')
    }
    const move = (e: PointerEvent) => {
      if (!drag.on) return
      const dx = e.clientX - drag.startX
      if (!drag.lock && Math.abs(dx) > 6) drag.lock = 'h'
      if (drag.lock !== 'h') return
      e.preventDefault()
      const now = performance.now()
      if (now > drag.lastT) drag.vel = (dx - drag.lastDx) / (now - drag.lastT)
      drag.lastDx = dx
      drag.lastT = now
      drag.dx = dx
      apply(false)
    }
    const up = (e: PointerEvent) => {
      if (!drag.on) return
      drag.on = false
      track.classList.remove('is-drag')
      try {
        viewport.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      if (drag.lock !== 'h') return
      const projected = drag.dx + drag.vel * 150
      const steps = Math.round(projected / step) // 0 = 弹回原位
      drag.dx = 0
      pos -= steps // 向右拖(dx>0)看上一张
      setIdx(((pos % total) + total) % total)
      apply(true)
      armSettle()
    }

    /* ── 触控板横向手势：节流切段，纵向手势留给 DesignView ── */
    let wheelLock = false
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      if (wheelLock) return
      wheelLock = true
      window.setTimeout(() => {
        wheelLock = false
      }, 320)
      stepTo(e.deltaX < 0 ? -1 : 1)
    }

    const measure = () => {
      const a = track.querySelectorAll<HTMLElement>('.xhs__slide')[total]
      const b = track.querySelectorAll<HTMLElement>('.xhs__slide')[total + 1]
      if (!a || !b) return
      step = b.offsetLeft - a.offsetLeft
      apply(false)
    }

    viewport.addEventListener('pointerdown', down)
    viewport.addEventListener('pointermove', move)
    viewport.addEventListener('pointerup', up)
    viewport.addEventListener('pointercancel', up)
    viewport.addEventListener('wheel', wheel, { passive: false })
    track.addEventListener('transitionend', onEnd)

    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    measure()

    return () => {
      viewport.removeEventListener('pointerdown', down)
      viewport.removeEventListener('pointermove', move)
      viewport.removeEventListener('pointerup', up)
      viewport.removeEventListener('pointercancel', up)
      viewport.removeEventListener('wheel', wheel)
      track.removeEventListener('transitionend', onEnd)
      ro.disconnect()
    }
  }, [total])

  /* 键盘左右翻页（仅本栏目激活时） */
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        apiRef.current(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        apiRef.current(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div className="xhs" data-active={active} ref={rootRef}>
      <div className="xhs__head">
        <span className="xhs__kicker">{XHS_COVER.kicker}</span>
        <h1 className="xhs__title">
          {XHS_COVER.title}
          <em>{XHS_COVER.cn}</em>
        </h1>
      </div>

      <div className="xhs__viewport" ref={viewportRef} data-hscroll>
        <button
          type="button"
          className="xhs__arrow"
          data-dir="prev"
          onClick={() => apiRef.current(-1)}
          aria-label="上一张"
        >
          ‹
        </button>

        <div className="xhs__track" ref={trackRef}>
          {pages3.map((p, i) => (
            <figure className="xhs__slide" key={i}>
              <img
                {...workImage('xhs', p)}
                sizes={SIZES.xhs}
                alt={`小红书封面设计 ${(i % total) + 1}`}
                decoding="async"
                draggable={false}
              />
            </figure>
          ))}
        </div>

        <button
          type="button"
          className="xhs__arrow"
          data-dir="next"
          onClick={() => apiRef.current(1)}
          aria-label="下一张"
        >
          ›
        </button>
      </div>

      <div className="xhs__counter" aria-hidden>
        {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </div>
  )
}
