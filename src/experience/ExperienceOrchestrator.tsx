import { useEffect } from 'react'
import { onReducedMotionChange, prefersReducedMotion } from '../hooks/useReducedMotion'
import { useStore } from '../store'
import {
  advanceIntro,
  initIntroClock,
  introTime,
  isIntroFrozen,
  seekIntro,
  setIntroPlaying,
} from './experienceClock'
import { isIntroRunning } from './experienceMachine'
import { INTRO_END, INTRO_EVENTS, introTimeScale } from './experienceTimeline'

/**
 * 体验编排器。
 *
 * 不渲染任何东西，只做四件事：
 *   1. 把用户的 Reduced Motion 偏好同步给状态机；
 *   2. Reduced Motion 下直接投 SKIP_INTRO 并把时钟拨到终点，
 *      跳过全部长动画和空等待；
 *   3. 用**一个** rAF 时钟推进主时间线并按时刻投递完成事件，
 *      不使用任何散落的 setTimeout / CSS animation-delay；
 *   4. 页面不可见时暂停时钟，重新可见后从暂停处继续，不跳帧也不重播。
 *
 * Loader / Reveal 自己在播完时调 `setPhase`，store 的兼容层会把它翻译成
 * ASSETS_READY / REVEAL_DONE，所以这里不需要接管它们的挂载。
 */
export default function ExperienceOrchestrator() {
  /* Reduced Motion 偏好 → 状态机 */
  useEffect(() => {
    const sync = () => useStore.getState().setReducedMotion(prefersReducedMotion())
    sync()
    return onReducedMotionChange(sync)
  }, [])

  /* 开场自动序列的时钟 */
  useEffect(() => {
    initIntroClock()
    const scale = introTimeScale()
    let raf = 0
    let last = 0
    let cursor = 0
    let running = false
    /** 开场是否已经起跑。起跑之后就一路播到 INTRO_END，不因浮层打断而冻住 */
    let started = false
    /**
     * 用户在开场途中给出输入后的快进倍率，1 = 正常速度。
     *
     * 为什么是「快进时钟」而不是「让状态机跳到 idle」：柜门角度、物件落位、
     * 相机全都读 introTime()，状态机只决定「能不能点」。若只把状态机推到 idle，
     * caps.animating 会立刻变 false、frameloop 掉回 demand，柜门就永远停在半开。
     * 拨快同一个时钟则三者同步收尾，状态机沿事件表自己走到 idle，不需要额外事件。
     */
    let skipRate = 1

    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      running = false
      setIntroPlaying(false)
    }

    /** 把已经越过的时刻一次性补发出去（例如 Reduced Motion 直接拨到终点） */
    const flush = () => {
      const st = useStore.getState()
      while (cursor < INTRO_EVENTS.length && introTime() >= INTRO_EVENTS[cursor].at) {
        st.send(INTRO_EVENTS[cursor].event)
        cursor += 1
      }
    }

    const tick = (now: number) => {
      if (introTime() >= INTRO_END) {
        stop()
        return
      }
      // 卡帧时不要一次跳过整段；?slow=N 在这里除一次，
      // 相机/柜门/物件/状态推进都读同一个时钟，所以整条开场是**同步**拉长的。
      // （之前只缩放了事件时刻，视觉照常速播，等于把时间线拆成了两套）
      advanceIntro((Math.min(now - last, 64) * skipRate) / scale)
      last = now
      flush()
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (running || isIntroFrozen()) return
      running = true
      setIntroPlaying(true)
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }

    const sync = (state = useStore.getState()) => {
      if (state.scene.reduced) {
        stop()
        seekIntro(INTRO_END)
        flush()
        if (isIntroRunning(state.scene.state)) state.send({ type: 'SKIP_INTRO' })
        return
      }
      if (isIntroRunning(state.scene.state)) started = true
      // 关键：判据是「开场时间线跑完没有」，不是「状态机还在不在开场态」。
      // 用户在开场途中点顶部导航时，状态机会离开开场态进 overlayOpening；
      // 如果时钟跟着停，柜门就永远卡在半开、物件停在半空 ——
      // 正是要避免的。现在时间线照常在浮层底下播完，
      // 越过的完成事件会被状态机按当前状态自行忽略。
      if (started && introTime() < INTRO_END) start()
      else stop()
    }

    const unsub = useStore.subscribe(sync)

    /*
     * 开场途中收到用户输入：把剩下的时间线压缩到 SKIP_MS 内播完。
     *
     * 在此之前，开场四个状态的 CAPABILITIES 里 hotspots / drag 都是 false，
     * 而且没有任何出口 —— 用户从柜体出现到 4.63s 之间的每一次点击都被静默
     * 吞掉，既没有反馈也没法让它快一点。这就是那几秒「点不动」。
     *
     * 不直接 seek 到终点是为了不让柜门从半开硬跳到全开：压成一段极短的快进，
     * 读起来是「我点了一下，它赶紧收尾」，而不是掉帧。
     */
    const SKIP_MS = 380
    const hurry = () => {
      if (skipRate !== 1 || isIntroFrozen()) return
      if (!started || introTime() >= INTRO_END) return
      skipRate = Math.max(1, (INTRO_END - introTime()) / SKIP_MS)
      start()
    }
    window.addEventListener('pointerdown', hurry)
    window.addEventListener('keydown', hurry)
    window.addEventListener('wheel', hurry, { passive: true })

    // 页面隐藏时暂停时钟：回来后从暂停处继续，不会一口气跳完整个开场
    const onVisibility = () => {
      if (document.hidden) stop()
      else sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    sync()

    return () => {
      stop()
      unsub()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointerdown', hurry)
      window.removeEventListener('keydown', hurry)
      window.removeEventListener('wheel', hurry)
    }
  }, [])

  return null
}
