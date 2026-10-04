import { useCallback, useEffect, useRef, useState } from 'react'
import { SKILLS } from '../../data/content'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import CloseButton from './CloseButton'
import './overlay.css'
import './skills.css'

type Slot = { x: number; y: number; s: number; r: number }

/* 卡片向右上错落堆叠，和参考一致；索引即层级，0 是最前面那张。
   六张时后三层只从牌堆里多露出一点边，不抢前卡的阅读区。 */
const SLOTS: Slot[] = [
  { x: 0, y: 0, s: 1, r: 0 },
  { x: 40, y: -48, s: 0.978, r: 0.9 },
  { x: 79, y: -95, s: 0.956, r: 1.9 },
  { x: 112, y: -132, s: 0.936, r: 2.7 },
  { x: 138, y: -162, s: 0.918, r: 3.5 },
  { x: 160, y: -188, s: 0.902, r: 4.2 },
]

/**
 * 展开模式：六张摊成 3 列 × 2 行，都可读、都可点。
 *
 * 最前面那张固定在下行正中并略放大（点它以外任意一张，那张会成为新的「前卡」
 * 并收回堆叠）。位置用符号列 × 行表达，实际位移 / 缩放 / 倾角都来自 CSS 变量，
 * skills.css 按断点给桌面与窄屏两套值，这里一处都不用改。
 *   slot → (列 −1/0/+1, 行 −1 上行 / +1 下行)
 */
const FAN_GRID: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // 0 前卡：下行正中
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

function fanTransform(slot: number) {
  const [col, row] = FAN_GRID[slot] ?? FAN_GRID[FAN_GRID.length - 1]
  const front = slot === 0
  const s = front ? 'var(--sk-fan-front-s)' : 'var(--sk-fan-s)'
  const r = front ? 0 : col
  return (
    `translate(calc(var(--sk-fan-x) * ${col}), calc(var(--sk-fan-y) * ${row})) ` +
    `scale(${s}) rotate(calc(var(--sk-fan-r) * ${r}))`
  )
}

/* 前卡退出时的落点：向左下滑出，同时轻微缩小和反向倾斜 */
const EXIT: Slot = { x: -26, y: 150, s: 0.94, r: -4.6 }

/** 前卡滑出 + 后层卡上移的共同时长：两件事必须在同一条时间线里 */
const OUT_MS = 420
/** 滑出的卡片落回最后一层后淡入的时长 */
const BACK_MS = 260
/** Reduced Motion 下只保留一次短淡化 */
const FADE_MS = 150

/** 退出中的卡片压在所有卡片之上，落回后层时才把层级降下去 */
const EXIT_Z = 30

/* 打开时最前面是 02，堆叠顺序 02 / 03 / … / 01；入场错峰也按这个初始层级固定 */
const INITIAL_ORDER = SKILLS.map((_, i) => (i + 1) % SKILLS.length)

type Moving = { card: number; stage: 'out' | 'back' }

function css(p: Slot) {
  return `translate(${p.x}px, ${p.y}px) scale(${p.s}) rotate(${p.r}deg)`
}

/**
 * SKILLS —— 从唱片箱里抽出的六张技能卡。
 *
 * 两种排布：**堆叠**（点最前面一张把它放到最后）与**展开**（六张摊成 3 × 2 阵列，
 * 点哪张哪张回到最前并收回堆叠）。两种排布共用同一套 DOM 与同一条 transform
 * 过渡，所以切换本身就是动画，不需要额外的进出场。
 */
export default function SkillsDeck() {
  const reduced = useReducedMotion()
  const [order, setOrder] = useState(INITIAL_ORDER)
  const [moving, setMoving] = useState<Moving | null>(null)
  const [spread, setSpread] = useState(false)
  // 入场动画只跑一次：播完（或用户提前换位）后彻底关掉，
  // 否则 slot 变化引起的 animation-delay 变化会让 skIn 重新触发并抢走 transform
  const [entered, setEntered] = useState(false)
  const busy = useRef(false)
  const timers = useRef<number[]>([])

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
    },
    [],
  )

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const advance = useCallback(() => {
    if (busy.current) return
    busy.current = true
    setEntered(true)
    const front = order[0]
    const done = () => {
      setMoving(null)
      busy.current = false
    }

    // 换位与前卡退出在同一帧提交：后层卡的上移、旋转与前卡的滑出共用一条时间线
    setOrder((o) => [...o.slice(1), o[0]])

    if (reduced) {
      // Reduced Motion：直接切顺序，只留一次短淡化提示层级变了
      setMoving({ card: front, stage: 'back' })
      later(FADE_MS, done)
      return
    }

    setMoving({ card: front, stage: 'out' })
    later(OUT_MS, () => {
      // 前卡已经滑出画面，这时候才把它的实际层级降到最后一层再淡入
      setMoving({ card: front, stage: 'back' })
      later(BACK_MS, done)
    })
  }, [order, reduced, later])

  /** 展开态里点某一张：它成为最前面那张，并收回堆叠 */
  const pick = useCallback((card: number) => {
    setEntered(true)
    setOrder((o) => [card, ...o.filter((i) => i !== card)])
    setSpread(false)
  }, [])

  const toggleSpread = useCallback(() => {
    if (busy.current) return
    setEntered(true)
    setSpread((on) => !on)
  }, [])

  const frontCard = SKILLS[order[0]]

  return (
    <div className="ov">
      <CloseButton />
      <div
        className="sk"
        role="group"
        data-spread={spread || undefined}
        aria-label={`技能卡组，共 ${SKILLS.length} 张`}
        data-entered={entered || undefined}
        onAnimationEnd={() => setEntered(true)}
      >
        <p className="sk__sr">
          {spread
            ? `六张技能卡已展开为 3 × 2 阵列，点击任意一张把它放到最前面并收回卡组。`
            : '点击最前面的卡片或按 Enter，把它放到卡组最后一层。'}
        </p>
        <p className="sk__sr" aria-live="polite">
          当前最前：{frontCard.no} {frontCard.title}
        </p>

        {SKILLS.map((c, i) => {
          const slot = order.indexOf(i)
          const isFront = slot === 0
          const stage = moving?.card === i ? moving.stage : null
          // 层级由 slot 决定；只有正在滑出的那张临时压在最上面
          const zIndex = stage === 'out' ? EXIT_Z : 10 - slot
          const active = spread || isFront

          return (
            <button
              key={c.no}
              type="button"
              className="sk__card"
              data-stage={stage ?? undefined}
              tabIndex={active ? 0 : -1}
              onClick={spread ? () => pick(i) : isFront ? advance : undefined}
              style={{
                zIndex,
                background: c.bg,
                color: c.fg,
                transform: spread
                  ? fanTransform(slot)
                  : css(stage === 'out' ? EXIT : SLOTS[slot] ?? SLOTS[SLOTS.length - 1]),
                opacity: !spread && stage === 'out' ? 0 : 1,
                transition: transitionFor(stage, reduced),
                pointerEvents: active ? 'auto' : 'none',
                // 入场错峰按初始层级固定，换位时不能变，否则会重新触发入场动画
                ['--in-delay' as string]: `${(SKILLS.length - 1 - INITIAL_ORDER.indexOf(i)) * 0.075}s`,
              }}
            >
              <span className="sk__arc" aria-hidden />
              <span className="sk__kicker">{c.kicker}</span>
              <span className="sk__title">{c.title}</span>
              <span className="sk__desc">{c.desc}</span>
              <span className="sk__spacer" />
              <span className="sk__rows">
                {c.rows.map((r) => (
                  <span key={r.k} className="sk__row">
                    <span className="sk__k">{r.k}</span>
                    <span className="sk__v">{r.v}</span>
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="sk__mode"
        onClick={toggleSpread}
        aria-pressed={spread}
      >
        {spread ? '收回卡组' : '展开全部'}
        <i aria-hidden data-spread={spread || undefined}>
          <span />
          <span />
          <span />
        </i>
      </button>
    </div>
  )
}

function transitionFor(stage: 'out' | 'back' | null, reduced: boolean) {
  if (reduced) return 'none'
  // 落回最后一层：transform 不过渡，趁看不见的时候直接归位，只淡入
  if (stage === 'back') return `opacity ${BACK_MS}ms var(--ease-out)`
  return `transform ${OUT_MS}ms var(--ease-io), opacity ${Math.round(OUT_MS * 0.8)}ms linear`
}
