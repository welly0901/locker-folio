import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnimationEvent as ReactAnimationEvent } from 'react'
import { useStore } from '../store'
import { prefersReducedMotion } from '../hooks/useReducedMotion'

const COLS = 13
const ROWS = 7
const CELL_COUNT = COLS * ROWS

/** 单格淡出时长，必须与 loader.css 的 --reveal-cell 一致 */
const CELL_MS = 220
/** 全部方格的错峰窗口。参考揭幕 1.28→1.77s 约 490ms，这里 300+220=520ms */
const STAGGER_MS = 300
/** 兜底：动画事件因标签页隐藏等原因没到齐时的强制收尾余量 */
const GUARD_PAD_MS = 320
/** Reduced Motion：一次短遮罩淡出，不保留任何空等待 */
const FLAT_MS = 160

/**
 * 青色方格揭幕层。
 *
 * 要点：
 * - 生命周期只由自己的播放进度决定，**不再「260ms 后切 phase 顺带把自己卸载」**。
 * - 结束条件是最后一个方格的 animationend；只有全部 91 格都播完才收尾。
 * - 收尾时优先调用 onDone（供场景状态机接线）；没传就退回旧的 setPhase('scene')。
 * - 起播前先等主场景画满一帧，避免方格揭开时露出白底。
 * - Reduced Motion 下不做碎格移动，用一次 160ms 的整幅遮罩淡出直接落到最终状态。
 */
export default function Reveal({ onDone }: { onDone?: () => void }) {
  const setPhase = useStore((s) => s.setPhase)

  // 开场序列是一次性的，只在挂载时读一次；播到一半切系统设置不该打断它
  const [reduced] = useState(prefersReducedMotion)
  /** 主场景画满一帧之前不起播 */
  const [armed, setArmed] = useState(false)
  /** 全部播完并收尾后不再占用 91 个节点 */
  const [cleared, setCleared] = useState(false)

  const flatRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)
  const playedRef = useRef(0)
  const onDoneRef = useRef(onDone)
  const setPhaseRef = useRef(setPhase)
  // 回调只在收尾时读，渲染期间不碰 ref
  useEffect(() => {
    onDoneRef.current = onDone
    setPhaseRef.current = setPhase
  })

  const delays = useMemo(() => {
    // 以画面中心为起点向外扩散 + 一层确定性抖动，接近参考的乱序翻格
    const maxD = Math.hypot(0.5, 0.5)
    return Array.from({ length: CELL_COUNT }, (_, i) => {
      const c = i % COLS
      const r = Math.floor(i / COLS)
      const d = Math.hypot((c - (COLS - 1) / 2) / COLS, (r - (ROWS - 1) / 2) / ROWS) / maxD
      const jitter = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1
      return (d * 0.62 + jitter * 0.38) * STAGGER_MS
    })
  }, [])

  /** 收尾：只会执行一次 */
  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    // 此刻所有方格已经是 opacity 0，卸载不会有任何可见跳变
    requestAnimationFrame(() => setCleared(true))
    if (onDoneRef.current) onDoneRef.current()
    else setPhaseRef.current('scene')
  }, [])

  /* 起播闸门：连等两帧，确保底下的主场景已经完成首帧绘制 */
  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setArmed(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  /* Reduced Motion：整幅遮罩淡出。
     用 WAAPI 而不是 CSS，是因为 global.css 会把所有 CSS 动画/过渡强行压到 0.01ms，
     那样遮罩会硬切；这里只有 opacity 变化，不含任何位移，符合减弱动效的要求。 */
  useEffect(() => {
    if (!reduced || !armed) return
    const el = flatRef.current
    if (!el) {
      finish()
      return
    }
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FLAT_MS,
      easing: 'linear',
      fill: 'forwards',
    })
    anim.onfinish = finish
    const guard = window.setTimeout(finish, FLAT_MS + GUARD_PAD_MS)
    return () => {
      window.clearTimeout(guard)
      anim.onfinish = null
    }
  }, [reduced, armed, finish])

  /* 正常路径的兜底计时：标签页隐藏时 CSS 动画会暂停，animationend 可能永远不来 */
  useEffect(() => {
    if (reduced || !armed) return
    const guard = window.setTimeout(finish, STAGGER_MS + CELL_MS + GUARD_PAD_MS)
    return () => window.clearTimeout(guard)
  }, [reduced, armed, finish])

  /** 最后一个方格播完即收尾 */
  const onCellEnd = useCallback(
    (e: ReactAnimationEvent) => {
      if (e.target === e.currentTarget) return
      playedRef.current += 1
      if (playedRef.current >= CELL_COUNT) finish()
    },
    [finish],
  )

  if (cleared) return null

  if (reduced) {
    return <div ref={flatRef} className="reveal reveal--flat" aria-hidden />
  }

  return (
    <div
      className="reveal"
      aria-hidden
      data-armed={armed}
      onAnimationEnd={onCellEnd}
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        ['--reveal-cell' as string]: `${CELL_MS}ms`,
      }}
    >
      {delays.map((d, i) => (
        <span key={i} className="reveal__cell" style={{ animationDelay: `${Math.round(d)}ms` }} />
      ))}
    </div>
  )
}
