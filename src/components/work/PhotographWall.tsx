import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PHOTOS } from '../../data/content'
import BackToFolders from './BackToFolders'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { startFrames, stopFrames, type FrameFn } from './frameLoop'
import { releaseImages, SIZES, workImage } from './imageSources'
import './photo.css'

const COLS = 4
const ROWS = 4
/**
 * 槽位外框（也是所有 SHAPES 的上限）。
 * 448 × cos12° ≈ 438 落到屏幕上，占 1440 画幅的 30.4%，正好在参考图的 25–33% 区间里；
 * 原来的 300 在任何常见宽度下都低于这个区间，所以整面墙看着像一堆均匀的小缩略图。
 */
const CELL_W = 448
const CELL_H = 368
/** 槽位间距。SHAPES 里没有任何一档超过 CELL_W × CELL_H，所以 64 就是两格之间可能出现的最小间隙 */
const GAP = 64
const SX = CELL_W + GAP // 512
const SY = CELL_H + GAP // 432
const TW = COLS * SX
const TH = ROWS * SY
/** 每列的错落偏移，让网格不像表格：仍是行距 SY 的 [0, .39, .14, .54]，只是换算到新的 SY 432 */
const COL_SHIFT = [0, 168, 60, 232]
/**
 * 必须严格等于 max(COL_SHIFT)，这不是可调参数。
 * 取小了，偏移最多那一列的顶行会在还没滑出屏幕时就被窗口裁掉，向上拖的时候能看见格子凭空冒出来。
 */
const MAX_SHIFT = 232
/** 透视 + rotateY(-12deg) 后，远侧的格子会被缩小，按最坏比例放大取样范围 */
const PERSP = 1.12
/** 视口外再多留的一圈余量 */
const MARGIN_X = CELL_W * 0.8
const MARGIN_Y = CELL_H * 0.8
/**
 * 标定画幅宽度（与 sceneConfig 的 1320×724 底稿一致）。
 * 窄于它就整体等比缩小：448 的格子放到 390 的手机上是视口的 115%，不缩放直接就破版。
 */
const REF_W = 1320
/**
 * 16 个槽位各自的外框，专门打破「每格一样大、一样比例」的均质感。
 * 索引用的是照片墙自己的槽位号（和取图同一个），而不是 gx/gy 的散列 ——
 * 散列会让同一张照片在无限平铺里换个位置就换个尺寸，接缝立刻穿帮。
 * 每一档都 ≤ 448×368，所以最小间隙仍是 GAP 64，任何两格都不会叠。
 * 格子靠 translate3d(-50%, -50%, 0) 居中在槽位里，尺寸变化直接变成间隙变化，这就是节奏感的来源。
 */
const SHAPES: [number, number][] = [
  [448, 300], [332, 368], [424, 280], [376, 344],
  [376, 344], [448, 280], [332, 368], [424, 300],
  [424, 368], [376, 280], [448, 300], [332, 344],
  [332, 300], [424, 344], [376, 368], [448, 280],
]
/** 惯性停止阈值（像素/帧） */
const STOP_V = 0.12

/**
 * 无人操作时的自动漂移，单位是每帧像素（60fps 下约 14px/s 向左、6px/s 向上）。
 *
 * 这是本模块**故意**打破「静止时零 rAF」的地方：墙本身就该一直在走。
 * 代价被限制在这一个栏目里 —— 组件卸载时 stopFrames 收掉循环，
 * 指针悬停时也停（不然想看的那张会从手底下滑走，hover 显影就没法用了）。
 */
const DRIFT_X = -0.24
const DRIFT_Y = -0.1
/** 位移绝对值超过这个量级就归一化一次，避免 transform 掉进浮点误差区 */
const RENORM = 5e5

const mod = (v: number, m: number) => ((v % m) + m) % m

type Cell = { key: string; x: number; y: number; w: number; h: number; src: string }
/** k 也进窗口：它变了但四个角没变时（比如 1280 → 1100 算出同一组 gx0..gy1）格子尺寸会留在旧值上 */
type Win = { gx0: number; gx1: number; gy0: number; gy1: number; k: number }

/**
 * 算出可见窗口内的格子；世界坐标按无限网格推导，内容按 4×4 取模复用。
 * 步距、错落、尺寸都在这里乘一次 w.k —— 全局只此一处缩放，别在渲染时再乘一遍，那会把 k 平方。
 */
function buildCells(w: Win): Cell[] {
  const out: Cell[] = []
  for (let gy = w.gy0; gy <= w.gy1; gy++) {
    for (let gx = w.gx0; gx <= w.gx1; gx++) {
      const c = mod(gx, COLS)
      const r = mod(gy, ROWS)
      const slot = (r * COLS + c) % PHOTOS.length
      const [sw, sh] = SHAPES[slot % SHAPES.length]
      out.push({
        key: `${gx}_${gy}`,
        x: gx * SX * w.k,
        y: (gy * SY + COL_SHIFT[c]) * w.k,
        w: sw * w.k,
        h: sh * w.k,
        src: PHOTOS[slot],
      })
    }
  }
  return out
}

/**
 * SELECTED WORK › PHOTOGRAPH —— 可无限拖拽的照片墙。
 *
 * 整改：
 * - 不再一次铺 3×3 个 tile 共 144 个图片节点；改为按可见区虚拟化，
 *   只渲染视口内 + 一圈余量的格子（1320×724 下算出来是 5×4 = 20 个）。
 * - 拖拽偏移存在 ref 里，逐帧只写一次平面 transform，不每帧 setState。
 * - React 只在“可见格子集合”变化时重渲染；静止时既没有 rAF 也没有 render。
 */
export default function PhotographWall() {
  const fieldRef = useRef<HTMLDivElement>(null)
  const planeRef = useRef<HTMLDivElement>(null)
  const off = useRef({ x: 0, y: 0 })
  const vel = useRef({ x: 0, y: 0 })
  const drag = useRef({ on: false, x: 0, y: 0, ox: 0, oy: 0 })
  /** 指针在墙上时暂停漂移；ref 而不是 state，避免每次进出都重渲染整面墙 */
  const hover = useRef(false)
  const reduced = useReducedMotion()
  const reducedRef = useRef(reduced)
  // k: 0 是哨兵值，真实的 k 恒 > 0（clientWidth 为 0 时 paint 直接返回），所以首帧必定重铺
  const winRef = useRef<Win>({ gx0: 0, gx1: -1, gy0: 0, gy1: -1, k: 0 })
  const stepRef = useRef<FrameFn | null>(null)
  const [cells, setCells] = useState<Cell[]>([])

  /** 写平面位移，并在可见窗口变化时才触发一次 React 更新 */
  const paint = useCallback(() => {
    const field = fieldRef.current
    const plane = planeRef.current
    if (!field || !plane) return

    const fw = field.clientWidth
    // 布局还没发生（clientWidth 为 0）时整帧跳过：k 会是 0，除以 0 的窗口是 ±Infinity，循环停不下来；
    // 此时画面上本来也什么都看不见，ResizeObserver 拿到真实尺寸后会立刻再画一次
    if (fw === 0) return
    // 窄屏整体等比缩小。基准取 1320（全站标定画幅宽度，见 sceneConfig.ts），不是 1280
    const k = Math.min(1, fw / REF_W)

    // 极端长距离拖拽后归一化，网格周期为 TW / TH（同样要乘 k），归一化不改变任何格子的内容
    if (Math.abs(off.current.x) > RENORM) off.current.x = mod(off.current.x, TW * k)
    if (Math.abs(off.current.y) > RENORM) off.current.y = mod(off.current.y, TH * k)

    const { x, y } = off.current
    // rotateZ 放在这里而不是 CSS 里：transform 这个属性已经归 JS 所有；
    // CSS 的 rotate: y -12deg 是独立属性，按 CSS Transforms L2 仍然照常叠加。
    // 纯 rotateY 留不下斜的竖边，这 -3° 的面内旋转才是参考图里列不完全正交的那点味道。
    plane.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotateZ(-3deg)`

    // 窗口必须用与 buildCells 完全相同的缩放后步距，否则窗口和实际版面对不上，边缘会少铺一圈
    const sx = SX * k
    const sy = SY * k
    const hw = (fw / 2) * PERSP + MARGIN_X * k
    const hh = (field.clientHeight / 2) * PERSP + MARGIN_Y * k
    const next: Win = {
      gx0: Math.ceil((-hw - x) / sx),
      gx1: Math.floor((hw - x) / sx),
      gy0: Math.ceil((-hh - y - MAX_SHIFT * k) / sy),
      gy1: Math.floor((hh - y) / sy),
      k,
    }
    const cur = winRef.current
    if (
      next.gx0 !== cur.gx0 ||
      next.gx1 !== cur.gx1 ||
      next.gy0 !== cur.gy0 ||
      next.gy1 !== cur.gy1 ||
      next.k !== cur.k
    ) {
      winRef.current = next
      setCells(buildCells(next))
    }
  }, [])

  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  /* 唯一的帧回调：拖拽跟手 → 惯性 → 漂移 */
  useEffect(() => {
    stepRef.current = () => {
      if (drag.current.on) {
        paint()
        return true
      }
      const v = vel.current
      if (Math.abs(v.x) > STOP_V || Math.abs(v.y) > STOP_V) {
        v.x *= 0.93
        v.y *= 0.93
        off.current.x += v.x
        off.current.y += v.y
        paint()
        return true
      }
      v.x = 0
      v.y = 0
      if (!reducedRef.current && !hover.current && !drag.current.on) {
        off.current.x += DRIFT_X
        off.current.y += DRIFT_Y
        paint()
        return true
      }
      paint() // 落位帧
      return false
    }
    const step = stepRef.current
    return () => stopFrames(step)
  }, [paint])

  const wake = useCallback(() => {
    if (stepRef.current) startFrames(stepRef.current)
  }, [])

  /* 首次铺格 + 视口尺寸变化重算窗口；离开栏目时断开图片引用 */
  useLayoutEffect(() => {
    paint()
    // 进栏目就开始漂移；Reduced Motion 下 step 会立刻 return false，等于没开
    if (stepRef.current) startFrames(stepRef.current)
    const field = fieldRef.current
    const ro = new ResizeObserver(() => paint())
    if (field) ro.observe(field)
    return () => {
      ro.disconnect()
      releaseImages(field)
    }
  }, [paint])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      off.current.x -= e.deltaX * 0.9
      off.current.y -= e.deltaY * 0.9
      wake() // 只借一帧把新位置画出去，随后自动停
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [wake])

  const onDown = (e: React.PointerEvent) => {
    drag.current = { on: true, x: e.clientX, y: e.clientY, ox: off.current.x, oy: off.current.y }
    vel.current = { x: 0, y: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    wake()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return
    const nx = drag.current.ox + (e.clientX - drag.current.x)
    const ny = drag.current.oy + (e.clientY - drag.current.y)
    vel.current = { x: (nx - off.current.x) * 0.55, y: (ny - off.current.y) * 0.55 }
    off.current = { x: nx, y: ny }
    wake()
  }
  const onUp = () => {
    if (!drag.current.on) return
    drag.current.on = false
    wake() // 惯性继续用同一个调度器
  }

  return (
    <div className="wv pw">
      <BackToFolders />
      <div
        ref={fieldRef}
        className="pw__field"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerEnter={() => {
          hover.current = true
        }}
        onPointerLeave={() => {
          hover.current = false
          wake()
        }}
      >
        <div className="pw__persp">
          <div ref={planeRef} className="pw__plane">
            {cells.map((c) => (
              <figure
                key={c.key}
                className="pw__cell"
                style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
              >
                <img
                  {...workImage('photo', c.src)}
                  sizes={SIZES.photo}
                  alt=""
                  decoding="async"
                  draggable={false}
                />
                <span className="pw__veil" />
              </figure>
            ))}
          </div>
        </div>
        <div className="pw__vignette" aria-hidden />
      </div>
      <p className="wv__tip pw__tip">DRAG TO EXPLORE · HOVER TO REVEAL</p>
    </div>
  )
}
