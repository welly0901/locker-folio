import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { Group, Matrix3, Plane, Vector3 } from 'three'

/** 超过这个屏幕位移后才把手势认作拖拽；否则按点击处理。 */
const DRAG_THRESHOLD_PX = 5
const DEFAULT_HOVER_LIFT = 0.014
const DEFAULT_HOVER_SCALE = 1.025
const FEEDBACK_SPEED = 11

const _plane = new Plane()
const _normalMatrix = new Matrix3()
const _normal = new Vector3()
const _origin = new Vector3()
const _hitWorld = new Vector3()
const _hitLocal = new Vector3()

export type SurfacePlane = 'xy' | 'xz'

/**
 * 承载面局部坐标里的可移动范围。
 *
 * `u` 始终是局部 X；`v` 在 `xy` 模式下是局部 Y，在 `xz` 模式下是局部 Z。
 * 范围描述的是承载面的边界；组件会再扣掉 `footprint` 的半尺寸，确保物件不越界。
 */
export type SurfaceDragBounds = {
  u: readonly [min: number, max: number]
  v: readonly [min: number, max: number]
}

export type SurfaceDraggableProps = {
  children: ReactNode
  name?: string
  /** 门面使用 `xy`；隔板与地面使用 `xz`。 */
  plane: SurfacePlane
  /** 物件在当前父级（即承载面）坐标系中的初始位置。 */
  position?: readonly [x: number, y: number, z: number]
  /** 承载面的局部边界；不传则不限制。 */
  bounds?: SurfaceDragBounds
  /** 物件在 u/v 两个方向上的占地尺寸，用于边界内缩。 */
  footprint?: readonly [u: number, v: number]
  /**
   * 占地矩形的中心相对物件原点的 u/v 偏移。
   *
   * 大多数门面物件以自身中心为原点，保持 `[0, 0]` 即可；
   * 以底边为原点的背板物件需要把 v 设为高度的一半，
   * 否则拖到上沿时会有一半越出承载面。
   */
  footprintCenter?: readonly [u: number, v: number]
  enabled?: boolean
  /** 未超过 5px 拖拽阈值时触发。 */
  onTap?: () => void
  /** 让外层热点反馈跟随实体自身的 hover，而不是另铺一层抢射线的命中面。 */
  onHoverChange?: (hovered: boolean) => void
  /** 每次有效拖动以及取消回滚后触发，坐标属于当前承载面。 */
  onPositionChange?: (position: readonly [x: number, y: number, z: number]) => void
  hoverLift?: number
  hoverScale?: number
}

type CaptureTarget = EventTarget & {
  setPointerCapture?: (pointerId: number) => void
  releasePointerCapture?: (pointerId: number) => void
  hasPointerCapture?: (pointerId: number) => boolean
}

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  grabU: number
  grabV: number
  fromU: number
  fromV: number
  moved: boolean
  captureTarget: CaptureTarget | null
}

/**
 * 把真实 3D 物件约束在其父级承载面上的通用拖拽容器。
 *
 * 层级刻意拆成两层：外层只保存持久拖拽位置，内层只做 hover / dragging
 * 的抬起与缩放反馈。动画或反馈不会重写拖拽结果；父级即使跟随柜门转动，
 * 射线求交仍始终在父级的当前世界姿态上计算。
 */
const SurfaceDraggable = forwardRef<Group, SurfaceDraggableProps>(function SurfaceDraggable(
  {
    children,
    name = 'SurfaceDraggable',
    plane,
    position = [0, 0, 0],
    bounds,
    footprint = [0, 0],
    footprintCenter = [0, 0],
    enabled = true,
    onTap,
    onHoverChange,
    onPositionChange,
    hoverLift = DEFAULT_HOVER_LIFT,
    hoverScale = DEFAULT_HOVER_SCALE,
  },
  forwardedRef,
) {
  const invalidate = useThree((state) => state.invalidate)
  const eventDocument = useThree((state) => state.gl.domElement.ownerDocument)
  const positionLayer = useRef<Group>(null)
  const feedbackLayer = useRef<Group>(null)
  const drag = useRef<DragState | null>(null)
  const activeTouchPointers = useRef(new Set<number>())
  const touchGestureLocked = useRef(false)
  const hovered = useRef(false)
  const feedback = useRef(0)
  const [positionX, positionY, positionZ] = position

  useImperativeHandle(forwardedRef, () => positionLayer.current as Group, [])

  /* R3F 不接管 position prop，避免父组件普通重渲染把已经拖好的位置写回初值。 */
  useLayoutEffect(() => {
    const group = positionLayer.current
    if (!group) return
    group.position.set(positionX, positionY, positionZ)
  }, [positionX, positionY, positionZ])

  /** 射线命中当前父级坐标系里的 XY / XZ 平面，并返回父级局部坐标。 */
  const localHit = useCallback(
    (event: ThreeEvent<PointerEvent>): Vector3 | null => {
      const group = positionLayer.current
      const carrier = group?.parent
      if (!group || !carrier) return null

      carrier.updateWorldMatrix(true, false)

      // 平面经过物件当前的法向坐标，而非强制经过父级原点。这样同一个父级下
      // 不同高度的隔板物件也能直接使用 XZ 拖拽，而不会跳到 y=0 的地面。
      if (plane === 'xy') {
        _origin.set(0, 0, group.position.z)
        _normal.set(0, 0, 1)
      } else {
        _origin.set(0, group.position.y, 0)
        _normal.set(0, 1, 0)
      }

      carrier.localToWorld(_origin)
      _normalMatrix.getNormalMatrix(carrier.matrixWorld)
      _normal.applyNormalMatrix(_normalMatrix).normalize()
      _plane.setFromNormalAndCoplanarPoint(_normal, _origin)

      if (!event.ray.intersectPlane(_plane, _hitWorld)) return null
      return carrier.worldToLocal(_hitLocal.copy(_hitWorld))
    },
    [plane],
  )

  const notifyPosition = useCallback(() => {
    const group = positionLayer.current
    if (!group || !onPositionChange) return
    onPositionChange([group.position.x, group.position.y, group.position.z])
  }, [onPositionChange])

  const releaseCapture = useCallback((state: DragState) => {
    const target = state.captureTarget
    if (!target?.releasePointerCapture) return
    if (target.hasPointerCapture && !target.hasPointerCapture(state.pointerId)) return
    target.releasePointerCapture(state.pointerId)
  }, [])

  const rollback = useCallback(
    (state: DragState) => {
      const group = positionLayer.current
      if (!group) return
      if (plane === 'xy') group.position.set(state.fromU, state.fromV, group.position.z)
      else group.position.set(state.fromU, group.position.y, state.fromV)
      notifyPosition()
      invalidate()
    },
    [invalidate, notifyPosition, plane],
  )

  /**
   * 原生 capture 阶段先于 R3F 的物件事件执行：第二根手指出现时，立即撤销
   * 第一根手指可能已经开始的物件拖拽。锁会一直保持到所有触点都离开，避免
   * pinch 收尾时剩余手指的 pointerup 被误判成 tap。
   */
  useEffect(() => {
    const touchPointers = activeTouchPointers.current

    const onPointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      touchPointers.add(event.pointerId)
      if (touchPointers.size < 2) return

      touchGestureLocked.current = true
      const state = drag.current
      drag.current = null
      if (state) {
        rollback(state)
        releaseCapture(state)
      }
      document.body.style.cursor = ''
      invalidate()
    }

    const onPointerEndCapture = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      touchPointers.delete(event.pointerId)
      if (touchPointers.size === 0) touchGestureLocked.current = false
    }

    eventDocument.addEventListener('pointerdown', onPointerDownCapture, true)
    eventDocument.addEventListener('pointerup', onPointerEndCapture, true)
    eventDocument.addEventListener('pointercancel', onPointerEndCapture, true)
    return () => {
      eventDocument.removeEventListener('pointerdown', onPointerDownCapture, true)
      eventDocument.removeEventListener('pointerup', onPointerEndCapture, true)
      eventDocument.removeEventListener('pointercancel', onPointerEndCapture, true)
      touchPointers.clear()
      touchGestureLocked.current = false
    }
  }, [eventDocument, invalidate, releaseCapture, rollback])

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>, cancelled: boolean) => {
      const state = drag.current
      if (!state || state.pointerId !== event.pointerId) return
      event.stopPropagation()
      drag.current = null
      if (cancelled) rollback(state)
      else if (!state.moved) onTap?.()
      releaseCapture(state)
      document.body.style.cursor = hovered.current && enabled ? 'grab' : ''
      invalidate()
    },
    [enabled, invalidate, onTap, releaseCapture, rollback],
  )

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!enabled || drag.current) return
    if (event.pointerType === 'touch' && touchGestureLocked.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const hit = localHit(event)
    const group = positionLayer.current
    if (!hit || !group) return

    event.stopPropagation()
    const u = group.position.x
    const v = plane === 'xy' ? group.position.y : group.position.z
    const hitV = plane === 'xy' ? hit.y : hit.z
    const captureTarget = event.target as CaptureTarget
    captureTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabU: hit.x - u,
      grabV: hitV - v,
      fromU: u,
      fromV: v,
      moved: false,
      captureTarget,
    }
    document.body.style.cursor = 'grabbing'
    invalidate()
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const state = drag.current
    const group = positionLayer.current
    if (!state || state.pointerId !== event.pointerId || !group) return
    event.stopPropagation()

    if (!state.moved) {
      const distance = Math.hypot(
        event.clientX - state.startClientX,
        event.clientY - state.startClientY,
      )
      if (distance < DRAG_THRESHOLD_PX) return
      state.moved = true
    }

    const hit = localHit(event)
    if (!hit) return
    const rawU = hit.x - state.grabU
    const rawV = (plane === 'xy' ? hit.y : hit.z) - state.grabV
    const u = clampToSurface(rawU, bounds?.u, footprint[0], footprintCenter[0])
    const v = clampToSurface(rawV, bounds?.v, footprint[1], footprintCenter[1])

    if (plane === 'xy') group.position.set(u, v, group.position.z)
    else group.position.set(u, group.position.y, v)
    notifyPosition()
    invalidate()
  }

  const onPointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (!enabled) return
    event.stopPropagation()
    hovered.current = true
    onHoverChange?.(true)
    if (!drag.current) document.body.style.cursor = 'grab'
    invalidate()
  }

  const onPointerOut = () => {
    hovered.current = false
    onHoverChange?.(false)
    if (!drag.current) document.body.style.cursor = ''
    invalidate()
  }

  /** enabled 在手势中途关闭时等同 pointercancel：回滚且不触发点击。 */
  useEffect(() => {
    if (enabled) return
    hovered.current = false
    onHoverChange?.(false)
    const state = drag.current
    drag.current = null
    if (state) {
      rollback(state)
      releaseCapture(state)
    }
    document.body.style.cursor = ''
    invalidate()
  }, [enabled, invalidate, onHoverChange, releaseCapture, rollback])

  useEffect(
    () => () => {
      const state = drag.current
      if (state) releaseCapture(state)
      onHoverChange?.(false)
      document.body.style.cursor = ''
    },
    [onHoverChange, releaseCapture],
  )

  /* 反馈只写内层；拖拽位置只写外层。收敛后停止 demand 渲染循环。 */
  useFrame((_, delta) => {
    const group = feedbackLayer.current
    if (!group) return
    const target = enabled && (hovered.current || drag.current) ? 1 : 0
    const t = Math.min(1, delta * FEEDBACK_SPEED)
    const next = feedback.current + (target - feedback.current) * t
    const value = Math.abs(next - target) < 0.001 ? target : next
    if (value === feedback.current) return

    feedback.current = value
    if (plane === 'xy') group.position.set(0, 0, hoverLift * value)
    else group.position.set(0, hoverLift * value, 0)
    group.scale.setScalar(1 + (hoverScale - 1) * value)
    if (value !== target) invalidate()
  })

  return (
    <group
      ref={positionLayer}
      name={`${name}_Position`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, false)}
      onPointerCancel={(event) => endDrag(event, true)}
      onLostPointerCapture={(event) =>
        endDrag(event as unknown as ThreeEvent<PointerEvent>, true)
      }
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <group ref={feedbackLayer} name={`${name}_Feedback`}>
        {children}
      </group>
    </group>
  )
})

export default SurfaceDraggable

function clampToSurface(
  value: number,
  range: readonly [min: number, max: number] | undefined,
  footprint: number,
  footprintCenter: number,
): number {
  if (!range) return value
  const lo = Math.min(range[0], range[1])
  const hi = Math.max(range[0], range[1])
  const half = Math.max(0, footprint) / 2
  const innerLo = lo + half - footprintCenter
  const innerHi = hi - half - footprintCenter
  if (innerLo > innerHi) return (lo + hi) / 2 - footprintCenter
  return value < innerLo ? innerLo : value > innerHi ? innerHi : value
}
