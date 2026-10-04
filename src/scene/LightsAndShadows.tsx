import { ContactShadows } from '@react-three/drei'
import { LOCKER_D, LOCKER_W } from './sceneConfig'

/**
 * 灯光与阴影。
 *
 * 参考参考的光照特征：
 * - 整体高调、近乎无环境色偏，柜面是浅蓝烤漆，高光柔而宽；
 * - 主光来自**左上前方**，柜体右下有一片明显的落地投影；
 * - 蓝色柜腔不是一块死平面，深处更暗、隔板下缘有接触遮蔽。
 *
 * 因此这里用「一盏柔和主光 + 一盏右侧补光 + 半球环境光」，
 * 落地阴影交给 drei 的 ContactShadows（渲染到透明平面，画布保持透明，
 * 页面底色仍由 CSS 提供，不用在 3D 里再铺一层白地板）。
 */
export default function LightsAndShadows({ dynamic = false }: { dynamic?: boolean }) {
  return (
    <>
      {/* 天空浅冷、地面反光偏暖，保证柜腔深处不是纯黑也不是纯蓝 */}
      {/* 环境光只负责抬起暗部，不再把浅色物件整体洗平。实体物件的体积主要
          由下面那盏有方向性的 key light 和它们自己的投影来交代。 */}
      <hemisphereLight args={['#f6efe4', '#c9b7a2', 1.16]} />

      {/* 主光：左上前方，投影落到右下 */}
      <directionalLight
        castShadow
        position={[-3.1, 8.0, 7.0]}
        intensity={1.84}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.008}
        shadow-radius={3}
      >
        <orthographicCamera attach="shadow-camera" args={[-4.2, 4.2, 4.2, -1.2, 0.5, 24]} />
      </directionalLight>

      {/* 右侧补光：压住主光背面的死黑，不投影 */}
      <directionalLight position={[6.5, 3.2, 4.5]} intensity={0.34} />
      {/* 正面极弱的填充，让柜门贴纸在近景里还能看清 */}
      <directionalLight position={[0, 1.6, 9]} intensity={0.25} />

      {/* 落地接触阴影：跟着柜体一起变化，不是一张固定的渐变图 */}
      <ContactShadows
        position={[0.18, 0.004, 0.06]}
        scale={[LOCKER_W * 1.45, LOCKER_D * 4.2]}
        resolution={768}
        blur={2.25}
        far={1.5}
        opacity={0.58}
        color="#5e5148"
        // 动画期间每帧重算，静止后停下来，不留无意义的常驻渲染
        frames={dynamic ? Infinity : 1}
      />
    </>
  )
}
