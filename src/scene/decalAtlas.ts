/* ============================================================================
 * 柜门贴花图集
 *
 * ── 图集由构建期打好，场景层只负责读表 ──────────────────────
 * 这里最初的写法是运行时用 canvas 把十五张单图 drawImage 拼成一张
 * CanvasTexture。**那条路是错的，已经废掉**：canvas 2D 的位图按预乘 alpha
 * 存储，alpha=0 的像素预乘后 RGB 恒为 0。前两轮好不容易把每张
 * 贴图透明区的 RGB 扩张成物件本色，走一趟 canvas 就全变回黑，生成 mipmap 时
 * 黑色被平均进边缘 —— 每张贴花外面套一圈深色描边，正是要消除的东西。
 *
 * 现在直接用素材层在构建期打好的那一张：
 *   图片  `/assets/obj2/doorDecals.webp`（1408×1180，MaxRects 装箱，
 *         每块 16px 边距且边缘 RGB 已挤出，mip 0–4 级不串块）
 *   UV 表 `scripts/assets/decal-atlas.json`（`rect` 已按 three 的左下原点翻好 v）
 * 实测这张图里 alpha=0 区域的 RGB 均值是 76 而不是 0，扩张确实保住了。
 *
 * 网络请求 15 → 1，运行时零 drawImage，GPU 13.5MiB → 8.5MiB。
 *
 * ── 与 decalSpecs.ts 的分工 ─────────────────────────────────
 * 这张表只管「每张贴图在图集里的哪一格、原始宽高比多少」；
 * 「贴在门面的什么位置、多大」在 decalSpecs.ts。两处没有重叠，
 * 贴片高度统一由这里的 aspect 算，换素材不用改 decalSpecs。
 * ========================================================================== */

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three'
import atlasData from '../../scripts/assets/decal-atlas.json'

export type AtlasEntry = {
  /** 图集内的 UV 矩形：[u0, v0, du, dv] */
  rect: [number, number, number, number]
  /** 原图宽高比（宽/高），贴片高度由它算 */
  aspect: number
  /**
   * 该用 cutout 还是 blend。素材层按像素统计逐张判定后写在图集表里：
   * 25 张里只有 washi 胶带（maxA=241、本体 82% 半透）是真半透明，
   * 其余内部半透明只占 0.00%–0.04%，都是 0.9–2.0px 的抗锯齿边。
   */
  mode: 'cutout' | 'blend'
}

export type DecalAtlas = {
  texture: Texture
  entries: Map<string, AtlasEntry>
}

function readEntries(): Map<string, AtlasEntry> {
  const out = new Map<string, AtlasEntry>()
  for (const [url, e] of Object.entries(atlasData.entries)) {
    const [u, v, du, dv] = e.rect
    out.set(url, {
      rect: [u, v, du, dv],
      aspect: e.aspect,
      mode: e.mode === 'blend' ? 'blend' : 'cutout',
    })
  }
  return out
}

function loadAtlas(): Promise<DecalAtlas> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(
      atlasData.url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace
        texture.generateMipmaps = true
        texture.minFilter = LinearMipmapLinearFilter
        texture.magFilter = LinearFilter
        texture.needsUpdate = true
        resolve({ texture, entries: readEntries() })
      },
      undefined,
      () => reject(new Error(`贴花图集加载失败：${atlasData.url}`)),
    )
  })
}

/* ── Suspense 资源 ────────────────────────────────────────── */

let atlasPromise: Promise<DecalAtlas> | null = null
let atlasValue: DecalAtlas | null = null

/**
 * 图集是异步加载的，做成 Suspense 资源交给上层边界兜住。
 * 三个承载面各自一个 InstancedMesh，纹理只有一份。
 *
 * `maxAnisotropy` 由调用方从渲染器能力里取。各向异性过滤在这里设 ——
 * 贴花在自动推近的近景里被斜看（门与画面成 45°），不开会糊；
 * 而纹理是这个 hook 造出来的，改在这里才不算「修改 hook 返回值」。
 */
export function useDecalAtlas(maxAnisotropy = 1): DecalAtlas {
  const want = Math.min(8, Math.max(1, maxAnisotropy))
  if (atlasValue) {
    if (atlasValue.texture.anisotropy !== want) {
      atlasValue.texture.anisotropy = want
      atlasValue.texture.needsUpdate = true
    }
    return atlasValue
  }
  if (!atlasPromise) {
    atlasPromise = loadAtlas().then((a) => {
      a.texture.anisotropy = want
      atlasValue = a
      return a
    })
  }
  throw atlasPromise
}
