import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/** 桌面端 DPR 上限：再高只是烧 GPU，1320×724 下肉眼无差别 */
export const MAX_DPR = 1.75
/** 掉帧后允许降到的最低 DPR */
export const MIN_DPR = 0.75

/**
 * 性能总管。
 *
 * 职责：
 * 1. 动画期间连续渲染，静止后回到 demand rendering —— 由 `animating` 决定，
 *    这个值来自场景状态机的能力表，不由组件自己猜。
 * 2. 帧时间持续偏高时下调渲染分辨率，恢复后再慢慢调回去。
 * 3. 页面不可见时停渲染。
 */
export default function PerformanceGovernor({ animating }: { animating: boolean }) {
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  /* 连续渲染 / 按需渲染切换 */
  useEffect(() => {
    setFrameloop(animating ? 'always' : 'demand')
    // 切回 demand 时补最后一帧，避免停在半帧状态
    if (!animating) invalidate()
  }, [animating, setFrameloop, invalidate])

  /* 页面隐藏时彻底停渲染 */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setFrameloop('never')
      else {
        setFrameloop(animating ? 'always' : 'demand')
        invalidate()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [animating, setFrameloop, invalidate])

  /* 自适应分辨率：只在连续渲染期间统计，静止时不采样 */
  const state = useRef({ acc: 0, n: 0, dpr: 0 })
  useEffect(() => {
    if (!animating) return
    const base = Math.min(MAX_DPR, window.devicePixelRatio || 1)
    if (state.current.dpr === 0) state.current.dpr = base
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const s = state.current
      s.acc += dt
      s.n += 1
      if (s.n >= 40) {
        const avg = s.acc / s.n
        s.acc = 0
        s.n = 0
        // P95 门槛 18ms：均值超过 20ms 就降，回到 13ms 以下再升
        if (avg > 20 && s.dpr > MIN_DPR) {
          s.dpr = Math.max(MIN_DPR, s.dpr - 0.25)
          setDpr(s.dpr)
        } else if (avg < 13 && s.dpr < base) {
          s.dpr = Math.min(base, s.dpr + 0.25)
          setDpr(s.dpr)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animating, setDpr])

  /* 开发期把 draw call 与三角面打出来，随时对照 draw call 预算 */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const id = window.setTimeout(() => {
      const r = gl.info.render
      const m = gl.info.memory
      console.info(
        `[hero] draw calls ${r.calls}（预算 35） · 三角面 ${r.triangles}（预算 150k） · ` +
          `几何 ${m.geometries} · 纹理 ${m.textures}`,
      )
      let meshes = 0
      scene.traverse((o) => {
        if ((o as { isMesh?: boolean }).isMesh) meshes += 1
      })
      console.info(`[hero] 场景 mesh ${meshes} 个（draw call 还要算上一趟阴影 pass）`)
    }, 1500)
    return () => window.clearTimeout(id)
  }, [gl, scene])

  /* WebGL 上下文丢失：不要留一块空白画布 */
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = (e: Event) => {
      e.preventDefault()
      console.warn('[hero] WebGL context lost，等待自动恢复')
    }
    const onRestored = () => {
      console.info('[hero] WebGL context restored')
      invalidate()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [gl, invalidate])

  return null
}
