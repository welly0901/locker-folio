import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, DoubleSide, type BufferGeometry, type Group } from 'three'
import { introTime } from '../experience/experienceClock'
import { doorAngleAt } from './doorMotion'
import { mergeBoxes, roundedBox, type BoxSpec } from './geometry'
import {
  BACK_T,
  BAY_PITCH,
  bayCenter,
  bayLeft,
  CAP_OVERHANG,
  CAP_T,
  CAVITY_BACK_Z,
  DIVIDER_T,
  DOOR_CY,
  DOOR_FRONT_Z,
  DOOR_H,
  DOOR_T,
  DOOR_W,
  HANDLE_H,
  HANDLE_W,
  HANDLE_X_F,
  HANDLE_Y_F,
  hingeX,
  OPENING_BOTTOM,
  OPENING_H,
  PLINTH_H,
  SHELF_T,
  SHELF_Y,
  SIDE_T,
  VENT_BOTTOM_F,
  VENT_H,
  VENT_SLAT_GAP,
  VENT_SLAT_H,
  VENT_SLATS,
  VENT_TOP_F,
  VENT_W,
} from './lockerSpec'
import { MATTE, METAL, PAINT, PALETTE } from './materials'
import { BACK_Z, BAY_COUNT, FRONT_Z, LOCKER_D, LOCKER_H, LOCKER_W, OPEN_BAY } from './sceneConfig'

/** 卸载时释放合并出来的几何，避免 GPU 内存泄漏 */
function useDisposable<T extends BufferGeometry>(make: () => T): T {
  const geo = useMemo(() => make(), [make])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

/**
 * 柜体模型。
 *
 * 仓库里没有原版 GLB，以参考帧为视觉约束在代码里重建：
 * 柜壳、顶盖、底座、立柱、柜腔、隔板、四扇门、把手、通风槽
 * **全部是有真实厚度的网格**，不是矩形和渐变（第一条禁令）。
 *
 * 节点命名遵循固定结构，动画与热点只按名字找节点：
 *   Locker_Root / Locker_Carcass / Door_0N_Hinge / Door_0N / Shelf_02
 *
 * draw call 预算：柜壳 3 + 柜腔 2 + 隔板 1 + 四扇门 4×4 = 22，
 * 加上落地阴影一共 23，低于 35 的预算上限。
 */
export default function LockerModel({
  doorAngle,
  doorInnerContent,
  doorFaceContent,
  cavityContent,
}: {
  /** 第 2 扇门的开启角，弧度。不传则由主时间线驱动；0 = 完全闭合 */
  doorAngle?: number
  /** 挂在第 2 扇门内侧的内容（工牌、贴纸…） */
  doorInnerContent?: ReactNode
  /** 挂在各扇门**外表面**上的内容，按柜位序号索引（海报、置物架、拍立得…） */
  doorFaceContent?: Partial<Record<number, ReactNode>>
  /** 放在第 2 个柜腔里的内容 */
  cavityContent?: ReactNode
}) {
  return (
    <group name="Locker_Root">
      <Carcass />
      <Cavities />
      <Shelves />
      {/* 关着的三扇门永远不动，合并成一组几何：
          12 个 mesh 压到 4 个，render + shadow 两趟一共省 11 个 draw call */}
      <ClosedDoors faces={doorFaceContent} />
      <DoorAssembly
        index={OPEN_BAY}
        angle={doorAngle}
        driven={doorAngle === undefined}
        inner={doorInnerContent}
        face={doorFaceContent?.[OPEN_BAY] ?? null}
      />
      {cavityContent && <group name="Cavity_02_Content">{cavityContent}</group>}
    </group>
  )
}

/* ── 柜壳 ─────────────────────────────────────────────────── */

function makeShell(): BufferGeometry {
  const specs: BoxSpec[] = [
    // 背板
    { size: [LOCKER_W, LOCKER_H, BACK_T], at: [0, LOCKER_H / 2, BACK_Z + BACK_T / 2] },
    // 左右侧板
    { size: [SIDE_T, LOCKER_H, LOCKER_D], at: [-LOCKER_W / 2 + SIDE_T / 2, LOCKER_H / 2, 0] },
    { size: [SIDE_T, LOCKER_H, LOCKER_D], at: [LOCKER_W / 2 - SIDE_T / 2, LOCKER_H / 2, 0] },
  ]
  // 三根立柱
  for (let i = 0; i < BAY_COUNT - 1; i += 1) {
    specs.push({
      size: [DIVIDER_T, OPENING_H, LOCKER_D - BACK_T],
      at: [
        bayLeft(i) + BAY_PITCH + DIVIDER_T / 2,
        OPENING_BOTTOM + OPENING_H / 2,
        (BACK_Z + BACK_T + FRONT_Z) / 2,
      ],
    })
  }
  return mergeBoxes(specs)
}

function Carcass() {
  const shell = useDisposable(makeShell)
  const cap = useDisposable(() =>
    roundedBox({
      size: [LOCKER_W, CAP_T, LOCKER_D + CAP_OVERHANG],
      at: [0, LOCKER_H - CAP_T / 2, CAP_OVERHANG / 2],
      radius: 0.012,
    }),
  )
  const plinth = useDisposable(() =>
    roundedBox({ size: [LOCKER_W, PLINTH_H, LOCKER_D], at: [0, PLINTH_H / 2, 0], radius: 0.012 }),
  )
  return (
    <group name="Locker_Carcass">
      <mesh name="Carcass_Shell" geometry={shell} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.frame} {...PAINT} />
      </mesh>
      {/* 顶盖与底座不投影：柜壳已经给出落地阴影的轮廓，
          再让顶盖投一次只会在柜腔里切出一条硬边（实测落在 y=2.42，
          正是柜口上沿沿主光方向投下来的边），参考里柜腔是柔和的整体遮蔽 */}
      <mesh name="Carcass_Cap" geometry={cap} receiveShadow>
        <meshStandardMaterial color={PALETTE.cap} {...PAINT} />
      </mesh>
      <mesh name="Carcass_Plinth" geometry={plinth} receiveShadow>
        <meshStandardMaterial color={PALETTE.plinth} {...PAINT} />
      </mesh>
    </group>
  )
}

/**
 * 四个柜腔的内衬。
 *
 * 用反面渲染的盒子：从外面看不见，从开口看进去就是完整的后壁 + 四面内壁，
 * 深度是真的，不是贴一张蓝色平面。
 */
function Cavities() {
  const depth = FRONT_Z - CAVITY_BACK_Z
  const liner = useDisposable(() =>
    mergeBoxes(
      Array.from({ length: BAY_COUNT }, (_, i): BoxSpec => ({
        size: [BAY_PITCH - 0.004, OPENING_H - 0.004, depth],
        at: [bayCenter(i), OPENING_BOTTOM + OPENING_H / 2, CAVITY_BACK_Z + depth / 2],
        radius: 0.006,
      })),
    ),
  )
  const back = useDisposable(() =>
    mergeBoxes(
      Array.from({ length: BAY_COUNT }, (_, i): BoxSpec => ({
        size: [BAY_PITCH - 0.018, OPENING_H - 0.018, 0.012],
        at: [bayCenter(i), OPENING_BOTTOM + OPENING_H / 2, CAVITY_BACK_Z + 0.008],
        radius: 0.004,
      })),
    ),
  )
  return (
    <group name="Locker_Cavities">
      <mesh name="Cavity_Liner" geometry={liner} receiveShadow>
        <meshStandardMaterial color={PALETTE.cavity} side={BackSide} {...MATTE} />
      </mesh>
      {/* 后壁亮一档，避免整腔糊成一块死蓝 */}
      <mesh name="Cavity_Back" geometry={back} receiveShadow>
        <meshStandardMaterial color={PALETTE.cavityBack} {...MATTE} />
      </mesh>
    </group>
  )
}

function Shelves() {
  const geo = useDisposable(() =>
    mergeBoxes(
      SHELF_Y.map(
        (y): BoxSpec => ({
          size: [BAY_PITCH - 0.01, SHELF_T, LOCKER_D - BACK_T - 0.07],
          at: [bayCenter(OPEN_BAY), y - SHELF_T / 2, (CAVITY_BACK_Z + FRONT_Z - 0.07) / 2],
          radius: 0.012,
        }),
      ),
    ),
  )
  // 隔板不投影，理由同顶盖：它在柜腔里投出的硬边会横切书脊和文件盒
  return (
    <mesh name="Shelf_02" geometry={geo} receiveShadow>
      <meshStandardMaterial color={PALETTE.shelf} {...PAINT} />
    </mesh>
  )
}

/* ── 柜门 ─────────────────────────────────────────────────── */

/* 下面四个 spec 生成器都接一个门中心偏移，既能单扇用（开的那扇），
   也能把多扇合并进一条几何（关着的三扇）。 */

/** 门板本体 + 上下两组通风槽凸棱 */
function doorBodySpecs(ox = 0, oy = 0, oz = 0): BoxSpec[] {
  const specs: BoxSpec[] = [
    { size: [DOOR_W, DOOR_H, DOOR_T], at: [ox, oy, oz], radius: 0.016, segments: 3 },
  ]
  const step = VENT_SLAT_H + VENT_SLAT_GAP
  for (const f of [VENT_TOP_F, VENT_BOTTOM_F]) {
    const cy = DOOR_H / 2 - f * DOOR_H
    const top = ((VENT_SLATS - 1) * step) / 2
    for (let i = 0; i < VENT_SLATS; i += 1) {
      specs.push({
        size: [VENT_W, VENT_SLAT_H, 0.028],
        at: [ox, oy + cy + top - i * step, oz + DOOR_T / 2 - 0.002],
        radius: VENT_SLAT_H * 0.34,
      })
    }
  }
  return specs
}

/** 通风槽底衬：槽与槽之间露出来的那条暗色就是它 */
function ventBackingSpecs(ox = 0, oy = 0, oz = 0): BoxSpec[] {
  return [VENT_TOP_F, VENT_BOTTOM_F].map(
    (f): BoxSpec => ({
      size: [VENT_W + 0.004, VENT_H + 0.004, 0.012],
      at: [ox, oy + DOOR_H / 2 - f * DOOR_H, oz + DOOR_T / 2 - 0.001],
      radius: 0.006,
    }),
  )
}

/** 把手底板 */
function handlePlateSpec(ox = 0, oy = 0, oz = 0): BoxSpec {
  return {
    size: [HANDLE_W, HANDLE_H, 0.03],
    at: [ox + HANDLE_CX, oy + HANDLE_CY, oz + DOOR_T / 2 + 0.006],
    radius: 0.012,
  }
}

/** 把手上的蓝色嵌条 */
function handleGripSpec(ox = 0, oy = 0, oz = 0): BoxSpec {
  return {
    size: [HANDLE_W * 0.52, HANDLE_H * 0.68, 0.03],
    at: [ox + HANDLE_CX, oy + HANDLE_CY, oz + DOOR_T / 2 + 0.004],
    radius: 0.009,
  }
}

/** 把手中心相对门中心的偏移 */
const HANDLE_CX = -DOOR_W / 2 + HANDLE_X_F * DOOR_W
const HANDLE_CY = DOOR_H / 2 - HANDLE_Y_F * DOOR_H

/** 一扇关着的门，其门中心在世界坐标里的位置 */
function closedDoorCenter(i: number): [number, number, number] {
  return [hingeX(i) - DOOR_W / 2, DOOR_CY, DOOR_FRONT_Z - DOOR_T / 2]
}

/**
 * 关着的三扇门。
 *
 * 它们在整个开场里一动不动，所以按材质合并成四条几何（门板 / 槽衬 / 把手底板 /
 * 把手嵌条），四个 mesh 顶掉原来的十二个。门上的贴花不受影响 ——
 * 贴花本来就是独立的 InstancedMesh，只要挂在对应门面的位置上就行。
 */
function ClosedDoors({ faces }: { faces?: Partial<Record<number, ReactNode>> }) {
  const idx = useMemo(
    () => Array.from({ length: BAY_COUNT }, (_, i) => i).filter((i) => i !== OPEN_BAY),
    [],
  )
  const body = useDisposable(
    useCallback(() => mergeBoxes(idx.flatMap((i) => doorBodySpecs(...closedDoorCenter(i)))), [idx]),
  )
  const backing = useDisposable(
    useCallback(
      () => mergeBoxes(idx.flatMap((i) => ventBackingSpecs(...closedDoorCenter(i)))),
      [idx],
    ),
  )
  const plate = useDisposable(
    useCallback(() => mergeBoxes(idx.map((i) => handlePlateSpec(...closedDoorCenter(i)))), [idx]),
  )
  const grip = useDisposable(
    useCallback(() => mergeBoxes(idx.map((i) => handleGripSpec(...closedDoorCenter(i)))), [idx]),
  )
  return (
    <group name="Doors_Closed">
      <mesh name="Doors_Closed_Body" geometry={body} castShadow receiveShadow>
        <meshStandardMaterial color={PALETTE.door} {...PAINT} />
      </mesh>
      <mesh name="Doors_Closed_VentBacking" geometry={backing} receiveShadow>
        <meshStandardMaterial color={PALETTE.ventBack} {...MATTE} />
      </mesh>
      <mesh name="Doors_Closed_HandlePlate" geometry={plate} receiveShadow>
        <meshStandardMaterial color={PALETTE.handlePlate} {...METAL} />
      </mesh>
      <mesh name="Doors_Closed_HandleGrip" geometry={grip} receiveShadow>
        <meshStandardMaterial color={PALETTE.handleGrip} {...METAL} />
      </mesh>
      {idx.map((i) =>
        faces?.[i] ? (
          <group
            key={i}
            name={`Door_0${i + 1}_FaceContent`}
            position={[
              closedDoorCenter(i)[0],
              closedDoorCenter(i)[1],
              closedDoorCenter(i)[2] + DOOR_T / 2 + 0.006,
            ]}
          >
            {faces[i]}
          </group>
        ) : null,
      )}
    </group>
  )
}

function DoorAssembly({
  index,
  angle,
  driven,
  inner,
  face,
}: {
  index: number
  angle?: number
  /** true 时每帧从主时间线读门角，直接改 three 对象，不触发 React 渲染 */
  driven?: boolean
  inner?: ReactNode
  face?: ReactNode
}) {
  const body = useDisposable(useCallback(() => mergeBoxes(doorBodySpecs()), []))
  const backing = useDisposable(useCallback(() => mergeBoxes(ventBackingSpecs()), []))
  const hinge = useRef<Group>(null)

  useFrame(() => {
    if (!driven || !hinge.current) return
    hinge.current.rotation.y = doorAngleAt(introTime())
  })

  return (
    <group
      ref={hinge}
      name={`Door_0${index + 1}_Hinge`}
      // 转轴在门右侧、门厚的中面上：门绕自己的右边翻开
      position={[hingeX(index), 0, DOOR_FRONT_Z - DOOR_T / 2]}
      rotation={[0, angle ?? 0, 0]}
    >
      <group name={`Door_0${index + 1}`} position={[-DOOR_W / 2, DOOR_CY, 0]}>
        <mesh name={`Door_0${index + 1}_Body`} geometry={body} castShadow receiveShadow>
          <meshStandardMaterial color={PALETTE.door} {...PAINT} />
        </mesh>
        <mesh name={`Door_0${index + 1}_VentBacking`} geometry={backing} receiveShadow>
          <meshStandardMaterial color={PALETTE.ventBack} {...MATTE} />
        </mesh>
        <Handle />

        {/* 门内侧：参考里翻开的门内侧明显比外侧白 */}
        <mesh
          name={`Door_0${index + 1}_Inner`}
          position={[0, 0, -DOOR_T / 2 - 0.0015]}
          rotation={[0, Math.PI, 0]}
          receiveShadow
        >
          <planeGeometry args={[DOOR_W - 0.024, DOOR_H - 0.024]} />
          <meshStandardMaterial color={PALETTE.doorInner} side={DoubleSide} {...PAINT} />
        </mesh>

        {face && (
          <group name={`Door_0${index + 1}_FaceContent`} position={[0, 0, DOOR_T / 2 + 0.006]}>
            {face}
          </group>
        )}

        {/* 内侧内容整体绕 Y 转 180°，法线朝外。贴花的百分比就写在这个
            镜像坐标系里，见 decalSpecs.ts */}
        {inner && (
          <group
            name={`Door_0${index + 1}_InnerContent`}
            position={[0, 0, -DOOR_T / 2 - 0.006]}
            rotation={[0, Math.PI, 0]}
          >
            {inner}
          </group>
        )}
      </group>
    </group>
  )
}

/** 把手：底板 + 蓝色嵌条，真实几何而不是渐变矩形。只有会翻开的那扇单独建 */
function Handle() {
  const plate = useDisposable(useCallback(() => roundedBox(handlePlateSpec()), []))
  const grip = useDisposable(useCallback(() => roundedBox(handleGripSpec()), []))
  return (
    <group name="Door_Handle">
      <mesh geometry={plate} receiveShadow>
        <meshStandardMaterial color={PALETTE.handlePlate} {...METAL} />
      </mesh>
      <mesh geometry={grip} receiveShadow>
        <meshStandardMaterial color={PALETTE.handleGrip} {...METAL} />
      </mesh>
    </group>
  )
}
