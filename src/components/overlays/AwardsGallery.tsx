import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { AWARDS } from '../../data/awards.generated'
import { releaseImages } from '../work/imageSources'
import './awards.css'

/*
 * AWARDS 深度画廊 —— 参考 codrops depth-gallery 的交互模型：
 *
 * - 证书沿 Z 轴纵深排列，滚轮 / 拖拽 / 方向键让「镜头」在图片之间推进
 * - 相邻两张交叉淡入，出站的一张朝镜头放大掠过，入站的一张从深处推近
 * - 每张证书自带氛围色板，背景双色光斑随推进交叉变色
 * - 滚动速度驱动轻微 tilt / 缩放「呼吸」，指针位置带视差
 *
 * 所有每帧变化直接写 DOM style，React 只管索引等离散状态。
 */

/** 各图在画面前景平面上的横向错落（对应参考的 position.x） */
const X_OFFSET = [-0.9, 0.82, -0.68, 0.96, -0.78, 0.74, -0.9, 0.86, -0.7, 0.92, -0.82, 0.78, -0.92]

const COUNT = AWARDS.length
const GAP = 620 // 相邻证书的纵深间距 px
const BREATH_VEL = 0.05 // 一帧内推进多少算「满速」

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function imageSources(id: string) {
  const base = `/assets/awards/${id}`
  return {
    src: `${base}-800.webp`,
    srcSet: `${base}-480.webp 480w, ${base}-800.webp 800w, ${base}.webp 1200w`,
  }
}

export default function AwardsGallery() {
  const closeOverlay = useStore((s) => s.closeOverlay)
  const reduced = useReducedMotion()

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const planeRefs = useRef<(HTMLDivElement | null)[]>([])
  const innerRefs = useRef<(HTMLDivElement | null)[]>([])
  const toneRefs = useRef<(HTMLDivElement | null)[]>([])

  const [index, setIndex] = useState(0)

  /* 运行期数值放 ref，避免每帧 setState */
  const state = useRef({
    target: 0,
    cur: 0,
    prevCur: 0,
    px: 0,
    py: 0,
    pxCur: 0,
    pyCur: 0,
    planeOps: AWARDS.map((_, i) => (i === 0 ? 1 : 0)),
    toneOps: AWARDS.map((_, i) => (i === 0 ? 1 : 0)),
    dragging: false,
    axis: '' as '' | 'x' | 'y',
    startX: 0,
    startY: 0,
    startP: 0,
    snapTimer: 0,
  })

  const goTo = useCallback((i: number) => {
    const s = state.current
    window.clearTimeout(s.snapTimer)
    s.target = clamp(i, 0, COUNT - 1)
  }, [])

  /* ── 指针视差 ─────────────────────────────────────────── */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = state.current
      s.px = (e.clientX / window.innerWidth) * 2 - 1
      s.py = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  /* ── 滚轮推进（非 passive，禁止背后页面滚动）────────────── */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = state.current
      if (s.dragging) return
      s.target = clamp(s.target + e.deltaY * 0.0016 + e.deltaX * 0.0016, 0, COUNT - 1)
      window.clearTimeout(s.snapTimer)
      s.snapTimer = window.setTimeout(() => {
        s.target = Math.round(s.target)
      }, 640)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ── 键盘切换 ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = state.current
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        goTo(Math.round(s.target) + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        goTo(Math.round(s.target) - 1)
      } else if (e.key === 'Home') {
        goTo(0)
      } else if (e.key === 'End') {
        goTo(COUNT - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo])

  /* ── 拖拽推进（指针 + 触摸，首次移动后锁定主轴）──────────── */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onDown = (e: PointerEvent) => {
      const s = state.current
      s.dragging = true
      s.axis = ''
      s.startX = e.clientX
      s.startY = e.clientY
      s.startP = s.target
      window.clearTimeout(s.snapTimer)
      try {
        stage.setPointerCapture(e.pointerId)
      } catch {
        /* 某些环境不支持 capture，忽略 */
      }
    }
    const onMove = (e: PointerEvent) => {
      const s = state.current
      if (!s.dragging) return
      const dx = e.clientX - s.startX
      const dy = e.clientY - s.startY
      if (!s.axis && Math.hypot(dx, dy) > 8) {
        s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (!s.axis) return
      // 向左 / 向上拖 → 下一张
      const d = s.axis === 'x' ? -dx : -dy
      s.target = clamp(s.startP + d / (window.innerWidth * 0.52), 0, COUNT - 1)
    }
    const onUp = (e: PointerEvent) => {
      const s = state.current
      if (!s.dragging) return
      s.dragging = false
      s.axis = ''
      s.target = Math.round(s.target)
      try {
        stage.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
    }

    stage.addEventListener('pointerdown', onDown)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerup', onUp)
    stage.addEventListener('pointercancel', onUp)
    return () => {
      stage.removeEventListener('pointerdown', onDown)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerup', onUp)
      stage.removeEventListener('pointercancel', onUp)
    }
  }, [])

  /* ── 主循环：镜头平滑、交叉淡入、呼吸与视差 ──────────────── */
  useEffect(() => {
    let raf = 0
    let lastActive = -1

    const frame = () => {
      const s = state.current
      const smooth = reduced ? 1 : 0.11
      s.prevCur = s.cur
      s.cur = lerp(s.cur, s.target, smooth)
      if (Math.abs(s.target - s.cur) < 0.0004) s.cur = s.target

      s.pxCur = lerp(s.pxCur, s.px, reduced ? 1 : 0.08)
      s.pyCur = lerp(s.pyCur, s.py, reduced ? 1 : 0.08)

      const vel = clamp(Math.abs(s.cur - s.prevCur) / BREATH_VEL, 0, 1)
      const drift = clamp((s.cur - s.prevCur) / BREATH_VEL, -1, 1)
      const breath = reduced ? 0 : vel
      const isMobile = window.innerWidth <= 760
      const spread = (isMobile ? 9 : 21) * (window.innerWidth / 100)

      const curI = Math.floor(s.cur)
      const nextI = Math.min(curI + 1, COUNT - 1)
      const frac = s.cur - curI

      AWARDS.forEach((a, i) => {
        /* 目标不透明度：只有当前 / 下一张可见 */
        let targetOp = 0
        if (i === curI) targetOp = 1 - frac
        if (i === nextI) targetOp = Math.max(targetOp, frac)
        s.planeOps[i] = lerp(s.planeOps[i], targetOp, reduced ? 1 : 0.16)
        s.toneOps[i] = lerp(s.toneOps[i], targetOp, reduced ? 1 : 0.1)

        const plane = planeRefs.current[i]
        const inner = innerRefs.current[i]
        const tone = toneRefs.current[i]
        const op = s.planeOps[i]
        const depthInfluence = 1 + i * 0.05

        if (plane) {
          const x = X_OFFSET[i % X_OFFSET.length] * spread
          const z = (s.cur - i) * GAP
          plane.style.transform = `translate3d(${x.toFixed(2)}px, 0, ${z.toFixed(2)}px)`
          plane.style.opacity = op < 0.004 ? '0' : op.toFixed(3)
          plane.style.pointerEvents = op > 0.5 ? 'auto' : 'none'
        }
        if (inner) {
          const parX = s.pxCur * 26 * op * depthInfluence
          const parY = s.pyCur * 14 * op * depthInfluence + drift * 16
          const tiltX = -s.pyCur * 5.2 * breath
          const tiltY = s.pxCur * 5.2 * breath
          const pulse = 1 + 0.035 * breath
          inner.style.transform =
            `translate3d(${parX.toFixed(2)}px, ${parY.toFixed(2)}px, 0) ` +
            `rotateX(${tiltX.toFixed(3)}deg) rotateY(${tiltY.toFixed(3)}deg) scale(${pulse.toFixed(4)})`
        }
        if (tone) {
          const top = s.toneOps[i]
          tone.style.opacity = top < 0.004 ? '0' : top.toFixed(3)
        }
      })

      const active = Math.round(s.cur)
      if (active !== lastActive && Math.abs(s.target - s.cur) < 0.18) {
        lastActive = active
        setIndex(active)
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  /* 卸载时中断飞行中的图片请求 / 解码 */
  useEffect(() => () => releaseImages(rootRef.current), [])

  return (
    <div className="aw" ref={rootRef} data-reduced={reduced || undefined}>
      {/* ── 氛围背景：每张图一层色板，按推进交叉淡入 ── */}
      <div className="aw__bg" aria-hidden>
        {AWARDS.map((a) => (
          <div
            key={a.id}
            ref={(el) => {
              toneRefs.current[AWARDS.indexOf(a)] = el
            }}
            className="aw__tone"
            style={
              {
                '--bg': a.bg,
                '--blob1': a.blob1,
                '--blob2': a.blob2,
                opacity: 0,
              } as React.CSSProperties
            }
          />
        ))}
        <div className="aw__grain" />
        <div className="aw__vignette" />
      </div>

      {/* ── 3D 纵深舞台 ── */}
      <div className="aw__stageWrap">
        <div className="aw__stage" ref={stageRef}>
          {AWARDS.map((a, i) => {
            const src = imageSources(a.id)
            return (
              <div
                key={a.id}
                ref={(el) => {
                  planeRefs.current[i] = el
                }}
                className="aw__plane"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                <div
                  ref={(el) => {
                    innerRefs.current[i] = el
                  }}
                  className="aw__frame"
                >
                  <img
                    src={src.src}
                    srcSet={src.srcSet}
                    sizes="(max-width: 820px) 82vw, min(44vw, 480px)"
                    alt={`荣誉奖项 ${String(i + 1).padStart(2, '0')}`}
                    draggable={false}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 顶部 chrome ── */}
      <header className="aw__top">
        <button type="button" className="aw__back" onClick={closeOverlay}>
          <span aria-hidden>←</span> BACK
        </button>
        <div className="aw__kicker">
          <span className="aw__kickerEn">HONORS &amp; AWARDS</span>
          <span className="aw__kickerCn">荣誉奖项</span>
        </div>
      </header>

      {/* ── 左右切换 ── */}
      <button
        type="button"
        className="aw__arrow aw__arrow--prev"
        aria-label="上一张"
        disabled={index === 0}
        onClick={() => goTo(index - 1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="aw__arrow aw__arrow--next"
        aria-label="下一张"
        disabled={index === COUNT - 1}
        onClick={() => goTo(index + 1)}
      >
        ›
      </button>

      {/* ── 底部：序号 + 进度点 + 提示 ── */}
      <footer className="aw__bottom">
        <div className="aw__counter" aria-live="polite">
          <b>{String(index + 1).padStart(2, '0')}</b>
          <i>/ {String(COUNT).padStart(2, '0')}</i>
        </div>
        <div className="aw__dots" role="tablist" aria-label="选择奖状">
          {AWARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`第 ${i + 1} 张`}
              className="aw__dot"
              data-on={i === index || undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <p className="aw__hint">SCROLL · DRAG · 滑动浏览</p>
      </footer>
    </div>
  )
}
