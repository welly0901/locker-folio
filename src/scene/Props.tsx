import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Vector3, type Group } from 'three'
import { introTime } from '../experience/experienceClock'
import { useSceneCapabilities } from '../store'
import { ID_CARD_AT, ID_CARD_SIZE } from './decalSpecs'
import {
  activateHotspot,
  registerHotspotAnchor,
  setHotspotActive,
} from './hotspotActions'
import type { HotspotId } from './hotspotSpecs'
import {
  BACK_T,
  BAY_PITCH,
  CAVITY_BACK_Z,
  DOOR_H,
  DOOR_W,
  OPENING_BOTTOM,
  OPENING_TOP,
  SHELF_Y,
  bayLeft,
} from './lockerSpec'
import {
  BackpackModel,
  BooksModel,
  DoorTrayModel,
  FindAWordBoardModel,
  GuitarModel,
  IdCardModel,
  POLAROID_CROPS,
  PolaroidCardModel,
  PosterCardModel,
  SelectedWorkModel,
  TurntableModel,
  TypewriterModel,
} from './PhysicalProps'
import {
  CAVITY_PROPS,
  FIND_A_WORD_DEPTH,
  FIND_A_WORD_FACE_Z,
  FIND_A_WORD_SIZE,
  FRONT_PROPS,
  easeBy,
  type PropSpec,
} from './propSpecs'
import { FRONT_Z, OPEN_BAY } from './sceneConfig'
import SurfaceDraggable, {
  type SurfaceDragBounds,
  type SurfacePlane,
} from './SurfaceDraggable'

type V3 = readonly [number, number, number]

const _anchor = new Vector3()
const BAY_MIN_X = bayLeft(OPEN_BAY) + 0.025
const BAY_MAX_X = bayLeft(OPEN_BAY) + BAY_PITCH - 0.025
const SHELF_MIN_Z = CAVITY_BACK_Z + BACK_T * 0.25
const SHELF_MAX_Z = FRONT_Z - 0.03
const FIND_A_WORD_ROOT_Z = CAVITY_BACK_Z + FIND_A_WORD_DEPTH / 2 + 0.001
const FIND_A_WORD_FRONT_Z = FIND_A_WORD_ROOT_Z + FIND_A_WORD_FACE_Z
/** 唱片机掀盖在 hover 放大时仍不能穿入柜腔后壁或墙贴。 */
const TURNTABLE_WALL_CLEARANCE = 0.02
/**
 * 整扇门面。磁吸在门上的物件可以贴到门的任何地方 —— 通风槽、把手上方都算，
 * 真实柜门上贴纸本来就没有「只能贴中段」这回事。不越界由每件自己的
 * footprint 保证（SurfaceDraggable 会把边界再内缩半个占地）。
 */
const DOOR_FACE_BOUNDS: SurfaceDragBounds = {
  u: [-DOOR_W / 2, DOOR_W / 2],
  v: [-DOOR_H / 2, DOOR_H / 2],
}

function findSpec(name: string): PropSpec {
  const found = [...CAVITY_PROPS, ...FRONT_PROPS].find((item) => item.name === name)
  if (!found) throw new Error(`缺少物件时间线：${name}`)
  return found
}

const FIND_A_WORD = findSpec('Prop_FindAWord')
const BOOKS = findSpec('Prop_Books')
const TURNTABLE = findSpec('Prop_Turntable')
const BACKPACK = findSpec('Prop_Backpack')
const SELECTED_WORK = findSpec('Prop_SelectedWork')
const TYPEWRITER = findSpec('Prop_Typewriter')
const GUITAR = findSpec('Prop_Guitar')

const POSTER: PropSpec = {
  name: 'Prop_Door01_Poster',
  url: '/assets/obj/posterwall.webp',
  at: [0, 0, 0],
  width: 0.53,
  from: { dz: -0.045, scale: 0.94 },
  at_ms: 1040,
  dur: 300,
  ease: 'outSine',
}

const TRAY_A: PropSpec = {
  name: 'Prop_Door01_TrayA',
  url: '',
  at: [0, 0, 0],
  width: 0.48,
  from: { dz: -0.08, scale: 0.9 },
  at_ms: 1360,
  dur: 300,
  ease: 'outCubic',
}

const TRAY_B: PropSpec = {
  ...TRAY_A,
  name: 'Prop_Door01_TrayB',
  from: { dy: -0.08, scale: 0.9 },
  at_ms: 1480,
}

/**
 * ABOUT 工牌。原来是贴花图集里的一张平面，现在是有厚度的实体（IdCardModel）。
 *
 * 入场窗口整段藏在门后：门 t≈1076ms 才转过 90°，在那之前门内侧背对镜头，
 * 工牌根本看不见。所以从 860（第一批物件的时间窗起点）起、220ms 落位，
 * 正好在门转正的那一刻收工，和它当贴花时「门一转过来就在那儿」看起来一样。
 * 起点抬高 0.05：它是**挂**上去的，最后那一下是落到钩子上。
 */
const ID_CARD: PropSpec = {
  name: 'Prop_Door02_IdCard',
  url: '/assets/obj/idcard2.webp',
  at: ID_CARD_AT,
  width: ID_CARD_SIZE[0],
  from: { dy: 0.05, scale: 0.94 },
  at_ms: 860,
  dur: 220,
  ease: 'outSine',
}

const DOOR4_PHOTO_FRIENDS: PropSpec = {
  name: 'Prop_Door04_PhotoFriends',
  url: '/assets/obj2/polaroids.webp',
  at: [0, 0, 0],
  width: 0.36,
  from: { dz: -0.05, scale: 0.9 },
  at_ms: 1320,
  dur: 320,
  ease: 'outSine',
}

const DOOR4_PHOTO_BEACH: PropSpec = {
  ...DOOR4_PHOTO_FRIENDS,
  name: 'Prop_Door04_PhotoBeach',
  width: 0.33,
  at_ms: 1380,
}

const DOOR4_PHOTO_CAMERA: PropSpec = {
  ...DOOR4_PHOTO_FRIENDS,
  name: 'Prop_Door04_PhotoCamera',
  width: 0.34,
  at_ms: 1440,
}

/**
 * 入场只写物件内部的 Reveal 层；外面的 SurfaceDraggable 独占最终位置。
 * 因此开场时间线继续保留，但动画结束后不会在每一帧把用户拖好的位置写回去。
 */
function IntroPhysical({ spec, children }: { spec: PropSpec; children: ReactNode }) {
  const root = useRef<Group>(null)

  useFrame(() => {
    const group = root.current
    if (!group) return
    const u = (introTime() - spec.at_ms) / spec.dur
    if (u <= 0) {
      group.visible = false
      return
    }
    group.visible = true
    const e = u >= 1 ? 1 : easeBy(spec.ease, u)
    const back = 1 - e
    group.position.set(
      (spec.from.dx ?? 0) * back,
      (spec.from.dy ?? 0) * back,
      (spec.from.dz ?? 0) * back,
    )
    group.rotation.set(0, (spec.from.yaw ?? 0) * back, 0)
    const scale = 1 - (1 - (spec.from.scale ?? 1)) * back
    group.scale.setScalar(scale)
  })

  return (
    <group ref={root} name={`${spec.name}_Intro`} visible={false}>
      {children}
    </group>
  )
}

function PhysicalItem({
  spec,
  plane,
  position,
  bounds,
  footprint,
  footprintCenter,
  enabled,
  rotation = [0, 0, 0],
  scale = 1,
  hotspot,
  hotspotOffset = [0, 0, 0],
  hoverLift,
  hoverScale,
  children,
}: {
  spec: PropSpec
  plane: SurfacePlane
  position: V3
  bounds: SurfaceDragBounds
  footprint: readonly [number, number]
  footprintCenter?: readonly [number, number]
  enabled: boolean
  rotation?: V3
  scale?: number
  hotspot?: HotspotId
  hotspotOffset?: V3
  hoverLift?: number
  hoverScale?: number
  children: ReactNode
}) {
  const dragRoot = useRef<Group>(null)
  const [anchorX, anchorY, anchorZ] = hotspotOffset

  useEffect(() => {
    if (!hotspot) return
    return registerHotspotAnchor(hotspot, () => {
      const root = dragRoot.current
      if (!root) return [position[0], position[1], position[2]]
      root.localToWorld(_anchor.set(anchorX, anchorY, anchorZ))
      return [_anchor.x, _anchor.y, _anchor.z]
    })
  }, [anchorX, anchorY, anchorZ, hotspot, position])

  return (
    <SurfaceDraggable
      ref={dragRoot}
      name={spec.name}
      plane={plane}
      position={position}
      bounds={bounds}
      footprint={footprint}
      footprintCenter={footprintCenter}
      enabled={enabled}
      hoverLift={hoverLift}
      hoverScale={hoverScale}
      onTap={hotspot ? () => activateHotspot(hotspot) : undefined}
      onHoverChange={hotspot ? (on) => setHotspotActive(hotspot, on) : undefined}
    >
      <IntroPhysical spec={spec}>
        <group rotation={[rotation[0], rotation[1], rotation[2]]} scale={scale}>
          {children}
        </group>
      </IntroPhysical>
    </SurfaceDraggable>
  )
}

/**
 * 第 2 个柜腔里的实体物件。
 *
 * 纸张只有表面纹理；书、唱片机、文件盒与背包全部是真实网格。每一件都绑定到
 * 自己的物理承载面：后壁 XY、隔板 XZ 或柜底 XZ，拖动后不会悬空或穿出柜腔。
 */
export function CavityProps() {
  const caps = useSceneCapabilities()
  const enabled = caps.drag

  return (
    <>
      <PhysicalItem
        spec={FIND_A_WORD}
        plane="xy"
        // 背板后表面只离柜腔后壁 1mm；它可以沿墙移动，但不能向前浮起。
        position={[-0.49, 1.735, FIND_A_WORD_ROOT_Z]}
        bounds={{ u: [BAY_MIN_X, BAY_MAX_X], v: [OPENING_BOTTOM + 0.04, OPENING_TOP - 0.02] }}
        footprint={FIND_A_WORD_SIZE}
        footprintCenter={[0, FIND_A_WORD_SIZE[1] / 2]}
        enabled={enabled}
        hoverLift={0}
        hoverScale={1.01}
      >
        <FindAWordBoardModel />
      </PhysicalItem>

      <PhysicalItem
        spec={BOOKS}
        plane="xz"
        position={[-0.51, SHELF_Y[0], -0.085]}
        bounds={{ u: [BAY_MIN_X, BAY_MAX_X], v: [SHELF_MIN_Z, SHELF_MAX_Z] }}
        footprint={[0.74, 0.19]}
        enabled={enabled}
        hotspot="projects"
        // 圆环与聚焦锚点落在书顶前沿；点击与拖拽仍由书堆实体接管。
        hotspotOffset={[0.02, 0.24, 0.1]}
      >
        <BooksModel />
      </PhysicalItem>

      <PhysicalItem
        spec={TURNTABLE}
        plane="xz"
        position={[-0.51, SHELF_Y[1], 0.025]}
        // 后边界按墙贴最前沿计算。扣除 0.4 深度 footprint 后，唱片机根
        // 最小 z 仍在墙贴前面，掀盖顶边不会再穿到日历后方。
        bounds={{
          u: [BAY_MIN_X, BAY_MAX_X],
          v: [FIND_A_WORD_FRONT_Z + TURNTABLE_WALL_CLEARANCE, SHELF_MAX_Z],
        }}
        footprint={[0.7, 0.4]}
        enabled={enabled}
        hotspot="skills"
        // 反馈圆环和聚焦锚点留在模型后部；真正的点击与拖拽都由实体接管。
        hotspotOffset={[0, 0.31, -0.22]}
      >
        <TurntableModel />
      </PhysicalItem>

      <PhysicalItem
        spec={SELECTED_WORK}
        plane="xy"
        // 作品袋在参考里悬在背包前面，而不是贴在后壁被背包盖住。
        // 放在隔板前沿附近，仍保留 XY 平面拖拽。
        position={[-0.47, 0.62, FRONT_Z - 0.055]}
        bounds={{ u: [BAY_MIN_X, BAY_MAX_X], v: [OPENING_BOTTOM + 0.08, SHELF_Y[1] - 0.02] }}
        footprint={[0.62, 0.5]}
        footprintCenter={[0, 0.25]}
        enabled={enabled}
        hotspot="work"
        hotspotOffset={[0, 0.26, -0.08]}
      >
        <SelectedWorkModel />
      </PhysicalItem>

      <PhysicalItem
        spec={BACKPACK}
        plane="xz"
        position={[-0.55, OPENING_BOTTOM, 0.075]}
        bounds={{ u: [BAY_MIN_X, BAY_MAX_X], v: [SHELF_MIN_Z, SHELF_MAX_Z] }}
        footprint={[0.56, 0.22]}
        enabled={enabled}
      >
        <BackpackModel />
      </PhysicalItem>
    </>
  )
}

/**
 * 打开的第二扇门内侧：打字机背部磁吸在门板上，工牌挂在门贴挂钩上，
 * 两件都继承铰链矩阵。
 */
export function DoorTwoMountedProps() {
  const caps = useSceneCapabilities()
  return (
    <>
      <PhysicalItem
        spec={TYPEWRITER}
        plane="xy"
        position={[0.015, -0.95, 0.018]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.72, 0.62]}
        enabled={caps.drag}
        hotspot="contact"
        hotspotOffset={[0, -0.04, -0.012]}
      >
        <TypewriterModel />
      </PhysicalItem>

      {/* 工牌要等自己那张贴图解码完才能裁出印刷面与吊环，单独用 Suspense 兜住，
          纹理慢的时候不会连打字机一起从门上消失 */}
      <Suspense fallback={null}>
        <PhysicalItem
          spec={ID_CARD}
          plane="xy"
          position={ID_CARD_AT}
          bounds={DOOR_FACE_BOUNDS}
          footprint={ID_CARD_SIZE}
          enabled={caps.drag}
          hotspot="about"
          // 反馈圆环留在牌子后面（内容组 z = 0.0075 − 0.0095 = −0.002，
          // 门面与卡背之间），不跟卡体抢指针；点击与拖拽都由实体接管
          hotspotOffset={[0, 0, -0.0095]}
          // 牌子是**穿在**挂钩上的：一抬起来钩尖就跑到吊环后面去了，
          // 穿孔立刻穿帮。反馈只留缩放，和贴柜腔后壁的寻字板同一处理
          hoverLift={0}
          hoverScale={1.03}
        >
          <IdCardModel />
        </PhysicalItem>
      </Suspense>
    </>
  )
}

/**
 * 第一扇门的海报与两个磁吸托盘：托盘、侧挡和承载物全部有真实深度。
 * 与第四扇门同理，三件都以整扇门面为活动范围（见 DOOR_FACE_BOUNDS）。
 */
export function DoorOneMountedProps() {
  const caps = useSceneCapabilities()
  return (
    <>
      <PhysicalItem
        spec={POSTER}
        plane="xy"
        position={[0.035, 0.79, 0.016]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.6, 0.84]}
        enabled={caps.drag}
        hotspot="awards"
        rotation={[0, 0, -0.035]}
        scale={1}
      >
        <PosterCardModel />
      </PhysicalItem>
      <PhysicalItem
        spec={TRAY_A}
        plane="xy"
        position={[0.075, 0.13, 0.018]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.48, 0.31]}
        enabled={caps.drag}
      >
        <DoorTrayModel content="paper" />
      </PhysicalItem>
      <PhysicalItem
        spec={TRAY_B}
        plane="xy"
        position={[0.075, -0.62, 0.018]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.48, 0.27]}
        enabled={caps.drag}
      >
        <DoorTrayModel content="stationery" />
      </PhysicalItem>
    </>
  )
}

/**
 * 第四扇门的三张人物拍立得。
 *
 * 每张卡都是一个独立 SurfaceDraggable：独立背板、磁吸层、阴影和原图 UV。
 * 三张卡共用**整扇门面**作为活动范围：磁吸卡贴在哪儿是用户的事，
 * 早先按初始版式给的窄边界（顶卡卡在上通风槽下方、下卡只能在把手右侧
 * 那一小块里挪）实际可动距离只有零点几个卡宽，看起来像是拖不动。
 * 越界由各自的 footprint 兜住，卡片永远不会有一角悬在门外。
 */
export function DoorFourMountedProps() {
  const caps = useSceneCapabilities()
  return (
    <>
      <PhysicalItem
        spec={DOOR4_PHOTO_FRIENDS}
        plane="xy"
        position={[0.1, 0.56, 0.01]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.37, 0.323]}
        enabled={caps.drag}
        rotation={[0, 0, -0.03]}
      >
        <PolaroidCardModel
          name="Polaroid_Friends"
          crop={POLAROID_CROPS.friends}
          size={[0.36, 0.31]}
        />
      </PhysicalItem>

      <PhysicalItem
        spec={DOOR4_PHOTO_BEACH}
        plane="xy"
        position={[0.005, 0.19, 0.026]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.368, 0.394]}
        enabled={caps.drag}
        rotation={[0, 0, 0.105]}
      >
        <PolaroidCardModel
          name="Polaroid_Beach"
          crop={POLAROID_CROPS.beach}
          size={[0.33, 0.36]}
        />
      </PhysicalItem>

      <PhysicalItem
        spec={DOOR4_PHOTO_CAMERA}
        plane="xy"
        position={[0.245, 0.2, 0.046]}
        bounds={DOOR_FACE_BOUNDS}
        footprint={[0.374, 0.4]}
        enabled={caps.drag}
        rotation={[0, 0, -0.09]}
      >
        <PolaroidCardModel
          name="Polaroid_Camera"
          crop={POLAROID_CROPS.camera}
          size={[0.34, 0.37]}
        />
      </PhysicalItem>
    </>
  )
}

/** 柜外只保留真正落地并靠柜的吉他；打字机已经移到第二扇门的子节点。 */
export function FrontProps() {
  const caps = useSceneCapabilities()
  return (
    <PhysicalItem
      spec={GUITAR}
      plane="xz"
      position={[1.77, 0, 0.36]}
      bounds={{ u: [1.28, 2.22], v: [0.27, 0.64] }}
      footprint={[0.55, 0.12]}
      enabled={caps.drag}
      rotation={[0, -0.16, 0.16]}
      scale={0.83}
    >
      <GuitarModel />
    </PhysicalItem>
  )
}
