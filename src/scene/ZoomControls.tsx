import { useThree } from '@react-three/fiber'
import { useEffect, useSyncExternalStore } from 'react'
import { useSceneCapabilities } from '../store'
import { resetZoom, subscribeZoom, zoomBy, zoomGoal, zoomStep } from './userZoom'

/* ============================================================================
 * 缩放输入与控件（双指缩放 / 滚轮缩放）
 *
 * 分成两半，因为它们必须住在不同的树里：
 *   ZoomInput    在 Canvas 内 —— 要拿 gl.domElement 和 invalidate
 *   ZoomControls 在 Canvas 外 —— 是真正的 <button>，要能被读屏和键盘拿到
 *
 * 两半都只在 `freeCamera` 能力打开时生效。开场时间线、局部聚焦、返回这些
 * 状态里相机是被脚本驱动的，此时插进来一脚会把标定构图搅乱。
 * ========================================================================== */

/** 一格滚轮（约 100px）对应的倍率，与按钮的一步保持一致 */
const WHEEL_K = Math.log(1.16) / 100

/** deltaMode 换算成像素：1=行、2=页 */
function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 16
  if (e.deltaMode === 2) return e.deltaY * 400
  return e.deltaY
}

function touchDist(t: TouchList): number {
  const dx = t[0].clientX - t[1].clientX
  const dy = t[0].clientY - t[1].clientY
  return Math.hypot(dx, dy) || 1
}

/** 挂在 Canvas 里：滚轮与双指。自身不渲染任何东西 */
export function ZoomInput() {
  const el = useThree((s) => s.gl.domElement)
  const invalidate = useThree((s) => s.invalidate)
  const free = useSceneCapabilities().freeCamera

  /*
   * 任何来源的缩放都要唤醒渲染循环。
   *
   * 稳定态下 frameloop 是 demand，没人调 invalidate 就一帧都不画。
   * 滚轮和双指在这个组件里，顺手就能调；但屏幕上那三个键住在 Canvas **外面**，
   * 拿不到 invalidate —— 只改目标值的话画面纹丝不动，按钮看起来是坏的。
   * 所以统一订阅目标值的变化来续帧，谁改的都一样。
   */
  useEffect(() => subscribeZoom(invalidate), [invalidate])

  useEffect(() => {
    if (!free) return

    const onWheel = (e: WheelEvent) => {
      // 场景是全屏的、页面本身不滚动，这里吃掉滚动事件不会挡住任何内容；
      // 浮层是独立的 DOM 层，在它上面滚不会冒泡到 canvas
      e.preventDefault()
      zoomBy(Math.exp(wheelPixels(e) * WHEEL_K))
    }

    /**
     * 双指距离。只在恰好两指时接管 —— 单指要留给贴花拖拽，
     * 三指以上是系统手势，不碰。
     */
    let prev = 0
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) prev = touchDist(e.touches)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      // 不吃掉的话 iOS 会拿去做整页缩放，页面被放大后柜体反而更看不全
      e.preventDefault()
      const d = touchDist(e.touches)
      if (prev > 0) zoomBy(prev / d)
      prev = d
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) prev = 0
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [el, free])

  return null
}

/**
 * 屏幕上的缩放控件。
 *
 * 触屏没有滚轮，双指缩放又是不可见的能力 —— 手机上如果只有手势，
 * 用户遇到的就是「柜子放大了退不回去」。所以这三个键是必需的，不是装饰。
 */
export default function ZoomControls() {
  const free = useSceneCapabilities().freeCamera
  const goal = useSyncExternalStore(subscribeZoom, zoomGoal, zoomGoal)
  if (!free) return null
  const zoomed = Math.abs(goal - 1) > 0.001

  return (
    <div className="zoomc" role="group" aria-label="视图缩放">
      <button type="button" className="zoomc__b" aria-label="放大" onClick={() => zoomStep(-1)}>
        ＋
      </button>
      <button type="button" className="zoomc__b" aria-label="缩小" onClick={() => zoomStep(1)}>
        －
      </button>
      <button
        type="button"
        className="zoomc__b zoomc__b--reset"
        aria-label="恢复默认视图"
        data-on={zoomed || undefined}
        disabled={!zoomed}
        onClick={resetZoom}
      >
        ⤾
      </button>
    </div>
  )
}
