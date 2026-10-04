import { useReducer, useRef } from 'react'
import { NOTE_COLORS, SEED_NOTES } from '../../data/content'
import CloseButton from './CloseButton'
import ContactTypewriter from './ContactTypewriter'
import './overlay.css'
import './contact.css'

type Note = {
  id: string
  no: number
  text: string
  /** 预置便签的大标题（如「简历」「作品集」） */
  title?: string
  /** 标题下方的小字提示（如「点击下载」） */
  hint?: string
  /** 下载地址：有值时整张便签渲染为 <a download>，而不是装饰 div */
  href?: string
  /** 建议的下载文件名 */
  downloadName?: string
  color: string
  x: number
  y: number
  rot: number
  /** 用户自己钉上去的便签才可以拖动、移动和删除 */
  own: boolean
}

type Board = {
  /** 下一张便签的编号，同时显示在打字纸抬头上 */
  seq: number
  notes: Note[]
  draft: string
  /** 刚钉上去、正在播入场动画的便签 */
  fresh: string | null
  /** 给屏幕阅读器的状态播报 */
  status: string
}

type Action =
  | { type: 'draft'; text: string }
  | { type: 'pin' }
  | { type: 'settle'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'remove'; id: string }

/* 软木板上不压住打字机的落点 */
const SPOTS = [
  { x: 34, y: 14 },
  { x: 52, y: 8 },
  { x: 16, y: 12 },
  { x: 63, y: 46 },
  { x: 8, y: 62 },
  { x: 44, y: 62 },
  { x: 86, y: 58 },
  { x: 24, y: 33 },
]

const FIRST_NO = SEED_NOTES.length + 1

/** 由编号推出的确定性抖动：reducer 必须是纯函数，不能在里面掷随机数 */
function jitter(seed: number, span: number) {
  const t = Math.sin(seed * 12.9898) * 43758.5453
  return (t - Math.floor(t) - 0.5) * span
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const initial: Board = {
  seq: FIRST_NO,
  notes: SEED_NOTES.map((n) => ({ ...n, no: 0, own: false })),
  draft: '',
  fresh: null,
  status: '',
}

/**
 * 便签板事务。
 *
 * “编号递增 + 输入清空 + 新便签出现” 全部发生在同一次 reducer 调用里，
 * 编号只从 `state.seq` 取。React 会把连续派发的 action 串行地喂给 reducer，
 * 所以快速连续提交也不会两张便签拿到同一个编号 —— 换成读闭包里的 seq 就会。
 */
function reduce(state: Board, action: Action): Board {
  switch (action.type) {
    case 'draft':
      return { ...state, draft: action.text }

    case 'pin': {
      const text = state.draft.trim()
      if (!text) return state
      const no = state.seq
      const id = `n${no}`
      const spot = SPOTS[(no - FIRST_NO) % SPOTS.length]
      const note: Note = {
        id,
        no,
        text,
        color: NOTE_COLORS[(no - 1) % NOTE_COLORS.length],
        x: clamp(spot.x + jitter(no, 6), 0, 88),
        y: clamp(spot.y + jitter(no + 99, 6), 0, 78),
        rot: jitter(no + 7, 8),
        own: true,
      }
      return {
        seq: no + 1,
        notes: [...state.notes, note],
        draft: '',
        fresh: id,
        status: `便签 ${String(no).padStart(3, '0')} 已钉在软木板上，仅保存在本机。`,
      }
    }

    case 'settle':
      return state.fresh === action.id ? { ...state, fresh: null } : state

    case 'move':
      return {
        ...state,
        notes: state.notes.map((n) => (n.id === action.id ? { ...n, x: action.x, y: action.y } : n)),
      }

    case 'remove': {
      const gone = state.notes.find((n) => n.id === action.id)
      if (!gone?.own) return state
      return {
        ...state,
        notes: state.notes.filter((n) => n.id !== action.id),
        fresh: state.fresh === action.id ? null : state.fresh,
        status: `便签 ${String(gone.no).padStart(3, '0')} 已取下。`,
      }
    }
  }
}

/** CONTACT —— 软木板 + 打字机留言（纯本地演示，不发送到任何服务端） */
export default function ContactBoard() {
  const [board, dispatch] = useReducer(reduce, initial)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const corkRef = useRef<HTMLDivElement>(null)

  const pin = () => {
    if (!board.draft.trim()) {
      taRef.current?.focus()
      return
    }
    dispatch({ type: 'pin' })
    taRef.current?.focus()
  }

  /**
   * 把一张便签移到新的百分比位置，并夹在软木板范围内。
   * 便签是旋转过的，边界要按旋转后的外接盒算，否则贴边时角会被软木板裁掉。
   */
  const moveTo = (el: HTMLElement, note: Note, x: number, y: number) => {
    const cork = corkRef.current
    if (!cork) return
    const cr = cork.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const rad = (note.rot * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    // 旋转外接盒相对布局盒在每一侧多出来的量
    const padX = (w * cos + h * sin - w) / 2
    const padY = (w * sin + h * cos - h) / 2
    const minX = (padX / cr.width) * 100
    const minY = (padY / cr.height) * 100
    dispatch({
      type: 'move',
      id: note.id,
      x: clamp(x, minX, 100 - ((w + padX) / cr.width) * 100),
      y: clamp(y, minY, 100 - ((h + padY) / cr.height) * 100),
    })
  }

  const startDrag = (e: React.PointerEvent<HTMLDivElement>, note: Note) => {
    if (!note.own || e.button !== 0) return
    const el = e.currentTarget
    const cork = corkRef.current
    if (!cork) return
    const cr = cork.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // 合成事件没有真实指针时会抛错，不影响后面的监听
    }
    el.focus({ preventScroll: true })

    const onMove = (ev: PointerEvent) => {
      moveTo(
        el,
        note,
        note.x + ((ev.clientX - startX) / cr.width) * 100,
        note.y + ((ev.clientY - startY) / cr.height) * 100,
      )
    }
    const stop = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', stop)
      el.removeEventListener('pointercancel', stop)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', stop)
    el.addEventListener('pointercancel', stop)
  }

  const onNoteKey = (e: React.KeyboardEvent<HTMLDivElement>, note: Note) => {
    if (!note.own) return
    const step = e.shiftKey ? 8 : 2
    const el = e.currentTarget
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        moveTo(el, note, note.x - step, note.y)
        break
      case 'ArrowRight':
        e.preventDefault()
        moveTo(el, note, note.x + step, note.y)
        break
      case 'ArrowUp':
        e.preventDefault()
        moveTo(el, note, note.x, note.y - step)
        break
      case 'ArrowDown':
        e.preventDefault()
        moveTo(el, note, note.x, note.y + step)
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        dispatch({ type: 'remove', id: note.id })
        taRef.current?.focus()
        break
    }
  }

  const noteNo = String(board.seq).padStart(3, '0')

  return (
    <div className="ov">
      <div className="cb">
        <CloseButton />
        <div className="cb__frame">
          <div className="cb__cork" ref={corkRef}>
            <p className="cb__sr" aria-live="polite">
              {board.status}
            </p>

            {/* 置顶的自我介绍长信笺：固定自述，不进可编辑便签列表 */}
            <div className="cb__memo">
              <span className="cb__memoHead">
                <span>CONTACT</span>
                <span>联系方式</span>
              </span>
              <span className="cb__memoHead cb__memoHead--sub">
                <span>NOTE No. 001</span>
                <span>TYPEWRITER OFFICE</span>
              </span>
              <p>
                我具备扎实的广告学专业基础，擅长文案策划、视觉设计、视频剪辑及新媒体运营。在项目实践中积累了丰富的实战经验，期待在未来的工作中一起创造有影响力的内容。如果你对我的能力或项目经验感兴趣，欢迎随时与我取得联系。
              </p>
            </div>

            {board.notes.map((n) => {
              const noteStyle = {
                left: `${n.x}%`,
                top: `${n.y}%`,
                background: n.color,
                transform: `rotate(${n.rot}deg)`,
              }
              const className = `cb__note${n.title ? ' cb__note--file' : ''}${
                n.href ? ' cb__note--link' : ''
              }`
              const inner = (
                <>
                  <span className="cb__pin" aria-hidden />
                  <p>
                    {n.title && <span className="cb__noteTitle">{n.title}</span>}
                    {n.text}
                    {n.hint && <span className="cb__noteHint">{n.hint}</span>}
                  </p>
                </>
              )

              /* 带下载地址的预置便签：整张就是一个下载链接，可聚焦、可键盘回车 */
              if (n.href) {
                return (
                  <a
                    key={n.id}
                    className={className}
                    data-note={n.id}
                    href={n.href}
                    download={n.downloadName ?? true}
                    aria-label={`${n.title ?? ''}${n.hint ? `，${n.hint}` : ''}`}
                    style={noteStyle}
                  >
                    {inner}
                  </a>
                )
              }

              return (
                <div
                  key={n.id}
                  className={className}
                  data-note={n.id}
                  data-fresh={board.fresh === n.id ? '' : undefined}
                  data-own={n.own || undefined}
                  // 装饰性的初始便签不进入无障碍树，也不占 Tab 顺序
                  aria-hidden={n.own ? undefined : true}
                  role={n.own ? 'group' : undefined}
                  aria-roledescription={n.own ? '便签' : undefined}
                  aria-label={
                    n.own
                      ? `便签 ${String(n.no).padStart(3, '0')}：${n.text}。方向键移动，Shift 加速，Delete 取下。`
                      : undefined
                  }
                  tabIndex={n.own ? 0 : undefined}
                  onPointerDown={(e) => startDrag(e, n)}
                  onKeyDown={(e) => onNoteKey(e, n)}
                  onAnimationEnd={() => dispatch({ type: 'settle', id: n.id })}
                  style={noteStyle}
                >
                  {inner}
                  {n.own && (
                    <button
                      type="button"
                      className="cb__del"
                      aria-label={`取下便签 ${String(n.no).padStart(3, '0')}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        dispatch({ type: 'remove', id: n.id })
                        taRef.current?.focus()
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}

            {/* 打字机：柜门里那台真实网格，无 WebGL 时自动退回 CSS 平面画 */}
            <div className="cb__machine" aria-hidden>
              <ContactTypewriter />
            </div>

            {/* 打字机里的信纸 */}
            <form
              className="cb__paper"
              onSubmit={(e) => {
                e.preventDefault()
                pin()
              }}
            >
              <span className="cb__paperTop">
                <span>CONTACT</span>
                <span>联系方式</span>
              </span>
              <span className="cb__paperTop cb__paperTop--sub">
                <span>NOTE No. {noteNo}</span>
                <span>TYPEWRITER OFFICE</span>
              </span>
              <textarea
                ref={taRef}
                className="cb__input"
                value={board.draft}
                maxLength={90}
                spellCheck={false}
                aria-label="留言内容"
                placeholder="在这里输入一段想法……"
                onChange={(e) => dispatch({ type: 'draft', text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    pin()
                  }
                }}
              />
              <span className="cb__paperFoot">
                <span className="cb__kbd">⌘ / Ctrl + Enter</span>
                <button type="submit" className="cb__submit">
                  TYPE NOTE
                </button>
              </span>
              {/* 没有后端，界面必须说清楚这是本地演示，不能假装已经发出去了 */}
              <span className="cb__demo">
                本地演示 · 便签只留在这台设备的当前页面，不会发送给任何人
              </span>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
