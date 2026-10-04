import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LinearFilter,
  NoToneMapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'
import { POSTERS } from '../../data/content'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useCapabilities } from '../fallback'
import { startFrames, stopFrames, type FrameFn } from './frameLoop'
import { workImage } from './imageSources'
import PostersThreeScene, {
  type PosterMotionSnapshot,
  type PosterMotionPhase,
  type PostersThreeApi,
} from './PostersThreeScene'

const SPAN = 468
const LOOP = POSTERS.length * SPAN
const TAU = Math.PI * 2
const REST_OFFSET = -SPAN
const INTRO_DECODE_WAIT_MS = 1_200
const DRAG_INTENT_PX = 8
const STOP_V = 0.08

type DragState = {
  tracking: boolean
  locked: boolean
  pointerId: number | null
  sx: number
  sy: number
  base: number
  last: number
  lastT: number
}

type TextureState = {
  textures: Array<Texture | null>
  statuses: Array<'pending' | 'ready' | 'error'>
  gateOpen: boolean
}

type LoadedPosterTexture = {
  texture: Texture
  closeSource: () => void
}

function idleDrag(): DragState {
  return {
    tracking: false,
    locked: false,
    pointerId: null,
    sx: 0,
    sy: 0,
    base: 0,
    last: 0,
    lastT: 0,
  }
}

function wrap(value: number) {
  return ((value % LOOP) + LOOP) % LOOP
}

function isCriticalPoster(index: number) {
  const angle = (wrap(index * SPAN + REST_OFFSET) / LOOP) * TAU
  return Math.cos(angle) > 0
}

function posterTextureUrl(name: string) {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
  const width = typeof window === 'undefined' ? 1320 : window.innerWidth
  // Three 卡片实际显示上限约 248 CSS px；普通桌面用 400，Retina/大屏用 700。
  const variant = dpr > 1.25 || width > 1500 ? 700 : 400
  return `/assets/posters/${name}-${variant}.webp`
}

function configurePosterTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  // Chromium/ANGLE 对未完成 decode 的 NPOT WebP 建 mip level 会直接产出黑纹理。
  // 作品已有 400/700 两档，关闭运行期 mipmap 后仍有足够清晰度，也彻底避开该路径。
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
}

async function loadPosterTexture(url: string, signal: AbortSignal): Promise<LoadedPosterTexture> {
  // ImageBitmap 只有在完整解码后才 resolve，width/height 也已冻结；这保证 Three
  // 第一次上传时拿到的不是 onload 与 decode 之间那个不稳定的 HTMLImageElement。
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`poster ${response.status}: ${url}`)
      const bitmap = await createImageBitmap(await response.blob(), {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      })
      const texture = new Texture(bitmap)
      texture.flipY = false
      configurePosterTexture(texture)
      return { texture, closeSource: () => bitmap.close() }
    } catch (error) {
      if (signal.aborted) throw error
      // 旧版 Safari 存在 createImageBitmap 但会拒绝部分 WebP options；继续走
      // Three ImageLoader，而不是把可正常显示的封面误判成永久失败。
    }
  }

  // 极少数没有 createImageBitmap 的浏览器交给 Three 自己的 ImageLoader；不再
  // 在 load 回调里手工 new Texture(image)，同时沿用相同的无 mipmap 上传策略。
  const texture = await new TextureLoader().loadAsync(url)
  configurePosterTexture(texture)
  return { texture, closeSource: () => undefined }
}

/**
 * 每张封面先完整 decode 为 ImageBitmap，再创建 Three Texture。这样不会让
 * R3F Suspense 因一张坏图白屏，也保留 1.2 秒的弱网超时；非关键封面到达后
 * 会独立贴到对应书卡上。
 */
function usePosterTextures(enabled: boolean): TextureState {
  const [state, setState] = useState<TextureState>(() => ({
    textures: POSTERS.map(() => null),
    statuses: POSTERS.map(() => 'pending'),
    gateOpen: false,
  }))

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let gateOpened = false
    const created: Array<Texture | null> = POSTERS.map(() => null)
    const closeSources: Array<(() => void) | null> = POSTERS.map(() => null)
    const controller = new AbortController()

    const openGate = () => {
      if (cancelled || gateOpened) return
      gateOpened = true
      setState((current) => ({ ...current, gateOpen: true }))
    }

    const loads = POSTERS.map(async (poster, index) => {
      try {
        const loaded = await loadPosterTexture(posterTextureUrl(poster.src), controller.signal)
        if (cancelled) {
          loaded.texture.dispose()
          loaded.closeSource()
          return
        }
        loaded.texture.name = `poster:${poster.src}`
        created[index] = loaded.texture
        closeSources[index] = loaded.closeSource
        setState((current) => {
          const textures = [...current.textures]
          const statuses = [...current.statuses]
          textures[index] = loaded.texture
          statuses[index] = 'ready'
          return { ...current, textures, statuses }
        })
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
        setState((current) => {
          const statuses = [...current.statuses]
          statuses[index] = 'error'
          return { ...current, statuses }
        })
      }
    })

    const timeoutId = window.setTimeout(openGate, INTRO_DECODE_WAIT_MS)
    const critical = loads.filter((_, index) => isCriticalPoster(index))
    void Promise.allSettled(critical).then(openGate)
    void Promise.allSettled(loads)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      controller.abort()
      for (const texture of created) texture?.dispose()
      for (const closeSource of closeSources) closeSource?.()
    }
  }, [enabled])

  return state
}

const STATIC_FAN = [
  { index: 0, x: -178, y: 20, rotate: -14, scale: 0.78, z: 1 },
  { index: 3, x: -92, y: -4, rotate: -7, scale: 0.9, z: 2 },
  { index: 4, x: 176, y: 24, rotate: 14, scale: 0.78, z: 1 },
  { index: 2, x: 94, y: 4, rotate: 8, scale: 0.9, z: 2 },
  { index: 1, x: 0, y: 0, rotate: -1.5, scale: 1, z: 3 },
]

function StaticPosterFan({ phase = 'static' }: { phase?: 'static' | 'fallback' }) {
  return (
    <div className="pd__staticFan" data-motion-phase={phase} aria-hidden="true">
      {STATIC_FAN.map(({ index, x, y, rotate, scale, z }) => {
        const poster = POSTERS[index]
        return (
          <figure
            key={poster.src}
            className="pd__staticCard"
            style={
              {
                '--fan-x': `${x}px`,
                '--fan-y': `${y}px`,
                '--fan-r': `${rotate}deg`,
                '--fan-s': scale,
                '--fan-z': z,
              } as React.CSSProperties
            }
          >
            <img
              {...workImage('posters', poster.src)}
              sizes="(max-width: 680px) 38vw, 230px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </figure>
        )
      })}
    </div>
  )
}

function PosterAccessibilityList() {
  return (
    <ul className="u-sr-only">
      {POSTERS.map((poster) => (
        <li key={poster.src}>{poster.title}</li>
      ))}
    </ul>
  )
}

function InteractivePostersDeck({
  getInitialSnapshot,
  onSnapshot,
}: {
  getInitialSnapshot: () => PosterMotionSnapshot | null
  onSnapshot: (snapshot: PosterMotionSnapshot) => void
}) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PostersThreeApi>(null)
  const xRef = useRef(REST_OFFSET)
  const vRef = useRef(0)
  const drag = useRef<DragState>(idleDrag())
  const suspendedRef = useRef(typeof document !== 'undefined' && document.hidden)
  const stepRef = useRef<FrameFn | null>(null)
  const reduced = useReducedMotion()
  const [canvasFailed, setCanvasFailed] = useState(false)
  const { textures, statuses, gateOpen } = usePosterTextures(!canvasFailed)

  useEffect(() => {
    const snapshot = getInitialSnapshot()
    if (snapshot?.mode === 'idle') xRef.current = snapshot.offset
  }, [getInitialSnapshot])

  const setPhase = useCallback((phase: PosterMotionPhase) => {
    if (fieldRef.current) fieldRef.current.dataset.motionPhase = phase
  }, [])

  const handlePhase = useCallback(
    (phase: PosterMotionPhase) => {
      setPhase(phase)
      const stage = fieldRef.current?.querySelector<HTMLElement>('.pd__persp')
      if (stage) stage.dataset.motionPhase = phase
    },
    [setPhase],
  )

  const stopInertia = useCallback(() => {
    const hadVelocityTilt = vRef.current !== 0
    vRef.current = 0
    if (stepRef.current) stopFrames(stepRef.current)
    // 惯性或拖拽被失焦、取消、二次按下打断时，必须补一帧把书卡的
    // 速度侧倾归零。仅在确实有速度时调用，避免单纯 pointerdown 提前
    // 接管仍在播放的 GSAP intro。
    if (hadVelocityTilt) sceneRef.current?.setOffset(xRef.current, 0)
  }, [])

  useEffect(() => {
    stepRef.current = () => {
      if (suspendedRef.current || Math.abs(vRef.current) <= STOP_V) {
        const needsFlatFrame = vRef.current !== 0
        vRef.current = 0
        if (needsFlatFrame) sceneRef.current?.setOffset(xRef.current, 0)
        return false
      }
      vRef.current *= 0.94
      xRef.current += vRef.current
      sceneRef.current?.setOffset(xRef.current, -vRef.current * 0.42)
      return true
    }
    const step = stepRef.current
    return () => stopFrames(step)
  }, [])

  const wakeInertia = useCallback(() => {
    const step = stepRef.current
    if (!step || suspendedRef.current || Math.abs(vRef.current) <= STOP_V) return
    startFrames(step)
  }, [])

  const clearPointer = useCallback(
    (stopMotion: boolean, releaseCapture: boolean) => {
      const pointerId = drag.current.pointerId
      drag.current = idleDrag()
      fieldRef.current?.removeAttribute('data-dragging')
      if (stopMotion) stopInertia()

      if (releaseCapture && pointerId !== null) {
        const field = fieldRef.current
        try {
          if (field?.hasPointerCapture(pointerId)) field.releasePointerCapture(pointerId)
        } catch {
          // 浏览器已取消这条 pointer stream；状态已在上方幂等清理。
        }
      }
    },
    [stopInertia],
  )

  const takeOverIntro = useCallback(() => {
    xRef.current = sceneRef.current?.takeOver() ?? xRef.current
  }, [])

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const onWheel = (event: WheelEvent) => {
      const absX = Math.abs(event.deltaX)
      const absY = Math.abs(event.deltaY)
      if (absX < 1 || absX < absY) return
      takeOverIntro()
      xRef.current -= event.deltaX * 1.15
      vRef.current = reduced ? 0 : -event.deltaX * 0.42
      sceneRef.current?.setOffset(xRef.current, reduced ? 0 : -vRef.current * 0.42)
      if (!reduced) wakeInertia()
    }
    field.addEventListener('wheel', onWheel, { passive: true })
    return () => field.removeEventListener('wheel', onWheel)
  }, [reduced, takeOverIntro, wakeInertia])

  useEffect(() => {
    const pauseScene = () => {
      suspendedRef.current = true
      sceneRef.current?.pause()
      clearPointer(true, true)
    }
    const resumeScene = () => {
      if (document.hidden) return
      suspendedRef.current = false
      sceneRef.current?.resume()
    }
    const onBlur = () => {
      // 窗口仍可见时只结束当前手势/惯性，让 1.74s 的 GSAP 入场继续完成。
      // 某些嵌入式 WebView 会长期不派发 focus；若这里暂停 timeline，页面会
      // 永久卡在 orbit。真正的后台暂停只由 visibilitychange 负责。
      clearPointer(true, true)
    }
    const onVisibility = () => {
      if (document.hidden) pauseScene()
      else resumeScene()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', resumeScene)
    if (document.hidden) pauseScene()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', resumeScene)
    }
  }, [clearPointer])

  useEffect(() => {
    if (!reduced) return
    clearPointer(true, true)
    xRef.current = REST_OFFSET
    sceneRef.current?.finishStatic(true)
  }, [clearPointer, reduced])

  const onDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    stopInertia()
    drag.current = {
      tracking: true,
      locked: false,
      pointerId: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      base: xRef.current,
      last: event.clientX,
      lastT: performance.now(),
    }
  }

  const onMove = (event: React.PointerEvent) => {
    const current = drag.current
    if (!current.tracking || current.pointerId !== event.pointerId) return
    const now = performance.now()
    const dx = event.clientX - current.sx
    const dy = event.clientY - current.sy

    if (!current.locked) {
      if (Math.hypot(dx, dy) < DRAG_INTENT_PX) return
      if (Math.abs(dx) <= Math.abs(dy)) {
        clearPointer(false, false)
        return
      }
      if (event.pointerType === 'mouse') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          clearPointer(false, false)
          return
        }
      }
      takeOverIntro()
      current.locked = true
      current.base = xRef.current
      current.last = event.clientX
      current.lastT = now
      vRef.current = 0
      fieldRef.current?.setAttribute('data-dragging', 'true')
    }

    event.preventDefault()
    const dt = Math.max(1, now - current.lastT)
    vRef.current = ((event.clientX - current.last) / dt) * 15
    current.last = event.clientX
    current.lastT = now
    xRef.current = current.base + dx
    sceneRef.current?.setOffset(xRef.current, reduced ? 0 : -vRef.current * 0.42)
  }

  const onUp = (event: React.PointerEvent) => {
    if (!drag.current.tracking || drag.current.pointerId !== event.pointerId) return
    const wasLocked = drag.current.locked
    clearPointer(false, false)
    if (wasLocked && !reduced) wakeInertia()
    else if (wasLocked) {
      vRef.current = 0
      sceneRef.current?.setOffset(xRef.current, 0)
    }
  }

  const onCancel = (event: React.PointerEvent) => {
    if (!drag.current.tracking || drag.current.pointerId !== event.pointerId) return
    clearPointer(drag.current.locked, false)
  }

  const onLostCapture = (event: React.PointerEvent) => {
    if (!drag.current.tracking || drag.current.pointerId !== event.pointerId) return
    clearPointer(true, false)
  }

  if (canvasFailed) return <StaticPosterFan phase="fallback" />

  return (
    <div
      ref={fieldRef}
      className="pd__field"
      data-motion-phase={reduced ? 'reduced' : 'waiting'}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onLostCapture}
    >
      <div className="pd__persp">
        <Canvas
          className="pd__canvas"
          aria-hidden="true"
          frameloop="demand"
          shadows
          dpr={[1, 1.5]}
          camera={{ fov: 35, near: 0.1, far: 60, position: [0, 0, 14] }}
          gl={{
            alpha: false,
            antialias: true,
            powerPreference: 'high-performance',
            toneMapping: NoToneMapping,
          }}
          fallback={<StaticPosterFan phase="fallback" />}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault()
                setCanvasFailed(true)
              },
              { once: true },
            )
          }}
        >
          <PostersThreeScene
            ref={sceneRef}
            textures={textures}
            introReady={gateOpen}
            reduced={reduced}
            onPhase={handlePhase}
            getInitialSnapshot={getInitialSnapshot}
            onSnapshot={onSnapshot}
          />
        </Canvas>
      </div>
      <div
        className="u-sr-only"
        aria-hidden="true"
        data-ready-count={statuses.filter((status) => status === 'ready').length}
      />
    </div>
  )
}

/**
 * DESIGN › 01 POSTERS。
 *
 * WebGL 路径使用 R3F 的真实薄书几何体 + GSAP master timeline；无 WebGL、
 * Save-Data、低性能降级或栏目切走时完全不创建第二个 Canvas，改为最终静态扇面。
 */
export default function PostersDeck({ active }: { active: boolean }) {
  const capabilities = useCapabilities()
  const snapshotRef = useRef<PosterMotionSnapshot | null>(null)
  const rememberSnapshot = useCallback((snapshot: PosterMotionSnapshot) => {
    snapshotRef.current = snapshot
  }, [])
  const readSnapshot = useCallback(() => snapshotRef.current, [])
  const staticOnly =
    !active ||
    !capabilities.webgl ||
    capabilities.saveData ||
    capabilities.shouldFallback

  return (
    <div className="pd" data-hscroll>
      <h1 className="pd__head">POSTERS</h1>
      {staticOnly ? (
        <StaticPosterFan />
      ) : (
        <InteractivePostersDeck
          getInitialSnapshot={readSnapshot}
          onSnapshot={rememberSnapshot}
        />
      )}
      <PosterAccessibilityList />
    </div>
  )
}
