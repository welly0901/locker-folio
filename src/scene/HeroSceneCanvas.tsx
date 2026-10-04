import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { NoToneMapping } from 'three'
import { useSceneCapabilities } from '../store'
import CameraRig from './CameraRig'
import { APPROACH_KEYS } from './cameraPath'
import LightsAndShadows from './LightsAndShadows'
import LockerModel from './LockerModel'
import PerformanceGovernor from './PerformanceGovernor'
import DecalField from './DecalField'
import {
  DOOR1_DECALS,
  DOOR2_INNER_DECALS,
  DOOR4_DECALS,
  ID_CARD_HOOK_AT,
} from './decalSpecs'
import { CameraReturn, DoorHotspots, DoorOneHotspots, WorldHotspots } from './Hotspots'
import { DOOR_H, DOOR_W } from './lockerSpec'
import { IdCardHookModel } from './PhysicalProps'
import {
  CavityProps,
  DoorFourMountedProps,
  DoorOneMountedProps,
  DoorTwoMountedProps,
  FrontProps,
} from './Props'
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR } from './sceneConfig'
import ZoomControls, { ZoomInput } from './ZoomControls'
import './hero.css'

/**
 * 工牌、打字机和 ABOUT / CONTACT 两个热点共用同一个门内侧坐标系。
 *
 * 这里不再为工牌单独接线：它已经是一件实体（Props 的 ID_CARD），
 * PhysicalItem 会替它登记随拖拽移动的热点锚点、并把点击与 hover 转给
 * 同一条动作总线 —— 正是原先这个组件手工维护 ABOUT_LOCAL 在做的事。
 */
function DoorTwoInnerContent({ interactive }: { interactive: boolean }) {
  return (
    <group name="Door_02_InteractiveContent">
      {/* 工牌挂在这枚门贴挂钩上（参考如此）。钩子是门上的五金件，
          工牌被拖走后它留在原地，位置见 decalSpecs 的 ID_CARD_HOOK_AT */}
      <group name="Door_02_IdCardHook" position={[...ID_CARD_HOOK_AT]}>
        <IdCardHookModel />
      </group>
      <Suspense fallback={null}>
        <DecalField
          name="Decals_Door02_Inner"
          specs={DOOR2_INNER_DECALS}
          width={DOOR_W}
          height={DOOR_H}
          interactive={interactive}
        />
      </Suspense>
      <DoorTwoMountedProps />
      <DoorHotspots />
    </group>
  )
}

/**
 * 首屏 3D 场景。
 *
 * 结构：Canvas + 相机 + 灯光 + 性能总管 + 柜体 + 柜内外物件 + 门上贴花 + 热点。
 */
export default function HeroSceneCanvas() {
  const caps = useSceneCapabilities()
  const query = new URLSearchParams(location.search)

  const debugGrid = import.meta.env.DEV && query.get('grid') === '1'

  return (
    <div className="hero">
      <Canvas
        className="hero__canvas"
        /*
         * 静止时按需渲染，有动画时连续渲染。
         *
         * 这一项**必须是受控的**，不能只靠 PerformanceGovernor 里的
         * `setFrameloop`：Canvas 每次重渲染都会把 frameloop 属性重新灌一遍，
         * 把 governor 设过的值冲掉。而场景状态一变 caps 就变、Canvas 就重渲染，
         * 于是 focusing → overlayOpening → returning 这一串里 governor 的
         * effect 依赖没变、不会重跑，frameloop 被永久按回 demand，
         * 画面直接停住（实测开场 4.6s 只出了 90 帧，返回镜头一帧都不走）。
         */
        frameloop={caps.animating ? 'always' : 'demand'}
        shadows
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          // 参考是高调平光渲染，ACES 会把浅蓝烤漆压成灰。这里不做色调映射，
          // 由灯光强度直接控制曝光，颜色才对得上参考帧的采样值。
          toneMapping: NoToneMapping,
        }}
        camera={{
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
          // 首帧就落在 approach 起手机位：参考里方格还没散完柜体已经在画面里，
          // 不能等揭幕结束再淡入（这会露出一段白场）
          position: [...APPROACH_KEYS[0].pos],
        }}
      >
        <PerformanceGovernor animating={caps.animating} />
        <CameraRig />
        <ZoomInput />
        <LightsAndShadows dynamic={caps.animating} />
        {/* 贴片要等纹理解码完才能算尺寸，各自用 Suspense 兜住。
            柜体不依赖纹理，放在 Suspense 外面，纹理慢也不会整柜消失 */}
        <LockerModel
          cavityContent={
            <Suspense fallback={null}>
              <CavityProps />
            </Suspense>
          }
          doorInnerContent={
            <DoorTwoInnerContent interactive={caps.drag} />
          }
          doorFaceContent={{
            0: (
              <>
                <Suspense fallback={null}>
                  <DecalField
                    name="Decals_Door01_Face"
                    specs={DOOR1_DECALS}
                    width={DOOR_W}
                    height={DOOR_H}
                    interactive={caps.drag}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <DoorOneMountedProps />
                </Suspense>
                <DoorOneHotspots />
              </>
            ),
            3: (
              <>
                <Suspense fallback={null}>
                  <DecalField
                    name="Decals_Door04_Face"
                    specs={DOOR4_DECALS}
                    width={DOOR_W}
                    height={DOOR_H}
                    interactive={caps.drag}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <DoorFourMountedProps />
                </Suspense>
              </>
            ),
          }}
        />
        <Suspense fallback={null}>
          <FrontProps />
        </Suspense>
        <WorldHotspots />
        <CameraReturn />
      </Canvas>
      <ZoomControls />
      {debugGrid && <div className="hero__calib" aria-hidden />}
    </div>
  )
}
