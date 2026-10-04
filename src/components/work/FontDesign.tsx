import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import * as THREE from 'three'
import { FONT_DESIGN } from '../../data/content'
import { workImage } from './imageSources'

/* ── 原图尺寸（与生成的资源对应） ─────────────────────── */
const DIMS: [number, number][] = [
  [1024, 711], // f1 凤凰字形
  [718, 1020], // f2 文脉源字形系统
  [1024, 720], // f3 凤凰延展
  [715, 1017], // f4 文脉源海报
]

/** detail stack 各图横向错落（vw），对应参考仓库 INNER_X_OFFSETS */
const X_OFFSETS = [0, -10, 7, -4]

type Mode = 'carousel' | 'detail'

type Bounds = { x: number; y: number; w: number; h: number }

type Plane = {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  bounds: Bounds
  opacity: number
  tiltY: number
  tiltX: number
  carEl: HTMLDivElement
  detEl: HTMLDivElement
  tracked: HTMLDivElement | null
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uOpacity;
  varying vec2 vUv;

  float sdRounded(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
  }

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRounded(p, uSize * 0.5, uRadius);
    float a = tex.a * (1.0 - smoothstep(-1.0, 1.0, d)) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(tex.rgb, a);
  }
`

const tween = (obj: gsap.TweenTarget, vars: gsap.TweenVars) =>
  new Promise<void>((resolve) => {
    gsap.to(obj, { ...vars, onComplete: () => resolve() })
  })

const rectOf = (el: Element): Bounds => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

interface EngineOpts {
  canvas: HTMLCanvasElement
  root: HTMLDivElement
  stack: HTMLDivElement
  carEls: HTMLDivElement[]
  detEls: HTMLDivElement[]
  onMode: (m: Mode) => void
}

class FontEngine {
  private canvas: HTMLCanvasElement
  private root: HTMLDivElement
  private stack: HTMLDivElement
  private carEls: HTMLDivElement[]
  private detEls: HTMLDivElement[]
  private onMode: (m: Mode) => void

  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera!: THREE.OrthographicCamera
  private fallback!: THREE.Texture
  private planes: Plane[] = []
  private textures: THREE.Texture[] = []

  private vw = window.innerWidth
  private vh = window.innerHeight
  private raf = 0
  private active = false
  private mode: Mode = 'carousel'
  private busy = false
  private revealed = false

  private gap = 48
  private step = 0
  private period = 0
  private half = 0
  private count: number
  private center = 0

  private carScroll = 0
  private carTarget = 0
  private carVel = 0
  private tiltYTarget = 0

  private detScroll = 0
  private detTarget = 0
  private detVel = 0
  private detMax = 0
  private tiltXTarget = 0
  private focus = 0

  private pointer = {
    down: false,
    moved: false,
    x: 0,
    y: 0,
    t: 0,
  }

  constructor(opts: EngineOpts) {
    this.canvas = opts.canvas
    this.root = opts.root
    this.stack = opts.stack
    this.carEls = opts.carEls
    this.detEls = opts.detEls
    this.onMode = opts.onMode
    this.count = opts.carEls.length
  }

  async init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.vw, this.vh)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.OrthographicCamera(
      -this.vw / 2,
      this.vw / 2,
      this.vh / 2,
      -this.vh / 2,
      -100,
      100,
    )

    // 1×1 不透明白底，纹理未到时先占位
    this.fallback = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    )
    this.fallback.colorSpace = THREE.SRGBColorSpace
    this.fallback.needsUpdate = true

    const geo = new THREE.PlaneGeometry(1, 1)
    for (let i = 0; i < this.count; i++) {
      const material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        uniforms: {
          uMap: { value: this.fallback },
          uSize: { value: new THREE.Vector2(1, 1) },
          uRadius: { value: 8 },
          uOpacity: { value: 0 },
        },
      })
      const mesh = new THREE.Mesh(geo, material)
      mesh.visible = false
      this.scene.add(mesh)
      const carEl = this.carEls[i]
      const detEl = this.detEls[i]
      this.planes.push({
        mesh,
        material,
        bounds: { x: 0, y: 0, w: 1, h: 1 },
        opacity: 0,
        tiltY: 0,
        tiltX: 0,
        carEl,
        detEl,
        tracked: carEl,
      })

      const url = workImage('font', FONT_DESIGN[i].src).src
      new THREE.TextureLoader().load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        material.uniforms.uMap.value = tex
        this.textures.push(tex)
      })
    }

    this.layoutCarousel()
    this.layoutDetail()
    this.applyCarSlots()

    window.addEventListener('resize', this.onResize)
    this.root.addEventListener('wheel', this.onWheel, { passive: false })
    this.root.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)

    this.loop()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    this.root.removeEventListener('wheel', this.onWheel)
    this.root.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    gsap.killTweensOf(this.planes.map((p) => p.bounds))
    gsap.killTweensOf(this.planes)
    for (const p of this.planes) {
      p.material.dispose()
      p.mesh.geometry.dispose()
    }
    for (const t of this.textures) t.dispose()
    this.fallback.dispose()
    this.renderer.dispose()
  }

  setActive(v: boolean) {
    this.active = v
    if (v && !this.revealed) {
      this.revealed = true
      for (let i = 0; i < this.count; i++) {
        const p = this.planes[i]
        gsap.to(p, {
          opacity: 1,
          duration: 0.6,
          delay: i * 0.09,
          ease: 'power2.out',
        })
      }
    }
  }

  /* ── 布局测量 ───────────────────────────────────────── */

  private layoutCarousel() {
    const firstFig = this.carEls[0]
    const cellW = firstFig.offsetWidth || 240
    this.step = cellW + this.gap
    this.period = this.count * this.step
    this.half = this.period / 2
    this.center = Math.floor(this.count / 2)
  }

  private layoutDetail() {
    this.detMax = Math.max(0, this.stack.scrollHeight - this.vh)
    this.detTarget = Math.min(this.detTarget, this.detMax)
    this.detScroll = Math.min(this.detScroll, this.detMax)
  }

  /** 环形 wrap：把 slot i 放到 [-half, half) */
  private applyCarSlots() {
    for (let i = 0; i < this.count; i++) {
      let x = (i - this.center) * this.step - this.carScroll
      x -= Math.floor((x + this.half) / this.period) * this.period
      const figH = this.carEls[i].offsetHeight || 200
      this.carEls[i].style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + (-figH / 2).toFixed(2) + 'px,0)'
    }
  }

  /* ── 输入 ───────────────────────────────────────────── */

  private onResize = () => {
    this.vw = window.innerWidth
    this.vh = window.innerHeight
    this.renderer.setSize(this.vw, this.vh)
    this.camera.left = -this.vw / 2
    this.camera.right = this.vw / 2
    this.camera.top = this.vh / 2
    this.camera.bottom = -this.vh / 2
    this.camera.updateProjectionMatrix()
    this.layoutCarousel()
    this.layoutDetail()
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.active || this.busy) return
    const absX = Math.abs(e.deltaX)
    const absY = Math.abs(e.deltaY)

    if (this.mode === 'carousel') {
      // 横向占优：轮播消费；小幅纵向手势也用于浏览，强纵向（≥26）交给 DesignView 切段
      if (absX > absY) {
        e.preventDefault()
        e.stopPropagation()
        this.carTarget += e.deltaX
      } else if (absY < 26) {
        e.preventDefault()
        e.stopPropagation()
        this.carTarget += e.deltaY
      }
    } else {
      // detail：纵向滚 stack；到顶继续用力上滚 → 关闭
      if (absY >= absX) {
        if (this.detScroll <= 0.5 && e.deltaY < -50) {
          e.preventDefault()
          e.stopPropagation()
          void this.close()
          return
        }
        e.preventDefault()
        e.stopPropagation()
        this.detTarget += e.deltaY
      }
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.active || this.busy) return
    this.pointer.down = true
    this.pointer.moved = false
    this.pointer.x = e.clientX
    this.pointer.y = e.clientY
    this.pointer.t = performance.now()
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointer.down) return
    const dx = e.clientX - this.pointer.x
    const dy = e.clientY - this.pointer.y
    if (Math.abs(dx) + Math.abs(dy) > 7) this.pointer.moved = true
    this.pointer.x = e.clientX
    this.pointer.y = e.clientY
    if (!this.active || this.busy) return
    if (this.mode === 'carousel') this.carTarget -= dx
    else this.detTarget += dy
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointer.down) return
    this.pointer.down = false
    const quick = performance.now() - this.pointer.t < 500
    if (
      !this.pointer.moved &&
      quick &&
      this.active &&
      !this.busy &&
      this.mode === 'carousel'
    ) {
      const hit = this.hitTest(e.clientX, e.clientY)
      if (hit >= 0) void this.open(hit)
    }
  }

  private hitTest(px: number, py: number): number {
    let found = -1
    let best = Infinity
    for (let i = 0; i < this.planes.length; i++) {
      const b = this.planes[i].bounds
      if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue
      const d = Math.abs(px - (b.x + b.w / 2)) + Math.abs(py - (b.y + b.h / 2))
      if (d < best) {
        best = d
        found = i
      }
    }
    return found
  }

  /* ── 转场（参考 mainToInner） ───────────────────────── */

  async open(k: number) {
    if (this.busy || this.mode !== 'carousel') return
    this.busy = true

    // 让被点中的图定位到 stack 顶部视位
    this.focus = k
    const top = this.vh * 0.13
    const rawTop = this.detEls[k].getBoundingClientRect().top
    this.detScroll = this.detTarget = THREE.MathUtils.clamp(
      rawTop - top,
      0,
      this.detMax,
    )
    this.stack.style.transform =
      'translate3d(0,' + -this.detScroll.toFixed(2) + 'px,0)'
    this.detVel = 0

    const detRects = this.detEls.map(rectOf)

    for (const p of this.planes) p.tracked = null

    // 被点中的 morph 到首格；其余淡出
    const morph = tween(this.planes[k].bounds, {
      x: detRects[k].x,
      y: detRects[k].y,
      w: detRects[k].w,
      h: detRects[k].h,
      duration: 0.9,
      ease: 'power3.inOut',
    })
    const fades = this.planes
      .filter((_, i) => i !== k)
      .map((p) => tween(p, { opacity: 0, duration: 0.45, ease: 'power2.in' }))
    await Promise.all([morph, ...fades])

    // 其余各图落到自己的错落格位，向上轻移 + 错峰淡入
    const enter: Promise<void>[] = []
    let j = 0
    for (let i = 0; i < this.count; i++) {
      if (i === k) continue
      const p = this.planes[i]
      const r = detRects[i]
      p.bounds.x = r.x
      p.bounds.y = r.y + 26
      p.bounds.w = r.w
      p.bounds.h = r.h
      p.opacity = 0
      const delay = 0.18 + j * 0.09
      enter.push(
        tween(p.bounds, { y: r.y, duration: 0.7, delay, ease: 'power3.out' }),
      )
      enter.push(
        tween(p, {
          opacity: 1,
          duration: 0.55,
          delay,
          ease: 'power2.out',
        }),
      )
      j++
    }
    await Promise.all(enter)

    for (const p of this.planes) p.tracked = p.detEl
    this.mode = 'detail'
    this.onMode('detail')
    this.busy = false
  }

  async close() {
    if (this.busy || this.mode !== 'detail') return
    this.busy = true

    // 轮播 recenter，让打开时的焦点图回到屏幕偏左的自然视位
    const focus = this.focus
    const desired = this.vw * 0.42
    this.carScroll = this.carTarget =
      (focus - this.center) * this.step - (desired - this.vw / 2)
    this.applyCarSlots()
    this.carVel = 0

    const carRects = this.carEls.map(rectOf)
    for (const p of this.planes) p.tracked = null

    const morph = tween(this.planes[focus].bounds, {
      x: carRects[focus].x,
      y: carRects[focus].y,
      w: carRects[focus].w,
      h: carRects[focus].h,
      duration: 0.9,
      ease: 'power3.inOut',
    })
    const fades = this.planes
      .filter((_, i) => i !== focus)
      .map((p) => tween(p, { opacity: 0, duration: 0.45, ease: 'power2.in' }))
    await Promise.all([morph, ...fades])

    const enter: Promise<void>[] = []
    let j = 0
    for (let i = 0; i < this.count; i++) {
      if (i === focus) continue
      const p = this.planes[i]
      const r = carRects[i]
      p.bounds.x = r.x
      p.bounds.y = r.y + 26
      p.bounds.w = r.w
      p.bounds.h = r.h
      p.opacity = 0
      const delay = 0.12 + j * 0.08
      enter.push(
        tween(p.bounds, { y: r.y, duration: 0.7, delay, ease: 'power3.out' }),
      )
      enter.push(
        tween(p, { opacity: 1, duration: 0.55, delay, ease: 'power2.out' }),
      )
      j++
    }
    await Promise.all(enter)

    for (const p of this.planes) p.tracked = p.carEl
    this.mode = 'carousel'
    this.onMode('carousel')
    this.busy = false
  }

  /* ── 渲染循环 ───────────────────────────────────────── */

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)

    if (this.mode === 'carousel') {
      const prev = this.carScroll
      const diff = this.carTarget - this.carScroll
      this.carScroll += Math.abs(diff) < 0.02 ? diff : diff * 0.1
      this.applyCarSlots()
      this.carVel = this.carScroll - prev
      this.tiltYTarget = THREE.MathUtils.clamp(this.carVel * 0.005, -0.05, 0.05)
      this.tiltXTarget = 0
    } else {
      this.detTarget = THREE.MathUtils.clamp(this.detTarget, 0, this.detMax)
      const prev = this.detScroll
      const diff = this.detTarget - this.detScroll
      this.detScroll += Math.abs(diff) < 0.02 ? diff : diff * 0.1
      this.stack.style.transform =
        'translate3d(0,' + (-this.detScroll).toFixed(2) + 'px,0)'
      this.detVel = this.detScroll - prev
      this.tiltXTarget = THREE.MathUtils.clamp(this.detVel * 0.003, -0.05, 0.05)
      this.tiltYTarget = 0
    }

    for (const p of this.planes) {
      if (p.tracked) {
        const r = rectOf(p.tracked)
        p.bounds.x = r.x
        p.bounds.y = r.y
        p.bounds.w = r.w
        p.bounds.h = r.h
      }
      p.tiltY += (this.tiltYTarget - p.tiltY) * 0.09
      p.tiltX += (this.tiltXTarget - p.tiltX) * 0.09

      const b = p.bounds
      p.mesh.visible = p.opacity > 0.002 && b.w > 0
      p.mesh.position.set(b.x + b.w / 2 - this.vw / 2, this.vh / 2 - (b.y + b.h / 2), 0)
      p.mesh.scale.set(b.w, b.h, 1)
      p.mesh.rotation.y = p.tiltY
      p.mesh.rotation.x = p.tiltX
      const u = p.material.uniforms
      u.uSize.value.set(b.w, b.h)
      u.uOpacity.value = p.opacity
    }

    this.renderer.render(this.scene, this.camera)
  }
}

/** DESIGN › 06 FONT DESIGN —— 无限轮播 + morph 到错落 stack（视觉语言参考 bnpne page-transitions）
 *
 *  通过 portal 挂到 body：.dv__rail 的 will-change:transform 会把内部 fixed
 *  元素的包含块变成被位移的 rail，坐标整体偏移，无法直接放在 section 里。
 */
export default function FontDesign({
  active,
  onNext,
}: {
  active: boolean
  onNext: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const carRefs = useRef<(HTMLDivElement | null)[]>([])
  const detRefs = useRef<(HTMLDivElement | null)[]>([])
  const engineRef = useRef<FontEngine | null>(null)
  const [mode, setMode] = useState<Mode>('carousel')
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  /* portal 容器 */
  useLayoutEffect(() => {
    const el = document.createElement('div')
    el.className = 'fd__portal'
    document.body.appendChild(el)
    setHost(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [])

  /* 引擎在 portal 内容提交后创建 */
  useLayoutEffect(() => {
    if (!host) return
    const engine = new FontEngine({
      canvas: canvasRef.current!,
      root: rootRef.current!,
      stack: stackRef.current!,
      carEls: carRefs.current.filter(Boolean) as HTMLDivElement[],
      detEls: detRefs.current.filter(Boolean) as HTMLDivElement[],
      onMode: setMode,
    })
    engineRef.current = engine
    void engine.init()
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [host])

  useEffect(() => {
    engineRef.current?.setActive(active)
    if (host) host.dataset.active = active ? 'true' : 'false'
  }, [active, host])

  if (!host) return null

  return createPortal(
    <div className="fd" ref={rootRef} data-mode={mode} data-active={active} data-hscroll>
      <canvas ref={canvasRef} className="fd__canvas" />

      {/* 仅供测量的隐藏布局层：plane 每帧追踪这些元素的位置 */}
      <div className="fd__lay" aria-hidden="true">
        <div className="fd__car">
          {FONT_DESIGN.map((it, i) => (
            <div className="fd__cslot" key={it.src}>
              <div
                className="fd__fig"
                ref={(el) => {
                  carRefs.current[i] = el
                }}
                style={{ aspectRatio: DIMS[i][0] + ' / ' + DIMS[i][1] }}
              />
            </div>
          ))}
        </div>

        <div className="fd__det">
          <div className="fd__stack" ref={stackRef}>
            {FONT_DESIGN.map((it, i) => (
              <div
                className="fd__dslot"
                key={it.src}
                style={{ '--fd-x': X_OFFSETS[i] + 'vw' } as CSSProperties}
              >
                <div
                  className="fd__fig"
                  ref={(el) => {
                    detRefs.current[i] = el
                  }}
                  style={{ aspectRatio: DIMS[i][0] + ' / ' + DIMS[i][1] }}
                />
                <div className="fd__cap">
                  <i>{'0' + (i + 1)}</i>
                  <strong>{it.title}</strong>
                  <em>{it.cn}</em>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span className="wv__ghost fd__ghost">FONT DESIGN</span>

      {/* 段落索引（全屏层盖住了 DesignView 的全局 .dv__index，在此补绘） */}
      <span className="fd__index">06 /</span>

      {/* 栏目头部：kicker + 中英文标题，仅轮播模式展示；detail 浏览时隐藏 */}
      {mode === 'carousel' && (
        <div className="fd__head">
          <span className="fd__kicker">07 / FONT DESIGN</span>
          <h1 className="fd__title">
            FONT DESIGN
            <em>字体设计</em>
          </h1>
        </div>
      )}

      {mode === 'carousel' ? (
        <button type="button" className="wv__jump fd__next" onClick={onNext}>
          VIEW PACKAGING DESIGN
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M6 1v9M2.4 6.6 6 10.2l3.6-3.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="fd__back"
          onClick={() => void engineRef.current?.close()}
        >
          ← BACK TO CAROUSEL
        </button>
      )}
    </div>,
    host,
  )
}
