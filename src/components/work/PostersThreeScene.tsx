import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import {
  MathUtils,
  type Group,
  type Material,
  type Mesh,
  type Texture,
} from 'three'
import { POSTERS } from '../../data/content'

const SPAN = 468
const LOOP = POSTERS.length * SPAN
const TAU = Math.PI * 2
const REST_OFFSET = -SPAN
const STACK_FRONT_INDEX = 3

/**
 * 相邻书卡之间留出的视觉间隙（书卡宽的 30%）。
 * 环半径不再写死成 card × 1.6 —— 那个系数是按 11 张（角间距 32.7°）标定的，
 * 海报增多到 17 张（角间距 21.2°）后邻卡会互相穿插、一屏挤进太多张。
 * 改为按「相邻卡中心弦距 = 正面卡宽 × (1 + 间隙)」反解半径，
 * 于是无论海报多少张，卡间净距始终一致；景深沿用旧的 depth/radius = 0.45 比例。
 */
const RING_GAP = 0.3
const ANGLE_STEP = TAU / POSTERS.length
/** 正面书卡的世界宽 = 几何宽 2 × 组缩放 card×0.5 × 正面 pose.scale(0.76+0.28=1.04) */
const FRONT_CARD_WORLD_W = 2 * 0.5 * 1.04
const RADIUS_MULT =
  (FRONT_CARD_WORLD_W * (1 + RING_GAP)) / (2 * Math.sin(ANGLE_STEP / 2))
const DEPTH_MULT = RADIUS_MULT * 0.45

const INTRO_ORBIT_S = 0.95
const INTRO_GATHER_S = 0.18
const INTRO_HOLD_S = 0.2
const INTRO_FADE_S = 0.13
const INTRO_UNFOLD_S = 0.28
const INTRO_GATHER_AT = INTRO_ORBIT_S
const INTRO_HOLD_AT = INTRO_GATHER_AT + INTRO_GATHER_S
const INTRO_FADE_AT = INTRO_HOLD_AT + INTRO_HOLD_S
const INTRO_UNFOLD_AT = INTRO_FADE_AT + INTRO_FADE_S
const EASE_POWER3_OUT = gsap.parseEase('power3.out')

const TILT = [-6, 3.5, -2.5, 5, -4, 2, -5.5, 4.5, -3, 6, -2]
const STACK_X = [0, -7, 6, -13, 12, -17, 18, -10, 9, -4, 4]
const STACK_Y = [28, 32, 24, 35, 19, 29, 38, 22, 34, 26, 31]
const STACK_ROLL = [8, -5, 6, -9, 10, -12, 7, -6, 11, -8, 4]

/**
 * 书卡基准宽度。几何本体高 3，正面 pose.scale 为 0.76+0.28=1.04，
 * 于是正面世界高 = 3 * card * 0.5 * 1.04 = 1.56 * card。
 * 3:4 画幅下视口是 6.6213 x 8.8284：min(8.8284*0.37, 6.6213*0.55) = 3.267，
 * 正面卡高 5.096，占画幅高 57.7%，落在 55-60% 的目标区间内。
 * 主项挂在**高度**上是有意的：视口高只由 fov 与相机距离决定、与宽高比无关，
 * 因此任何比例下正面卡都稳定在 ~57%；w*0.55 只在细高手机（390px）上兜底，
 * 防止卡宽越过左右边缘。2.2 / 3.4 的上下限收住极端视口。
 */
const cardWidthFor = (viewWidth: number, viewHeight: number) =>
  MathUtils.clamp(Math.min(viewHeight * 0.37, viewWidth * 0.55), 2.2, 3.4)

const clamp01 = (value: number) => MathUtils.clamp(value, 0, 1)
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount
const wrap = (value: number) => ((value % LOOP) + LOOP) % LOOP

type Pose = {
  x: number
  y: number
  z: number
  yaw: number
  roll: number
  scale: number
  opacity: number
}

type MotionState = {
  orbit: number
  gather: number
  hold: number
  fade: number
  unfold: number
}

export type PosterMotionPhase =
  | 'waiting'
  | 'orbit'
  | 'gather'
  | 'stack'
  | 'fade'
  | 'unfold'
  | 'idle'
  | 'reduced'

export type PostersThreeApi = {
  /** 由 DOM 手势把 Three 场景移动到同一条环形轨道上。 */
  setOffset: (offset: number, velocityTilt?: number) => void
  /** 中断入场并返回入场此刻所处的环形 offset，交给拖拽无缝接管。 */
  takeOver: () => number
  pause: () => void
  resume: () => void
  finishStatic: (reduced?: boolean) => void
}

export type PosterMotionSnapshot = {
  mode: 'waiting' | 'intro' | 'idle'
  timelineTime: number
  offset: number
}

type PostersThreeSceneProps = {
  textures: Array<Texture | null>
  introReady: boolean
  reduced: boolean
  onPhase: (phase: PosterMotionPhase) => void
  getInitialSnapshot: () => PosterMotionSnapshot | null
  onSnapshot: (snapshot: PosterMotionSnapshot) => void
}

function orbitPose(
  index: number,
  offset: number,
  viewWidth: number,
  viewHeight: number,
  boost = 0,
  velocityTilt = 0,
): Pose {
  const angle = (wrap(index * SPAN + offset) / LOOP) * TAU
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)
  const front = (cos + 1) / 2
  // 环半径由顶部 RADIUS_MULT 按「相邻卡净距 = 30% 卡宽」反解，跟随海报数量变化：
  // 17 张时系数 ≈ 3.68（旧写死值 1.6 是 11 张时的解），邻卡不再插进正面卡里。
  const card = cardWidthFor(viewWidth, viewHeight)
  const radius = card * RADIUS_MULT * (1 + boost * 0.2)
  const depth = card * DEPTH_MULT * (1 + boost * 0.14)

  return {
    x: sin * radius,
    // Three 的 Y 轴向上；高速段的近景封面从画面下缘掠过。
    // 下沉幅度受放大后的卡尺寸约束：boost 段正面半高 3.06，视口半高 4.414，
    // 下沉超过 1.36 就切边，故取 min(h*0.13=1.148, 1.15)，1.148+3.06=4.21 仍在框内。
    y: -boost * front * Math.min(viewHeight * 0.13, 1.15) - (1 - front) * 0.1,
    z: -(1 - front) * depth,
    // 角间距随海报数量变化（17 张 = 21.2°），可见邻卡的 sin ≈ 0.36：24 系数下它
    // 偏转约 8.7°，够读出立体，又平到像一副摊开的牌（原来的 68 会转到近 25°，像转盘不像牌）。
    yaw: -sin * 24 + velocityTilt * 0.45,
    roll: TILT[index % TILT.length] + sin * 7 + velocityTilt,
    scale: (0.76 + front * 0.28) * (1 + boost * front * 0.2),
    // 书卡本身始终不透明；远近关系交给透视、光照与深度缓冲，不用 CSS 式
    // 半透明伪造。只有入场首帧、stack fade 和 unfold 会改 opacity。
    opacity: 1,
  }
}

function stackPose(index: number): Pose {
  const order = (index - STACK_FRONT_INDEX + POSTERS.length) % POSTERS.length
  return {
    // 散开量是世界单位、不吃 cardWidth 缩放，所以卡宽从 1.62 涨到 3.267（约 2 倍）后
    // 系数同比翻倍，书堆才不会缩成一摞对齐的卡；基线 -0.5 同理保持书堆在画幅下半部。
    x: STACK_X[order] * 0.036,
    y: -0.5 + STACK_Y[order] * 0.014,
    // 相机位于 +Z；蝴蝶封面是最靠近相机的一张，纸边才会真实遮挡。
    z: 1.05 - order * 0.045,
    yaw: -4 + order * 0.32,
    roll: STACK_ROLL[order],
    scale: 0.49,
    opacity: 1,
  }
}

function mixPose(from: Pose, to: Pose, amount: number): Pose {
  return {
    x: mix(from.x, to.x, amount),
    y: mix(from.y, to.y, amount),
    z: mix(from.z, to.z, amount),
    yaw: mix(from.yaw, to.yaw, amount),
    roll: mix(from.roll, to.roll, amount),
    scale: mix(from.scale, to.scale, amount),
    opacity: mix(from.opacity, to.opacity, amount),
  }
}

/**
 * 真正的 Three 场景：每张作品是一个有厚度、背面和纸边的 BoxGeometry。
 * GSAP 只驱动一条 master timeline；每个 tick 直接改 Object3D，再手动
 * invalidate demand Canvas，静止以后 GSAP 与 R3F 都不会继续出帧。
 */
const PostersThreeScene = forwardRef<PostersThreeApi, PostersThreeSceneProps>(
  function PostersThreeScene(
    { textures, introReady, reduced, onPhase, getInitialSnapshot, onSnapshot },
    forwardedRef,
  ) {
    const groups = useRef<Array<Group | null>>([])
    const meshes = useRef<Array<Mesh | null>>([])
    const timelineRef = useRef<gsap.core.Timeline | null>(null)
    const motionRef = useRef<MotionState>({ orbit: 0, gather: 0, hold: 0, fade: 0, unfold: 0 })
    const modeRef = useRef<'waiting' | 'intro' | 'idle'>('waiting')
    const startedRef = useRef(false)
    const pausedRef = useRef(false)
    const reducedRef = useRef(reduced)
    const offsetRef = useRef(REST_OFFSET)
    const orbitOffsetRef = useRef(REST_OFFSET)
    const velocityTiltRef = useRef(0)
    const lastPhaseRef = useRef<PosterMotionPhase | null>(null)
    const initialSnapshotRef = useRef<PosterMotionSnapshot | null>(null)
    const initialSnapshotReadRef = useRef(false)
    const { invalidate, viewport } = useThree()
    const viewportRef = useRef({ width: viewport.width, height: viewport.height })

    const announcePhase = useCallback(
      (phase: PosterMotionPhase) => {
        if (lastPhaseRef.current === phase) return
        lastPhaseRef.current = phase
        onPhase(phase)
      },
      [onPhase],
    )

    const setMeshOpacity = useCallback((mesh: Mesh | null, opacity: number) => {
      if (!mesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials as Material[]) {
        material.opacity = opacity
        material.visible = opacity > 0.002
        // 完全不透明时启用深度写入，书卡按真实 Z 关系互相遮挡；淡出段关闭，
        // 避免前层透明卡仍把后层卡写进深度缓冲而切出硬洞。
        material.depthWrite = opacity >= 0.999
      }
      mesh.visible = opacity > 0.002
    }, [])

    const applyPose = useCallback(() => {
      const { width, height } = viewportRef.current
      const timeline = timelineRef.current
      const time = modeRef.current === 'intro' && timeline ? timeline.time() : Infinity
      const motion = motionRef.current
      const cardWidth = cardWidthFor(width, height)
      let phase: PosterMotionPhase = reducedRef.current ? 'reduced' : 'idle'

      for (let index = 0; index < POSTERS.length; index++) {
        let pose: Pose
        if (modeRef.current === 'waiting') {
          phase = 'waiting'
          // 这里**不能**把 opacity 归零：setMeshOpacity 会连带 mesh.visible = false，
          // 而画布是 alpha:false 压在 #f8f7fa 上，等纹理的这最多 1.2s 就是一张纯白空帧。
          // 未到货的封面本来就落在 material-4 的 '#ede9e2' 占位色上，等待态因此是
          // 一副摊开的米色卡阵，封面到齐一张补一张。
          pose = orbitPose(index, REST_OFFSET, width, height)
        } else if (modeRef.current !== 'intro') {
          pose = orbitPose(index, offsetRef.current, width, height, 0, velocityTiltRef.current)
        } else if (time < INTRO_GATHER_AT) {
          phase = 'orbit'
          const spun = motion.orbit
          const raw = clamp01(time / INTRO_ORBIT_S)
          const offset = REST_OFFSET - LOOP * 1.42 * (1 - spun)
          orbitOffsetRef.current = offset
          const boost = 1 - EASE_POWER3_OUT(clamp01((raw - 0.66) / 0.34))
          pose = orbitPose(index, offset, width, height, boost)
          pose.opacity *= EASE_POWER3_OUT(clamp01(raw / 0.085))
        } else if (time < INTRO_HOLD_AT) {
          phase = 'gather'
          orbitOffsetRef.current = REST_OFFSET
          pose = mixPose(
            orbitPose(index, REST_OFFSET, width, height),
            stackPose(index),
            motion.gather,
          )
        } else if (time < INTRO_FADE_AT) {
          phase = 'stack'
          orbitOffsetRef.current = REST_OFFSET
          pose = stackPose(index)
        } else if (time < INTRO_UNFOLD_AT) {
          phase = 'fade'
          orbitOffsetRef.current = REST_OFFSET
          pose = stackPose(index)
          pose.scale *= mix(1, 0.96, motion.fade)
          pose.opacity = 1 - motion.fade
        } else {
          phase = 'unfold'
          orbitOffsetRef.current = REST_OFFSET
          const finalPose = orbitPose(index, REST_OFFSET, width, height)
          const angle = (wrap(index * SPAN + REST_OFFSET) / LOOP) * TAU
          const front = (Math.cos(angle) + 1) / 2
          const lag = (1 - front) * 0.22
          const local = EASE_POWER3_OUT(
            clamp01((motion.unfold - lag) / Math.max(0.001, 1 - lag)),
          )
          const startPose: Pose = {
            x: Math.sign(finalPose.x || index - 1) * (0.12 + Math.abs(finalPose.x) * 0.08),
            y: -0.44 - (1 - front) * 0.28,
            z: -2.7 + finalPose.z * 0.08,
            yaw: finalPose.yaw * 0.24,
            roll: finalPose.roll * 0.22,
            scale: 0.58,
            opacity: 0,
          }
          pose = mixPose(startPose, finalPose, local)
          pose.opacity = finalPose.opacity * local
        }

        const group = groups.current[index]
        const mesh = meshes.current[index]
        if (!group || !mesh) continue
        group.position.set(pose.x, pose.y, pose.z)
        group.rotation.set(0, MathUtils.degToRad(pose.yaw), MathUtils.degToRad(pose.roll), 'YXZ')
        const scale = cardWidth * 0.5 * pose.scale
        group.scale.setScalar(scale)
        setMeshOpacity(mesh, clamp01(pose.opacity))
      }

      announcePhase(phase)
      const preserved = modeRef.current === 'waiting' ? initialSnapshotRef.current : null
      onSnapshot(
        preserved ?? {
          mode: modeRef.current,
          timelineTime: modeRef.current === 'intro' ? (timelineRef.current?.time() ?? 0) : 0,
          offset: modeRef.current === 'intro' ? orbitOffsetRef.current : offsetRef.current,
        },
      )
      invalidate()
    }, [announcePhase, invalidate, onSnapshot, setMeshOpacity])

    const killTimeline = useCallback(() => {
      timelineRef.current?.kill()
      timelineRef.current = null
    }, [])

    const finishStatic = useCallback(
      (asReduced = false) => {
        killTimeline()
        startedRef.current = true
        modeRef.current = 'idle'
        reducedRef.current = asReduced
        offsetRef.current = REST_OFFSET
        orbitOffsetRef.current = REST_OFFSET
        velocityTiltRef.current = 0
        applyPose()
      },
      [applyPose, killTimeline],
    )

    const startIntro = useCallback((resumeAt = 0) => {
      if (startedRef.current || reducedRef.current) return
      startedRef.current = true
      modeRef.current = 'intro'
      const shouldPause = pausedRef.current || document.hidden
      pausedRef.current = shouldPause
      const motion = motionRef.current
      Object.assign(motion, { orbit: 0, gather: 0, hold: 0, fade: 0, unfold: 0 })
      killTimeline()

      const timeline = gsap.timeline({
        paused: true,
        // 这里**不能**给 overwrite: true。五段 tween 打的是同一个 motion 对象，
        // 而 GSAP 的 overwrite: true 是在 Tween 构造函数里就 killTweensOf(target)，
        // 于是每 .to() 一段就把前面几段全杀掉，最后只剩 unfold 一段活着
        // （实测 timeline.getChildren().length === 1）。表现正是「书堆一闪而过」：
        // orbit/gather/fade 的值恒为 0，前 1.46s 是三次瞬移，只有最后 0.28s 在动。
        // 重建前的清理由上面的 killTimeline() 负责，不需要 overwrite 兜底。
        onUpdate: applyPose,
        onComplete: () => {
          modeRef.current = 'idle'
          offsetRef.current = REST_OFFSET
          orbitOffsetRef.current = REST_OFFSET
          velocityTiltRef.current = 0
          applyPose()
        },
      })
      timeline
        .addLabel('orbit', 0)
        .to(motion, { orbit: 1, duration: INTRO_ORBIT_S, ease: 'power3.out' }, 'orbit')
        .addLabel('gather', INTRO_GATHER_AT)
        .to(
          motion,
          { gather: 1, duration: INTRO_GATHER_S, ease: 'power2.inOut' },
          'gather',
        )
        .addLabel('hold', INTRO_HOLD_AT)
        .to(motion, { hold: 1, duration: INTRO_HOLD_S, ease: 'none' }, 'hold')
        .addLabel('fade', INTRO_FADE_AT)
        .to(motion, { fade: 1, duration: INTRO_FADE_S, ease: 'power2.out' }, 'fade')
        .addLabel('unfold', INTRO_UNFOLD_AT)
        .to(motion, { unfold: 1, duration: INTRO_UNFOLD_S, ease: 'power3.out' }, 'unfold')

      timelineRef.current = timeline
      // seek 会让 GSAP 一次性恢复各段 tween 的属性值，再从该时刻继续；
      // 因而切去 CHARACTER POSTER 卸载 Canvas 后，返回不会把整段动画重新播放。
      timeline.pause(MathUtils.clamp(resumeAt, 0, INTRO_UNFOLD_AT + INTRO_UNFOLD_S))
      applyPose()
      if (!shouldPause) timeline.resume()
    }, [applyPose, killTimeline])

    useImperativeHandle(
      forwardedRef,
      () => ({
        setOffset(offset, velocityTilt = 0) {
          if (modeRef.current !== 'idle') {
            killTimeline()
            modeRef.current = 'idle'
          }
          offsetRef.current = offset
          orbitOffsetRef.current = offset
          velocityTiltRef.current = MathUtils.clamp(velocityTilt, -9, 9)
          applyPose()
        },
        takeOver() {
          const offset =
            modeRef.current === 'intro' ? orbitOffsetRef.current : offsetRef.current
          killTimeline()
          modeRef.current = 'idle'
          offsetRef.current = offset
          orbitOffsetRef.current = offset
          velocityTiltRef.current = 0
          applyPose()
          return offset
        },
        pause() {
          pausedRef.current = true
          timelineRef.current?.pause()
        },
        resume() {
          if (!pausedRef.current) return
          pausedRef.current = false
          if (modeRef.current === 'intro') timelineRef.current?.resume()
          else applyPose()
        },
        finishStatic,
      }),
      [applyPose, finishStatic, killTimeline],
    )

    // 纹理渐进到达时只要求 demand Canvas 补一帧；不重建 geometry，
    // 也不重启正在运行的 GSAP master timeline。
    useEffect(() => {
      applyPose()
    }, [applyPose, textures])

    useLayoutEffect(() => {
      if (!initialSnapshotReadRef.current) {
        initialSnapshotRef.current = getInitialSnapshot()
        initialSnapshotReadRef.current = true
      }
      if (reduced) {
        finishStatic(true)
        return
      }
      const wasReduced = reducedRef.current
      reducedRef.current = false
      if (wasReduced && startedRef.current && modeRef.current === 'idle') applyPose()
      if (!startedRef.current) {
        announcePhase(introReady ? 'orbit' : 'waiting')
        applyPose()
      }
      if (!introReady || startedRef.current) return
      const snapshot = initialSnapshotRef.current
      if (snapshot?.mode === 'idle') {
        startedRef.current = true
        modeRef.current = 'idle'
        offsetRef.current = snapshot.offset
        orbitOffsetRef.current = snapshot.offset
        applyPose()
      } else {
        startIntro(snapshot?.mode === 'intro' ? snapshot.timelineTime : 0)
      }
    }, [announcePhase, applyPose, finishStatic, getInitialSnapshot, introReady, reduced, startIntro])

    useLayoutEffect(() => {
      viewportRef.current = { width: viewport.width, height: viewport.height }
      applyPose()
    }, [applyPose, viewport.height, viewport.width])

    useEffect(
      () => () => {
        killTimeline()
      },
      [killTimeline],
    )

    return (
      <>
        <color attach="background" args={['#f8f7fa']} />
        <ambientLight intensity={1.75} color="#fffaf2" />
        <hemisphereLight args={['#ffffff', '#d7dde8', 1.05]} />
        <directionalLight
          castShadow
          color="#fff7eb"
          intensity={2.25}
          position={[5.5, 7.5, 8]}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={9}
          shadow-camera-bottom={-9}
          shadow-bias={-0.00025}
        />

        {POSTERS.map((poster, index) => (
          <group
            key={poster.src}
            ref={(node) => {
              groups.current[index] = node
            }}
          >
            <mesh
              ref={(node) => {
                meshes.current[index] = node
              }}
              castShadow
              receiveShadow
            >
              {/* 几何本体 2:3，Z 向 0.07 是可见书脊/纸边，不再是平面图片。 */}
              <boxGeometry args={[2, 3, 0.07]} />
              <meshStandardMaterial attach="material-0" color="#e7e2da" roughness={0.8} transparent />
              <meshStandardMaterial attach="material-1" color="#f4f0e9" roughness={0.8} transparent />
              <meshStandardMaterial attach="material-2" color="#fffdf8" roughness={0.76} transparent />
              <meshStandardMaterial attach="material-3" color="#ded8cf" roughness={0.82} transparent />
              <meshBasicMaterial
                // map 从 null 渐进到真实纹理会改变 Three shader define；用纹理
                // uuid 重建正面材质，避免慢网/Reduced Motion 下卡片一直停在
                // 无 USE_MAP 的灰白占位着色器。
                key={textures[index]?.uuid ?? `poster-placeholder-${index}`}
                attach="material-4"
                color={textures[index] ? '#ffffff' : '#ede9e2'}
                map={textures[index]}
                toneMapped={false}
                transparent
              />
              <meshStandardMaterial attach="material-5" color="#ece7df" roughness={0.8} transparent />
            </mesh>
          </group>
        ))}
      </>
    )
  },
)

export default PostersThreeScene
