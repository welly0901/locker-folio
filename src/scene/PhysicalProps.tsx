import { RoundedBox, useTexture } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  ExtrudeGeometry,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three'
import { ID_CARD_SIZE } from './decalSpecs'
import {
  FIND_A_WORD_DEPTH,
  FIND_A_WORD_FACE_Z,
  FIND_A_WORD_SIZE,
} from './propSpecs'

type V3 = [number, number, number]

const SHADOWS = { castShadow: true, receiveShadow: true } as const
const Y_AXIS = new Vector3(0, 1, 0)

const PROP_COLORS = {
  cream: '#f6efdd',
  paper: '#f8f3e8',
  ink: '#463a30',
  softBlue: '#a3a994',
  blue: '#8a9e88',
  blueEdge: '#768a74',
  lilac: '#c6aca2',
  pink: '#e0b0a8',
  peach: '#e0a172',
  yellow: '#d18a55',
  orange: '#cf8a4a',
  orangeDark: '#a66b35',
  mint: '#b6c8a8',
  aqua: '#b4c4ba',
  metal: '#ada79c',
  darkMetal: '#6b655c',
  record: '#2b2825',
  wood: '#a87742',
} as const

type RoundedPartProps = {
  size: V3
  at: V3
  color: string
  rotation?: V3
  radius?: number
  roughness?: number
  metalness?: number
  name?: string
}

function RoundedPart({
  size,
  at,
  color,
  rotation,
  radius = 0.018,
  roughness = 0.7,
  metalness = 0,
  name,
}: RoundedPartProps) {
  return (
    <RoundedBox
      {...SHADOWS}
      name={name}
      args={size}
      position={at}
      rotation={rotation}
      radius={Math.min(radius, Math.min(...size) * 0.35)}
      smoothness={2}
    >
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </RoundedBox>
  )
}

type RodBetweenProps = {
  start: V3
  end: V3
  radius: number
  color: string
  radialSegments?: number
  roughness?: number
  metalness?: number
  name?: string
}

/** A real cylinder aligned between two arbitrary local-space points. */
function RodBetween({
  start,
  end,
  radius,
  color,
  radialSegments = 10,
  roughness = 0.58,
  metalness = 0,
  name,
}: RodBetweenProps) {
  const transform = useMemo(() => {
    const from = new Vector3(...start)
    const to = new Vector3(...end)
    const direction = to.clone().sub(from)
    const length = direction.length()
    const quaternion = new Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize())
    return { length, midpoint: from.add(to).multiplyScalar(0.5), quaternion }
  }, [end, start])

  return (
    <mesh
      {...SHADOWS}
      name={name}
      position={transform.midpoint}
      quaternion={transform.quaternion}
    >
      <cylinderGeometry args={[radius, radius, transform.length, radialSegments]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  )
}

function configurePaperTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
}

function usePrintedLabel(kind: 'selected-work' | 'contact' | 'skills') {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = kind === 'selected-work' ? 560 : kind === 'skills' ? 480 : 360
    const context = canvas.getContext('2d')
    if (!context) return new CanvasTexture(canvas)

    context.fillStyle =
      kind === 'selected-work' ? '#f3e6cb' : kind === 'skills' ? '#f4efe2' : '#f8f3e8'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle =
      kind === 'selected-work' ? '#c08545' : kind === 'skills' ? '#b3a87a' : '#aa9d8c'
    context.lineWidth = 14
    context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36)

    if (kind === 'selected-work') {
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '900 96px Georgia, serif'
      context.fillStyle = '#b3603f'
      context.fillText('SELECTED', canvas.width / 2, 145)
      context.fillStyle = '#9aa66f'
      context.fillText('WORK', canvas.width / 2, 255)
      context.font = '800 86px sans-serif'
      context.fillStyle = '#bc6a45'
      context.fillText('作品展示', canvas.width / 2, 405)
    } else if (kind === 'skills') {
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = '800 104px sans-serif'
      context.fillStyle = '#9aa66f'
      context.fillText('个人技能', canvas.width / 2, 178)
      context.font = '900 112px Georgia, serif'
      context.fillStyle = '#b3603f'
      context.fillText('SKILLS', canvas.width / 2, 315)
      context.strokeStyle = '#c3b491'
      context.lineWidth = 5
      context.beginPath()
      context.moveTo(150, 382)
      context.lineTo(618, 382)
      context.stroke()
    } else {
      context.textAlign = 'left'
      context.textBaseline = 'alphabetic'
      context.font = '700 50px Georgia, serif'
      context.fillStyle = '#463a30'
      context.fillText('CONTACT', 62, 92)
      context.strokeStyle = '#aa9d8c'
      context.lineWidth = 4
      context.beginPath()
      context.moveTo(62, 124)
      context.lineTo(706, 124)
      context.stroke()
      context.font = '500 26px sans-serif'
      context.fillStyle = '#7e7468'
      context.fillText('LET\u2019S MAKE SOMETHING TOGETHER', 62, 180)
      context.fillText('HELLO@KEESU.DESIGN', 62, 236)
    }

    const output = new CanvasTexture(canvas)
    configurePaperTexture(output)
    return output
  }, [kind])

  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

const BOOKS = [
  { x: -0.34, w: 0.074, h: 0.46, color: '#8b9bab', tilt: 0 },
  { x: -0.262, w: 0.066, h: 0.42, color: '#f1b692', tilt: 0 },
  { x: -0.191, w: 0.064, h: 0.41, color: '#ffe2b3', tilt: 0 },
  { x: -0.12, w: 0.07, h: 0.39, color: '#fff2b2', tilt: 0 },
  { x: -0.044, w: 0.068, h: 0.44, color: '#efa478', tilt: 0 },
  { x: 0.034, w: 0.065, h: 0.46, color: '#fff0a9', tilt: 0 },
  { x: 0.108, w: 0.067, h: 0.43, color: '#f8f4d5', tilt: 0 },
  { x: 0.181, w: 0.068, h: 0.41, color: '#e3e0d2', tilt: 0 },
  { x: 0.26, w: 0.07, h: 0.36, color: '#f5e9dc', tilt: 0 },
  { x: 0.337, w: 0.06, h: 0.32, color: '#d9a59e', tilt: -0.13 },
] as const

/** Bottom-centred row of individually modelled books (front faces +Z). */
export function BooksModel() {
  return (
    <group name="BooksModel">
      {BOOKS.map((book, index) => (
        <group
          key={`${book.color}-${index}`}
          position={[book.x, book.h / 2, 0]}
          rotation={[0, 0, book.tilt]}
        >
          <RoundedPart
            name={`Book_${index + 1}`}
            size={[book.w, book.h, 0.19]}
            at={[0, 0, 0]}
            color={book.color}
            radius={0.01}
            roughness={0.82}
          />
          <RoundedPart
            size={[book.w * 0.7, 0.011, 0.198]}
            at={[0, book.h * 0.34, 0.006]}
            color={PROP_COLORS.cream}
            radius={0.003}
            roughness={0.9}
          />
          <RoundedPart
            size={[book.w * 0.7, 0.011, 0.198]}
            at={[0, -book.h * 0.34, 0.006]}
            color={PROP_COLORS.cream}
            radius={0.003}
            roughness={0.9}
          />
        </group>
      ))}
    </group>
  )
}

/** Thin printed paper mounted to a rigid, shadow-casting board. Bottom-centred. */
export function FindAWordBoardModel() {
  const texture = useTexture('/assets/obj/findaword2.webp')
  useEffect(() => configurePaperTexture(texture), [texture])

  return (
    <group name="FindAWordBoardModel">
      <RoundedPart
        name="FindAWord_Backboard"
        size={[FIND_A_WORD_SIZE[0], FIND_A_WORD_SIZE[1], FIND_A_WORD_DEPTH]}
        at={[0, FIND_A_WORD_SIZE[1] / 2, 0]}
        color="#ede3cc"
        radius={0.012}
        roughness={0.9}
      />
      <mesh
        {...SHADOWS}
        name="FindAWord_Print"
        position={[0, FIND_A_WORD_SIZE[1] / 2, FIND_A_WORD_FACE_Z]}
      >
        <planeGeometry args={[0.64, 0.388]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.92}
          metalness={0}
          alphaTest={0.08}
          alphaToCoverage
        />
      </mesh>
      {[-0.29, 0.29].map((x) => (
        <mesh {...SHADOWS} key={x} position={[x, 0.365, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 12]} />
          <meshStandardMaterial color="#b3603f" roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

/** Suitcase record player. Bottom-centred, front faces +Z. */
export function TurntableModel() {
  const skillsLabel = usePrintedLabel('skills')

  return (
    <group name="TurntableModel">
      <RoundedPart
        name="Turntable_Base"
        size={[0.7, 0.22, 0.4]}
        at={[0, 0.11, 0]}
        color={PROP_COLORS.softBlue}
        radius={0.045}
        roughness={0.62}
      />
      <group name="Turntable_OpenLid" position={[0, 0.23, -0.185]} rotation={[-0.12, 0, 0]}>
        <RoundedPart
          size={[0.62, 0.39, 0.035]}
          at={[0, 0.195, 0]}
          color={PROP_COLORS.softBlue}
          radius={0.025}
          roughness={0.66}
        />
        <RoundedPart
          size={[0.54, 0.31, 0.012]}
          at={[0, 0.195, 0.024]}
          color={PROP_COLORS.cream}
          radius={0.012}
          roughness={0.9}
        />
        <mesh {...SHADOWS} name="Turntable_SkillsCard" position={[0, 0.195, 0.031]}>
          <planeGeometry args={[0.49, 0.27]} />
          <meshStandardMaterial map={skillsLabel} roughness={0.92} metalness={0} />
        </mesh>
      </group>

      {/* 参考视角几乎是正面，完全水平的盘面只会剩一条线。真实结构
          仍然保留，但将盘面组朝观众倾斜 20°，让唱片、唱针和箱体前脸
          同时可见，不再用一张预烘焙的俯视图假装立体。 */}
      <group name="Turntable_TiltedDeck" position={[0, 0.225, 0.02]} rotation={[0.35, 0, 0]}>
        <RoundedPart
          name="Turntable_Deck"
          size={[0.64, 0.035, 0.35]}
          at={[0, 0, 0]}
          color="#ede7d8"
          radius={0.018}
          roughness={0.7}
        />
        <mesh {...SHADOWS} name="Turntable_Record" position={[-0.085, 0.026, 0.005]}>
          <cylinderGeometry args={[0.145, 0.145, 0.016, 48]} />
          <meshStandardMaterial color={PROP_COLORS.record} roughness={0.38} />
        </mesh>
        <mesh {...SHADOWS} position={[-0.085, 0.037, 0.005]}>
          <cylinderGeometry args={[0.034, 0.034, 0.012, 24]} />
          <meshStandardMaterial color="#f5e5bb" roughness={0.75} />
        </mesh>
        <mesh {...SHADOWS} position={[0.22, 0.035, -0.115]}>
          <cylinderGeometry args={[0.038, 0.042, 0.04, 18]} />
          <meshStandardMaterial color={PROP_COLORS.metal} roughness={0.32} metalness={0.54} />
        </mesh>
        <RodBetween
          name="Turntable_Tonearm"
          start={[0.22, 0.06, -0.11]}
          end={[0.08, 0.06, 0.09]}
          radius={0.009}
          color={PROP_COLORS.metal}
          metalness={0.6}
          roughness={0.28}
        />
        <RoundedPart
          size={[0.052, 0.025, 0.035]}
          at={[0.065, 0.062, 0.105]}
          color="#f4f0e5"
          radius={0.006}
        />
      </group>

      {[-0.225, 0.225].map((x) => (
        <RoundedPart
          key={x}
          size={[0.19, 0.095, 0.025]}
          at={[x, 0.105, 0.208]}
          color="#5c5348"
          radius={0.014}
          roughness={0.56}
        />
      ))}
      {[-0.33, 0.33].map((x) => (
        <RoundedPart
          key={x}
          size={[0.04, 0.055, 0.035]}
          at={[x, 0.17, 0.195]}
          color={PROP_COLORS.metal}
          radius={0.01}
          roughness={0.4}
          metalness={0.35}
        />
      ))}
      <mesh {...SHADOWS} name="Turntable_Handle" position={[0, 0.075, 0.222]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.105, 0.015, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#63594d" roughness={0.45} metalness={0.18} />
      </mesh>
      {[-0.105, 0.105].map((x) => (
        <mesh {...SHADOWS} key={x} position={[x, 0.075, 0.222]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.04, 12]} />
          <meshStandardMaterial color="#63594d" roughness={0.45} metalness={0.18} />
        </mesh>
      ))}
    </group>
  )
}

/** Orange document pouch with real pages, flap and printed paper label. */
export function SelectedWorkModel() {
  const label = usePrintedLabel('selected-work')

  return (
    <group name="SelectedWorkModel">
      <RoundedPart
        name="SelectedWork_Case"
        size={[0.62, 0.5, 0.13]}
        at={[0, 0.25, 0]}
        color={PROP_COLORS.yellow}
        radius={0.045}
        roughness={0.78}
      />
      {[-0.035, 0, 0.035].map((z, index) => (
        <RoundedPart
          key={z}
          name={`SelectedWork_Page_${index + 1}`}
          size={[0.52 - index * 0.012, 0.028, 0.09]}
          at={[0, 0.455 + index * 0.018, z]}
          color={index === 2 ? '#f8eed6' : PROP_COLORS.paper}
          radius={0.007}
          roughness={0.94}
        />
      ))}
      <RoundedPart
        name="SelectedWork_Flap"
        size={[0.57, 0.12, 0.045]}
        at={[0, 0.43, 0.082]}
        color="#efb754"
        rotation={[-0.08, 0, 0]}
        radius={0.018}
        roughness={0.78}
      />
      <mesh {...SHADOWS} name="SelectedWork_Label" position={[0, 0.245, 0.067]}>
        <planeGeometry args={[0.48, 0.35]} />
        <meshStandardMaterial map={label} roughness={0.92} />
      </mesh>
      <mesh {...SHADOWS} position={[0.22, 0.405, 0.11]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.027, 20]} />
        <meshStandardMaterial color={PROP_COLORS.orangeDark} roughness={0.5} />
      </mesh>
      <RodBetween
        start={[0.22, 0.405, 0.124]}
        end={[0.16, 0.46, 0.124]}
        radius={0.006}
        color="#9d6c32"
        roughness={0.7}
      />
    </group>
  )
}

/** Soft low-poly backpack. Bottom-centred, with real straps and stationery. */
export function BackpackModel() {
  return (
    <group name="BackpackModel">
      <RodBetween
        name="Backpack_LeftStrap"
        start={[-0.19, 0.05, -0.1]}
        end={[-0.25, 0.56, -0.1]}
        radius={0.027}
        color="#9c947f"
        roughness={0.9}
      />
      <RodBetween
        name="Backpack_RightStrap"
        start={[0.19, 0.05, -0.1]}
        end={[0.25, 0.56, -0.1]}
        radius={0.027}
        color="#9c947f"
        roughness={0.9}
      />
      <RoundedPart
        name="Backpack_Body"
        size={[0.56, 0.68, 0.22]}
        at={[0, 0.34, 0]}
        color="#efe7d5"
        radius={0.11}
        roughness={0.88}
      />
      <RoundedPart
        name="Backpack_Pocket"
        size={[0.43, 0.3, 0.115]}
        at={[0, 0.235, 0.145]}
        color={PROP_COLORS.lilac}
        radius={0.065}
        roughness={0.88}
      />
      <mesh {...SHADOWS} name="Backpack_Handle" position={[0, 0.68, 0]}>
        <torusGeometry args={[0.105, 0.024, 9, 24, Math.PI]} />
        <meshStandardMaterial color="#9c947f" roughness={0.9} />
      </mesh>
      <RoundedPart
        size={[0.28, 0.024, 0.025]}
        at={[0, 0.34, 0.207]}
        color="#8d8471"
        radius={0.009}
        roughness={0.75}
      />
      {[
        { x: -0.105, color: '#ef9eb8', h: 0.23 },
        { x: -0.035, color: '#f2c75b', h: 0.26 },
        { x: 0.04, color: '#968e7e', h: 0.24 },
        { x: 0.11, color: '#92c9ba', h: 0.22 },
      ].map((pen) => (
        <group key={pen.x} position={[pen.x, 0.49, 0.2]} rotation={[0, 0, pen.x * 0.5]}>
          <mesh {...SHADOWS}>
            <cylinderGeometry args={[0.014, 0.014, pen.h, 10]} />
            <meshStandardMaterial color={pen.color} roughness={0.65} />
          </mesh>
          <mesh {...SHADOWS} position={[0, pen.h / 2 + 0.012, 0]}>
            <coneGeometry args={[0.014, 0.025, 10]} />
            <meshStandardMaterial color="#eee2cd" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const TYPEWRITER_KEY_ROWS = [10, 10, 9] as const
const TYPEWRITER_KEY_Z = [-0.065, 0, 0.065] as const
const TYPEWRITER_KEYS = TYPEWRITER_KEY_ROWS.flatMap((count, row) =>
  Array.from({ length: count }, (_, inRow) => ({
    x: (inRow - (count - 1) / 2) * 0.058 + (row === 1 ? 0.014 : 0),
    z: TYPEWRITER_KEY_Z[row],
    row,
    inRow,
  })),
)

/**
 * Door-mounted typewriter. Local Z=0 is its magnetic mounting surface;
 * every solid part protrudes toward +Z so it follows the door hinge correctly.
 */
export function TypewriterModel() {
  const contactLabel = usePrintedLabel('contact')

  return (
    <group name="TypewriterModel">
      {[-0.27, 0.27].map((x) => (
        <RoundedPart
          key={x}
          name="Typewriter_Magnet"
          size={[0.12, 0.19, 0.025]}
          at={[x, 0.02, 0.014]}
          color="#5f5a50"
          radius={0.015}
          roughness={0.42}
          metalness={0.48}
        />
      ))}
      <RoundedPart
        name="Typewriter_Backplate"
        size={[0.72, 0.49, 0.055]}
        at={[0, 0, 0.043]}
        color={PROP_COLORS.cream}
        radius={0.035}
        roughness={0.8}
      />
      <RoundedPart
        name="Typewriter_PaperSupport"
        size={[0.56, 0.3, 0.035]}
        at={[0, 0.095, 0.082]}
        color="#f4ead8"
        radius={0.018}
        roughness={0.86}
      />
      <mesh {...SHADOWS} name="Typewriter_Paper" position={[0, 0.1, 0.101]}>
        <planeGeometry args={[0.5, 0.255]} />
        <meshStandardMaterial map={contactLabel} roughness={0.95} />
      </mesh>
      <mesh {...SHADOWS} name="Typewriter_Platen" position={[0, -0.045, 0.13]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.028, 0.028, 0.61, 18]} />
        <meshStandardMaterial color="#59463c" roughness={0.5} />
      </mesh>
      {[-0.325, 0.325].map((x) => (
        <mesh {...SHADOWS} key={x} position={[x, -0.045, 0.13]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 0.035, 16]} />
          <meshStandardMaterial color={PROP_COLORS.orangeDark} roughness={0.55} />
        </mesh>
      ))}
      <RoundedPart
        name="Typewriter_Body"
        size={[0.7, 0.17, 0.18]}
        at={[0, -0.16, 0.145]}
        color="#f5efe0"
        radius={0.035}
        roughness={0.76}
      />
      {/* 键床、键帽和空格键必须属于同一个局部总成：只旋转白色托板、把键帽
          留在 Typewriter 根坐标里的话，前两排会埋进机身、末排与空格会悬空。 */}
      <group
        name="Typewriter_KeyboardAssembly"
        position={[0, -0.235, 0.295]}
        rotation={[0.38, 0, 0]}
      >
        <RoundedPart
          name="Typewriter_KeyDeck"
          size={[0.67, 0.1, 0.265]}
          at={[0, 0, 0]}
          color="#f4eee0"
          radius={0.025}
          roughness={0.78}
        />
        <RoundedPart
          name="Typewriter_KeyWell"
          size={[0.6, 0.012, 0.25]}
          at={[0, 0.056, 0]}
          color="#d8cfc2"
          radius={0.012}
          roughness={0.82}
        />
        {TYPEWRITER_KEYS.map((key, index) => (
          <RoundedPart
            key={`${key.row}-${key.inRow}`}
            name={`Typewriter_Key_${index + 1}`}
            size={[0.043, 0.018, 0.034]}
            at={[key.x, 0.073, key.z]}
            color={PROP_COLORS.ink}
            radius={0.008}
            roughness={0.52}
          />
        ))}
        <RoundedPart
          name="Typewriter_Spacebar"
          size={[0.25, 0.018, 0.035]}
          at={[0, 0.073, 0.105]}
          color={PROP_COLORS.ink}
          radius={0.008}
          roughness={0.52}
        />
      </group>
      <RodBetween
        name="Typewriter_ReturnArm"
        start={[-0.29, -0.035, 0.145]}
        end={[-0.4, 0.035, 0.17]}
        radius={0.01}
        color={PROP_COLORS.darkMetal}
        roughness={0.3}
        metalness={0.62}
      />
    </group>
  )
}

function makeGuitarBodyShape() {
  const shape = new Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(-0.2, -0.01, -0.34, 0.08, -0.33, 0.27)
  shape.bezierCurveTo(-0.33, 0.43, -0.2, 0.44, -0.18, 0.54)
  shape.bezierCurveTo(-0.16, 0.66, -0.29, 0.7, -0.24, 0.82)
  shape.bezierCurveTo(-0.2, 0.94, -0.07, 0.9, 0, 0.83)
  shape.bezierCurveTo(0.07, 0.9, 0.2, 0.94, 0.24, 0.82)
  shape.bezierCurveTo(0.29, 0.7, 0.16, 0.66, 0.18, 0.54)
  shape.bezierCurveTo(0.2, 0.44, 0.33, 0.43, 0.33, 0.27)
  shape.bezierCurveTo(0.34, 0.08, 0.2, -0.01, 0, 0)
  return shape
}

function makePickguardShape() {
  const shape = new Shape()
  shape.moveTo(-0.035, 0.13)
  shape.bezierCurveTo(-0.17, 0.15, -0.22, 0.26, -0.19, 0.39)
  shape.bezierCurveTo(-0.16, 0.5, -0.09, 0.57, -0.08, 0.7)
  shape.lineTo(0.09, 0.7)
  shape.bezierCurveTo(0.09, 0.56, 0.18, 0.49, 0.18, 0.35)
  shape.bezierCurveTo(0.18, 0.22, 0.12, 0.15, -0.035, 0.13)
  return shape
}

/** Full-thickness stylised electric guitar. Bottom-centred and front-facing +Z. */
export function GuitarModel() {
  const bodyGeometry = useMemo(() => {
    const geometry = new ExtrudeGeometry(makeGuitarBodyShape(), {
      depth: 0.09,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.022,
      bevelThickness: 0.014,
      curveSegments: 16,
      steps: 1,
    })
    geometry.translate(0, 0, -0.045)
    return geometry
  }, [])
  const pickguardGeometry = useMemo(() => {
    const geometry = new ExtrudeGeometry(makePickguardShape(), {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.008,
      bevelThickness: 0.004,
      curveSegments: 12,
      steps: 1,
    })
    geometry.translate(0, 0, 0.052)
    return geometry
  }, [])

  useEffect(
    () => () => {
      bodyGeometry.dispose()
      pickguardGeometry.dispose()
    },
    [bodyGeometry, pickguardGeometry],
  )

  return (
    <group name="GuitarModel">
      <mesh {...SHADOWS} name="Guitar_Body" geometry={bodyGeometry}>
        <meshStandardMaterial color={PROP_COLORS.blue} roughness={0.56} />
      </mesh>
      <mesh {...SHADOWS} name="Guitar_Pickguard" geometry={pickguardGeometry}>
        <meshStandardMaterial color={PROP_COLORS.cream} roughness={0.72} />
      </mesh>
      <RoundedPart
        name="Guitar_Neck"
        size={[0.13, 0.86, 0.075]}
        at={[0, 1.09, 0]}
        color={PROP_COLORS.wood}
        radius={0.018}
        roughness={0.58}
      />
      <RoundedPart
        name="Guitar_Fretboard"
        size={[0.103, 0.83, 0.026]}
        at={[0, 1.08, 0.052]}
        color="#d79c50"
        radius={0.008}
        roughness={0.62}
      />
      <RoundedPart
        name="Guitar_Headstock"
        size={[0.19, 0.29, 0.085]}
        at={[0.025, 1.65, 0]}
        rotation={[0, 0, -0.08]}
        color={PROP_COLORS.cream}
        radius={0.035}
        roughness={0.68}
      />
      {Array.from({ length: 10 }, (_, index) => (
        <RoundedPart
          key={index}
          name={`Guitar_Fret_${index + 1}`}
          size={[0.108, 0.008, 0.009]}
          at={[0, 0.74 + index * 0.074, 0.071]}
          color="#d8dcda"
          radius={0.002}
          roughness={0.3}
          metalness={0.68}
        />
      ))}
      {[-0.045, -0.027, -0.009, 0.009, 0.027, 0.045].map((x, index) => (
        <RodBetween
          key={x}
          name={`Guitar_String_${index + 1}`}
          start={[x, 0.28, 0.084]}
          end={[x * 0.72, 1.74, 0.084]}
          radius={0.0012 + index * 0.00012}
          color="#d7d4c9"
          radialSegments={6}
          roughness={0.22}
          metalness={0.82}
        />
      ))}
      {[0.36, 0.51].map((y, index) => (
        <RoundedPart
          key={y}
          name={`Guitar_Pickup_${index + 1}`}
          size={[0.19, 0.065, 0.035]}
          at={[0, y, 0.085]}
          color="#aeb5b5"
          radius={0.014}
          roughness={0.38}
          metalness={0.42}
        />
      ))}
      <RoundedPart
        name="Guitar_Bridge"
        size={[0.18, 0.045, 0.035]}
        at={[0, 0.245, 0.085]}
        color={PROP_COLORS.metal}
        radius={0.01}
        roughness={0.35}
        metalness={0.5}
      />
      {[
        [-0.12, 0.19],
        [0.14, 0.2],
        [0.16, 0.3],
      ].map(([x, y], index) => (
        <mesh {...SHADOWS} key={`${x}-${y}`} name={`Guitar_Knob_${index + 1}`} position={[x, y, 0.095]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.027, 0.027, 0.025, 16]} />
          <meshStandardMaterial color="#d4d0bf" roughness={0.48} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, index) => {
        const side = index % 2 === 0 ? -1 : 1
        const y = 1.57 + Math.floor(index / 2) * 0.075
        return (
          <group key={index} position={[side * 0.12, y, 0]}>
            <mesh {...SHADOWS} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.024, 0.024, 0.07, 12]} />
              <meshStandardMaterial color={PROP_COLORS.metal} roughness={0.3} metalness={0.62} />
            </mesh>
            <RoundedPart
              size={[0.06, 0.032, 0.025]}
              at={[side * 0.045, 0, 0]}
              color="#e5e0cf"
              radius={0.009}
              roughness={0.45}
            />
          </group>
        )
      })}
      <mesh {...SHADOWS} position={[0, 0.012, 0]}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshStandardMaterial color={PROP_COLORS.metal} roughness={0.35} metalness={0.55} />
      </mesh>
    </group>
  )
}

/**
 * A thin magnetic poster board. The supplied artwork is only the printed front
 * (its four corner tape strips are printed into the art); the pale backing and
 * edge thickness are real geometry, so it can cast a clean contact shadow on
 * the locker door instead of intersecting the vent slats.
 */
export function PosterCardModel({
  url = '/assets/obj/posterwall.webp',
}: {
  url?: string
}) {
  const texture = useTexture(url)
  useEffect(() => configurePaperTexture(texture), [texture])

  return (
    <group name="PosterCardModel">
      <RoundedPart
        name="PosterCard_Back"
        size={[0.6, 0.84, 0.009]}
        at={[0, 0, 0.0055]}
        color="#f7f3ea"
        radius={0.008}
        roughness={0.94}
      />
      {/* 画芯宽高比跟随 trim 后贴图（989×1406 ≈ 0.7034），四周只留一圈均匀米白边 */}
      <mesh {...SHADOWS} name="PosterCard_Print" position={[0, 0, 0.011]}>
        <planeGeometry args={[0.56, 0.796]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.95}
          metalness={0}
          alphaTest={0.08}
          alphaToCoverage
        />
      </mesh>
    </group>
  )
}

const POLAROID_SOURCE_SIZE = [760, 704] as const

/** Pixel rectangle in an unmodified source image, measured from its top-left. */
export type PixelCrop = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

/**
 * 从整张源图里裁一块出来，**不重采样、不拉伸**。
 *
 * three 的 UV 原点在左下，量出来的像素矩形原点在左上，所以 offset 的 v 要翻。
 * 用 repeat/offset 直接选像素：贴到几何上时把面片的宽高比做成和 crop 一样，
 * 就一个像素都不会被拉长。
 */
function useCroppedTexture(
  url: string,
  source: readonly [width: number, height: number],
  crop: PixelCrop,
) {
  const full = useTexture(url)
  const [sourceWidth, sourceHeight] = source
  const { x, y, width, height } = crop
  const cropped = useMemo(() => {
    const texture = full.clone()
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.repeat.set(width / sourceWidth, height / sourceHeight)
    texture.offset.set(x / sourceWidth, 1 - (y + height) / sourceHeight)
    configurePaperTexture(texture)
    return texture
  }, [full, height, sourceHeight, sourceWidth, width, x, y])

  useEffect(() => () => cropped.dispose(), [cropped])
  return cropped
}

/**
 * Real photograph regions inside the supplied three-card composite.
 *
 * These rectangles deliberately stop inside each printed image window instead of
 * sampling the baked white frames/shadows.  The frame and its contact shadow are
 * recreated by geometry below, so every card can move independently without a
 * fragment of either neighbouring card travelling with it.
 */
export const POLAROID_CROPS = {
  friends: { x: 279, y: 62, width: 256, height: 206 },
  beach: { x: 62, y: 310, width: 231, height: 214 },
  camera: { x: 460, y: 340, width: 240, height: 212 },
} as const satisfies Record<string, PixelCrop>

/**
 * One independently movable, full-thickness Polaroid card.
 *
 * `size` is the real card body's width/height.  The source crop is fitted inside
 * its photo window with the crop's native aspect ratio; any spare room remains
 * white border instead of distorting the supplied photograph.
 */
export function PolaroidCardModel({
  name,
  crop,
  size,
}: {
  name: string
  crop: PixelCrop
  size: readonly [width: number, height: number]
}) {
  const texture = useCroppedTexture('/assets/obj2/polaroids.webp', POLAROID_SOURCE_SIZE, crop)
  const [cardWidth, cardHeight] = size
  const sourceAspect = crop.width / crop.height
  const maxPhotoWidth = cardWidth - 0.046
  const maxPhotoHeight = cardHeight - 0.084
  const photoWidth = Math.min(maxPhotoWidth, maxPhotoHeight * sourceAspect)
  const photoHeight = photoWidth / sourceAspect
  const photoY = cardHeight / 2 - 0.023 - photoHeight / 2

  return (
    <group name={`${name}_Model`}>
      <RoundedPart
        name={`${name}_Magnet`}
        size={[0.082, 0.082, 0.012]}
        at={[0, 0.02, 0.006]}
        color="#87949a"
        radius={0.028}
        roughness={0.38}
        metalness={0.5}
      />
      <RoundedPart
        name={`${name}_Back`}
        size={[cardWidth, cardHeight, 0.024]}
        at={[0, 0, 0.019]}
        color="#fffdf7"
        radius={0.014}
        roughness={0.94}
      />
      <RoundedPart
        name={`${name}_PhotoBed`}
        size={[photoWidth + 0.008, photoHeight + 0.008, 0.006]}
        at={[0, photoY, 0.034]}
        color="#eee8dc"
        radius={0.006}
        roughness={0.95}
      />
      <mesh {...SHADOWS} name={`${name}_Print`} position={[0, photoY, 0.038]}>
        <planeGeometry args={[photoWidth, photoHeight]} />
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  )
}

export type DoorTrayContent = 'paper' | 'stationery' | 'empty'

/**
 * A door-mounted magnetic tray with real back, floor, front lip and side walls.
 * Its local origin is the centre of the magnetic back surface (Z=0).
 */
export function DoorTrayModel({ content = 'paper' }: { content?: DoorTrayContent }) {
  return (
    <group name={`DoorTrayModel_${content}`}>
      {[-0.18, 0.18].map((x) => (
        <RoundedPart
          key={x}
          name="DoorTray_Magnet"
          size={[0.085, 0.12, 0.022]}
          at={[x, 0.02, 0.012]}
          color="#808b91"
          radius={0.012}
          roughness={0.38}
          metalness={0.5}
        />
      ))}
      <RoundedPart
        name="DoorTray_Back"
        size={[0.48, 0.22, 0.035]}
        at={[0, -0.01, 0.035]}
        color="#f7f5ec"
        radius={0.025}
        roughness={0.86}
      />
      <RoundedPart
        name="DoorTray_Floor"
        size={[0.48, 0.038, 0.18]}
        at={[0, -0.105, 0.11]}
        color="#fbf8ef"
        radius={0.012}
        roughness={0.86}
      />
      <RoundedPart
        name="DoorTray_Lip"
        size={[0.48, 0.095, 0.035]}
        at={[0, -0.065, 0.195]}
        color="#f4f1e7"
        radius={0.016}
        roughness={0.86}
      />
      {[-0.222, 0.222].map((x) => (
        <RoundedPart
          key={x}
          name="DoorTray_Side"
          size={[0.035, 0.2, 0.18]}
          at={[x, -0.01, 0.11]}
          color="#f7f4eb"
          radius={0.012}
          roughness={0.86}
        />
      ))}

      {content === 'paper' && (
        <group name="DoorTray_Papers" position={[0, 0.05, 0.125]} rotation={[-0.08, 0, 0]}>
          {[-0.085, -0.025, 0.045].map((x, index) => (
            <RoundedPart
              key={x}
              size={[0.19, 0.25 + index * 0.018, 0.016]}
              at={[x, 0.025 + index * 0.012, index * 0.012]}
              rotation={[0, 0, (index - 1) * 0.08]}
              color={index === 1 ? '#f8e9ee' : PROP_COLORS.paper}
              radius={0.006}
              roughness={0.95}
            />
          ))}
        </group>
      )}

      {content === 'stationery' && (
        <group name="DoorTray_Stationery">
          {[
            { x: -0.16, w: 0.055, h: 0.2, color: '#f7e59c' },
            { x: -0.1, w: 0.052, h: 0.18, color: '#f3c4d4' },
            { x: -0.042, w: 0.05, h: 0.19, color: '#e9e4d8' },
            { x: 0.013, w: 0.052, h: 0.18, color: '#cfd2c4' },
          ].map((item) => (
            <RoundedPart
              key={item.x}
              size={[item.w, item.h, 0.07]}
              at={[item.x, item.h / 2 - 0.09, 0.135]}
              color={item.color}
              radius={0.01}
              roughness={0.84}
            />
          ))}
          <mesh {...SHADOWS} name="DoorTray_Ball" position={[0.145, 0.015, 0.145]}>
            <sphereGeometry args={[0.07, 20, 12]} />
            <meshStandardMaterial color="#f2b8c2" roughness={0.72} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/* ── ABOUT 工牌 ───────────────────────────────────────────── */

/** 工牌源图尺寸。下面每一个几何数字都由这张图的像素反算，换素材只改这里。 */
const ID_CARD_SOURCE_SIZE = [430, 760] as const

/**
 * 源图 1px 折算多少世界单位。
 *
 * 工牌原来是贴花图集里的一张平面，整张 430px 铺满 ID_CARD_SIZE 的宽度
 * （= 0.38 门宽，推导见 decalSpecs）。做成实体后**继续用同一把尺子**，
 * 牌子才落在原处，门贴挂钩也才还能穿过吊环的孔。
 */
const ID_CARD_PX = ID_CARD_SIZE[0] / ID_CARD_SOURCE_SIZE[0]

/**
 * 卡体厚度。
 *
 * 拍立得取 0.024，那是相纸加一层卡纸托板；PVC 工牌套比它薄，但也不能薄到
 * 只剩一条缝——那就等于换个方式做回贴纸。上限由工牌自己给：印刷吊环的环带
 * 在源图里宽约 21px = 0.017，注塑件不会比自己的环带还厚。取 0.014，
 * 是拍立得的 58%、贴花层间距 0.0008 的 17 倍，侧棱一眼就是实心的。
 */
const ID_CARD_THICKNESS = 0.014

/**
 * 挤出倒角，取 3px。
 *
 * ExtrudeGeometry 的 bevelSize 是**向轮廓外**长的：正反两个端面停在轮廓上，
 * 中段鼓出 bevelSize。所以下面挤的是「卡体四周各收 3px」的芯，倒角再把腰
 * 撑回真实卡面，端面正好比卡面小一圈 3px —— 印刷面照同样收 3px 去裁，
 * 就严丝合缝地铺在端面上，边上不会翘出一圈纸片。
 * 0.00245 的倒角占满 0.014 侧棱的两端，斜看时吃得到一条连续高光。
 */
const ID_CARD_BEVEL = 3 * ID_CARD_PX

/** 卡面圆角：新源图卡角实测 72px ÷ 缩放比 ≈ 38px。 */
const ID_CARD_CORNER = 38 * ID_CARD_PX

/** 卡体轮廓（源图像素，左上原点）。上面 0–118 那一段是吊环+扣具，不算卡体。 */
const ID_CARD_BODY: PixelCrop = { x: 0, y: 119, width: 430, height: 641 }

/** 印刷面 = 挤出用的芯：卡体四周各收 3px，与倒角后的端面重合。 */
const ID_CARD_PRINT: PixelCrop = { x: 3, y: 122, width: 424, height: 635 }

/**
 * 吊环。新工牌图源（内容裁剪后 430×760）实测：挂绳短桩 x 177–243 / y 0–19，
 * 环体 x 148–271 / y 2–90，绳孔 x 170–249 / y 43–71，扣具 y 78–119 接入卡顶。
 * 孔心 x≈210、孔区世界 y 0.805–0.829，钩尖（0.810–0.835）从孔中穿过；
 * 挂绳短桩和环体上部把钩臂（x 207–221）全遮住。
 * 裁切框 x 145–280 包住整个环体；下缘 127 与卡体（顶 119）重叠 8px，
 * 接缝埋在卡体内部，环与卡之间不会露出缝。
 */
const ID_CARD_RING: PixelCrop = { x: 145, y: 0, width: 135, height: 127 }

/** 把源图矩形换算成「以整张工牌中心为原点、+Y 向上」的局部矩形。 */
function idCardRect(crop: PixelCrop) {
  const [sourceWidth, sourceHeight] = ID_CARD_SOURCE_SIZE
  return {
    width: crop.width * ID_CARD_PX,
    height: crop.height * ID_CARD_PX,
    x: (crop.x + crop.width / 2 - sourceWidth / 2) * ID_CARD_PX,
    y: (sourceHeight / 2 - (crop.y + crop.height / 2)) * ID_CARD_PX,
  }
}

const ID_CARD_BODY_RECT = idCardRect(ID_CARD_BODY)
const ID_CARD_PRINT_RECT = idCardRect(ID_CARD_PRINT)
const ID_CARD_RING_RECT = idCardRect(ID_CARD_RING)

/** 居中的圆角矩形轮廓，供挤出用。 */
function makeRoundedRectShape(width: number, height: number, radius: number): Shape {
  const halfW = width / 2
  const halfH = height / 2
  const r = Math.min(radius, halfW, halfH)
  const shape = new Shape()
  shape.moveTo(-halfW + r, -halfH)
  shape.lineTo(halfW - r, -halfH)
  shape.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(halfW, halfH - r)
  shape.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-halfW + r, halfH)
  shape.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-halfW, -halfH + r)
  shape.absarc(-halfW + r, -halfH + r, r, Math.PI, (3 * Math.PI) / 2, false)
  return shape
}

/**
 * ABOUT 工牌，有真实厚度的实体。
 *
 * 局部原点 = 整张工牌（吊环 + 卡体）的中心，与它取代的那张贴花中心重合；
 * z=0 是朝门的那一面，实体一律朝 +Z 长出去，和其它门上物件一致。
 *
 * 三块各有各的道理：
 *   · 卡体 —— 圆角矩形挤出件。用挤出而不是 RoundedBox：卡面圆角 33px≈0.027，
 *     而 RoundedBox 的圆角受厚度限制最多 0.007，四个角会比印刷图方一圈。
 *   · 印刷面 —— 只裁源图的卡体那一段（不含吊环），宽高比与裁切框一致，不拉伸。
 *   · 吊环 —— 必须留成薄薄一片 alpha 抠图。它是个带孔的塑料环，换成实心盒子
 *     就把孔堵死了，门贴挂钩再也穿不过去。
 *
 * 吊环片放在卡体的中面（z = 厚度/2）。挂钩的手臂在门内侧内容组的 z = −0.0025、
 * 钩尖在 +0.0255，工牌卡背贴在 +0.0075（见 decalSpecs 的 ID_CARD_AT），环面落在
 * +0.0145：手臂被环带挡在后面，钩尖从孔里探到牌子前面 0.011，穿孔这件事才成立。
 * 也因此 Props.tsx 给它 hoverLift=0 —— 牌子是**穿在**钩子上的，抬不起来。
 */
export function IdCardModel() {
  const printMap = useCroppedTexture(
    '/assets/obj/idcard2.webp',
    ID_CARD_SOURCE_SIZE,
    ID_CARD_PRINT,
  )
  const ringMap = useCroppedTexture('/assets/obj/idcard2.webp', ID_CARD_SOURCE_SIZE, ID_CARD_RING)

  const bodyGeometry = useMemo(() => {
    // 挤的是收 3px 的芯，倒角再向外把腰撑回 ID_CARD_BODY_RECT / 33px 圆角
    const geometry = new ExtrudeGeometry(
      makeRoundedRectShape(
        ID_CARD_PRINT_RECT.width,
        ID_CARD_PRINT_RECT.height,
        ID_CARD_CORNER - ID_CARD_BEVEL,
      ),
      {
        depth: ID_CARD_THICKNESS - ID_CARD_BEVEL * 2,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: ID_CARD_BEVEL,
        bevelThickness: ID_CARD_BEVEL,
        curveSegments: 8,
        steps: 1,
      },
    )
    // 挤出件的 z 是 −bevelThickness … depth+bevelThickness，抬回 0 … 厚度
    geometry.translate(0, 0, ID_CARD_BEVEL)
    return geometry
  }, [])

  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])

  return (
    <group name="IdCardModel">
      {/* 卡体故意比印刷面更冷更亮、粗糙度低一档：正面被印刷面盖住，
          只有那一圈 0.014 的侧棱露着本色，材质不同边才读得出来 */}
      <mesh
        {...SHADOWS}
        name="IdCard_Body"
        geometry={bodyGeometry}
        position={[ID_CARD_BODY_RECT.x, ID_CARD_BODY_RECT.y, 0]}
      >
        <meshStandardMaterial color="#e9e4d8" roughness={0.42} metalness={0.04} />
      </mesh>
      {/* alphaTest 取 0.5 而不是 0.08：和贴花图集同一个理由 ——
          0.08 在缩得最狠的 mip 上会让轮廓整整胖一圈，吊环的孔更是会糊死 */}
      <mesh
        {...SHADOWS}
        name="IdCard_Print"
        position={[ID_CARD_PRINT_RECT.x, ID_CARD_PRINT_RECT.y, ID_CARD_THICKNESS + 0.0012]}
      >
        <planeGeometry args={[ID_CARD_PRINT_RECT.width, ID_CARD_PRINT_RECT.height]} />
        <meshStandardMaterial
          map={printMap}
          roughness={0.9}
          metalness={0}
          alphaTest={0.5}
          alphaToCoverage
        />
      </mesh>
      <mesh
        {...SHADOWS}
        name="IdCard_Ring"
        position={[ID_CARD_RING_RECT.x, ID_CARD_RING_RECT.y, ID_CARD_THICKNESS / 2]}
      >
        <planeGeometry args={[ID_CARD_RING_RECT.width, ID_CARD_RING_RECT.height]} />
        <meshStandardMaterial
          map={ringMap}
          roughness={0.5}
          metalness={0.04}
          alphaTest={0.5}
          alphaToCoverage
        />
      </mesh>
    </group>
  )
}

/**
 * The self-adhesive door hook the ID badge hangs from.
 *
 * The reference shot has a real wall hook above the badge: a plate stuck on the
 * door, an arm running down it, and a J-curl that comes forward through the
 * badge's ring. The badge is now a real object (IdCardModel), but the illusion
 * still rests on the same thing — the arm has to cross the badge's ring plane
 * *inside* the hole — hence the exact numbers below:
 *
 *   local origin = centre of the plate's back face, sitting on the door;
 *   +Z leaves the door, so the badge's ring plane is at z = +0.019 and the arm
 *   stays at z = 0.002 (behind it, hidden by the printed ring band) until the
 *   curl carries it out to z = 0.030 in front, inside the hole.
 *
 * The badge can be dragged off; the hook is door hardware and stays put.
 */
export function IdCardHookModel() {
  return (
    <group name="IdCardHook_Model">
      <RoundedPart
        name="IdCardHook_Plate"
        size={[0.066, 0.062, 0.012]}
        at={[0, 0, 0.006]}
        color="#e6e0d2"
        radius={0.012}
        roughness={0.52}
        metalness={0.08}
      />
      {/* Arm runs down flat against the door, hidden behind the printed ring band. */}
      <RodBetween
        name="IdCardHook_Arm"
        start={[0, -0.026, 0.002]}
        end={[0, -0.087, 0.002]}
        radius={0.006}
        color={PROP_COLORS.metal}
        roughness={0.34}
        metalness={0.55}
      />
      {/* Half-torus curl: sweeps from the door side out through the ring's hole. */}
      <group name="IdCardHook_Curl" position={[0, -0.087, 0.016]} rotation={[0, Math.PI / 2, 0]}>
        <mesh {...SHADOWS} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.014, 0.006, 10, 26, Math.PI]} />
          <meshStandardMaterial color={PROP_COLORS.metal} roughness={0.34} metalness={0.55} />
        </mesh>
      </group>
      <RodBetween
        name="IdCardHook_Tip"
        start={[0, -0.087, 0.03]}
        end={[0, -0.062, 0.03]}
        radius={0.006}
        color={PROP_COLORS.metal}
        roughness={0.34}
        metalness={0.55}
      />
    </group>
  )
}
