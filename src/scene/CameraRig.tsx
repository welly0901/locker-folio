import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { introTime } from '../experience/experienceClock'
import { distanceScaleFor, introPose, type CameraPose } from './cameraPath'
import { cameraDirected, directedPose, noteCurrentPose } from './cameraDirector'
import { stepZoom, zoomSettled } from './userZoom'
import { CAMERA_FOV } from './sceneConfig'

const _pos = new Vector3()
const _tgt = new Vector3()

/**
 * 相机机位控制器。
 *
 * 每帧从主时间线读一个时刻，插值出机位写进相机。
 * 相机自己不持有任何动画状态、不读 DOM、也不写 React state ——
 * 时钟每帧都在变，写进 store 会把整棵场景树重渲染。
 */
export default function CameraRig({ pose }: { pose?: CameraPose }) {
  const invalidate = useThree((s) => s.invalidate)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const scale = distanceScaleFor(width / Math.max(1, height))

  useFrame(({ camera: cam }, dt) => {
    // FOV 是标定出来的常量，只在被别处改动过时纠回来。
    // 写在这里而不是 useEffect 里：相机是 useThree 返回的对象，
    // 在 effect 里改它属于「修改 hook 返回值」，lint 会拦。
    if (cam instanceof PerspectiveCamera && cam.fov !== CAMERA_FOV) {
      cam.fov = CAMERA_FOV
      cam.updateProjectionMatrix()
    }
    // 镜头只有三个来源，优先级从高到低：显式传入 > 镜头调度器 > 开场时间线。
    // 调度器接管的是开场之后的局部聚焦与返回。
    const p = pose ?? directedPose(performance.now()) ?? introPose(introTime())
    noteCurrentPose(p)
    _tgt.set(p.target[0], p.target[1], p.target[2])
    _pos.set(p.pos[0], p.pos[1], p.pos[2])
    // 以注视点为中心按比例后撤：窄屏补偿 × 用户缩放。
    // 两者都是「乘在半径上的标量」，与机位来源正交 —— 不管这一帧的 pose 来自
    // 开场时间线还是镜头调度器，用户的缩放都照样叠加，不会互相抹掉（见 userZoom.ts）
    _pos.sub(_tgt).multiplyScalar(scale * stepZoom(dt)).add(_tgt)
    cam.position.copy(_pos)
    cam.lookAt(_tgt)
    // 局部聚焦、返回、用户缩放都可能发生在 caps.animating 为 false 的
    // 稳定态里，不能只指望 frameloop 开着，这里自己续帧
    if (cameraDirected() || !zoomSettled()) invalidate()
  })

  return null
}
