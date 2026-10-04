import { startFrames, stopFrames } from './frameLoop'
import './transition.css'

/**
 * 作品子页面 → SELECTED WORK 文件夹的返回过渡。
 *
 * 参考里这段是一层米黄色的径向/波浪遮罩：从画面底部中间顶上来盖住整屏，
 * 换页之后再像波纹一样向外散开露出文件夹。
 *
 * 实现上刻意脱离 React：遮罩挂在 body 上，调用方（BackToFolders）
 * 在遮罩盖满的瞬间就被卸载了，组件树里放不住这段动画。
 */

/** 推开盖满 */
const COVER_MS = 520
/** 盖满后多久切换视图（留一点余量确保已经全黑） */
const SWAP_AT = 460
/** 波纹散开 */
const OUT_MS = 640
const EASE_IN = 'cubic-bezier(0.52, 0, 0.3, 1)'

let running = false

/**
 * 遮罩原点。
 *
 * 参考里这层米黄是从画面底部中间顶上来的：先在下边缘露出一道很平的弧，
 * 弧顶一路推到画面上方盖满，不是从左上角的返回按钮扩散。逐帧核对
 * （参考 29.2–30.2s）弧顶始终居中、曲率很缓，对应一个圆心在视口下沿、
 * 半径大于视口对角线的大圆。
 */
function sweepOrigin() {
  return { x: window.innerWidth / 2, y: window.innerHeight }
}

/** 原点到视口四角的最远距离 —— 圆盘要盖满就得有这个半径 */
function coverRadius(x: number, y: number) {
  const w = window.innerWidth
  const h = window.innerHeight
  return Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y))
}

function prefersReduced() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 播放返回过渡。`onCover` 会在遮罩盖满时被调用一次，用来真正切换视图。
 * 过渡期间重复调用只会直接切换，不会叠加第二层遮罩。
 */
export function sweepBackToFolders(onCover: () => void) {
  if (running || typeof document === 'undefined') {
    onCover()
    return
  }
  running = true
  const origin = sweepOrigin()

  const host = document.createElement('div')
  host.className = 'wt'
  host.setAttribute('aria-hidden', 'true')

  // Reduced Motion：只留一次极短的状态提示，不做长距离扩张
  if (prefersReduced()) {
    host.style.background = '#efe1c2'
    document.body.appendChild(host)
    onCover()
    window.setTimeout(() => {
      host.remove()
      running = false
    }, 140)
    return
  }

  const r = coverRadius(origin.x, origin.y)
  const size = `${Math.ceil(r * 2)}px`
  const disc = document.createElement('span')
  const wave = document.createElement('span')
  disc.className = 'wt__disc'
  wave.className = 'wt__wave'
  for (const el of [wave, disc]) {
    el.style.left = `${origin.x}px`
    el.style.top = `${origin.y}px`
    el.style.width = size
    el.style.height = size
  }
  host.append(wave, disc)
  document.body.appendChild(host)

  disc.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0)' },
      { transform: 'translate(-50%, -50%) scale(1)' },
    ],
    { duration: COVER_MS, easing: EASE_IN, fill: 'forwards' },
  )
  wave.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
      { opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -50%) scale(1.18)', opacity: 0 },
    ],
    { duration: COVER_MS + 170, easing: 'cubic-bezier(0.24, 0.72, 0.3, 1)', fill: 'forwards' },
  )

  let swapped = false
  let elapsed = 0

  // 一个帧回调走完“等待盖满 → 切视图 → 波纹散开”，中途不另起循环
  const step = (dt: number) => {
    elapsed += dt
    if (!swapped) {
      if (elapsed < SWAP_AT) return true
      swapped = true
      onCover()
      host.classList.add('wt--out')
      host.style.setProperty('--wt-ox', `${origin.x}px`)
      host.style.setProperty('--wt-oy', `${origin.y}px`)
      host.style.setProperty('--wt-r', '0px')
      elapsed = 0
      return true
    }
    const t = Math.min(1, elapsed / OUT_MS)
    // easeOutCubic：波纹一开始快、收尾慢
    const e = 1 - (1 - t) ** 3
    host.style.setProperty('--wt-r', `${(e * (r + 96)).toFixed(1)}px`)
    if (t < 1) return true
    host.remove()
    running = false
    return false
  }

  startFrames(step)

  // 兜底：万一页面被切到后台导致循环长时间不推进，也要把遮罩收掉
  window.setTimeout(
    () => {
      if (!host.isConnected) return
      if (!swapped) onCover()
      stopFrames(step)
      host.remove()
      running = false
    },
    (SWAP_AT + OUT_MS) * 3,
  )
}
