#!/usr/bin/env bun
/**
 * 柜门贴花图集（整改方案 §6.3「照片、贴纸和纸张合并到 1–2 张 decal atlas」、
 * §12.1「首屏 draw calls 不超过 35」）。
 *
 * ── 为什么在构建期出图，而不是运行时用 canvas 拼 ──────────────
 * 运行时 canvas 拼图集有两个绕不过去的问题：
 *
 *   1. **canvas 2D 的位图是预乘存储的**。alpha=0 的像素预乘后 RGB 恒为 0，
 *      再读出来只能是黑的。提交 11a/11c 花了两轮把每张贴图透明区的 RGB
 *      扩张成物件本色，走一趟 canvas 就全部变回黑色 ——
 *      生成 mipmap 时黑色被平均进边缘，每张贴花周围一圈深色描边，
 *      正是 §6.3 要消除的「白边和彩边」。
 *   2. **每块只能按统一格子缩放**。小贴纸被放大、大照片被缩小，
 *      分辨率既浪费又不够：工牌是自动推近的终点近景（275×360 屏幕像素，
 *      DPR1.75 下需要 481×630），塞进 384 的格子只剩 217×384，肉眼可见发糊。
 *
 * 构建期打包两个问题都不存在：像素原样搬运（含扩张带），
 * 每块的目标分辨率按它在最近的那一帧上的实际占屏单独定。
 *
 * ── 每块分辨率是怎么定的 ────────────────────────────────────
 * 从参考帧量「一扇门在屏幕上有多宽」，乘 DPR 上限 1.75（HeroSceneCanvas 的
 * dpr={[1, 1.75]}），再乘 decalSpecs 里那张贴花占门宽的比例，
 * 就是它需要的设备像素宽度：
 *   · 门 2 内侧（自动推近终点）：门面横跨 x 225–890，约 665 屏幕像素
 *     → 665 × 1.75 ≈ 1164 设备像素/门宽
 *   · 门 1 / 门 4 外表面（全程关着，最近就是落位帧的尺度）：
 *     门面约 205 屏幕像素 → 359 设备像素/门宽，这里再留 1.6× 余量
 * 算出来比源图小的才缩，比源图大的一律保持原分辨率 —— 放大不产生信息。
 *
 * ── 边距 ────────────────────────────────────────────────────
 * 每块四周留 PAD 像素，把边缘像素的 RGB 向外挤出，详见 PAD 的注释。
 *
 * ── 与场景层的关系 ──────────────────────────────────────────
 * **哪些贴花存在**由 src/scene/decalSpecs.ts 说了算，这里只决定它们在图集里的位置。
 * 打包前会核对两边的 URL 名单，不一致直接失败，避免「两处真相」漂移到运行时才发现。
 *
 *   bun run scripts/assets/pack-decals.mjs           打包并写出图集与 UV 表
 *   bun run scripts/assets/pack-decals.mjs --dry     只算占用率，不写文件
 *   bun run scripts/assets/pack-decals.mjs --check   校验磁盘产物是否与源图一致（门禁用）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

sharp.cache(false)

// Windows 下 URL.pathname 会多出前导斜杠（/D:/...），必须走 fileURLToPath
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '')
const DRY = process.argv.includes('--dry')
/** --check：只校验磁盘上的图集与 UV 表是不是当前源图与配置的产物，不写文件 */
const CHECK = process.argv.includes('--check')

/**
 * 每块四周的透明边距（像素）。
 *
 * 相邻两块之间的空隙是 **2×PAD**（各出一半），第 k 级 mip 的一个纹素覆盖
 * 原图 2^k 个纹素，双线性还要多取 1 个纹素，所以「邻块内容不会渗进来」的
 * 最深级别是 log2(2×PAD) − 1 = log2(PAD)。PAD=16 → 保到第 5 级。
 *
 * 实际最深会用到第几级：这批贴花里被缩得最狠的是关着的门 1 / 门 4 上的海报，
 * 图集里 322 纹素宽，在 reveal 刚结束的小柜体（约 20vw，门宽 ≈40 屏幕像素）
 * 上只有 22 设备像素 → 322/22 ≈ 14.6 → 第 3.9 级。**第 5 级还有 1 级余量。**
 *
 * 试过 PAD=24：装箱反而从 1.66M 像素劣化到 1.93M（这批矩形高矮悬殊，
 * 边距一大就更难拼），换来的是用不上的第 6 级保护，不划算。
 */
const PAD = 16
/** 画布宽度候选（32 的倍数）；高度由装箱结果决定，向上取到 4 的倍数 */
const WIDTHS = [512, 640, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048]

const OUT = 'public/assets/obj2/doorDecals.webp'
const JSON_OUT = 'scripts/assets/decal-atlas.json'

/**
 * 图集成员，与 src/scene/decalSpecs.ts 的 DECAL_URLS 一一对应。
 * `maxW` 是这块在图集里的最大宽度（设备像素），推算见文件头；
 * 源图比它小就保持原样。
 */
const MEMBERS = [
  // ── 门 2 内侧：自动推近的终点，分辨率要求最高 ──
  { url: '/assets/obj/idcard2.webp', maxW: 481, why: '近景 275px × 1.75' },
  { url: '/assets/obj/tapes.webp', maxW: 304, why: '门宽 0.26' },
  // 9 张白边工具贴纸（build-toolstickers.mjs 产物，方形 512 源）
  { url: '/assets/obj2/tool-ai.webp', maxW: 175, why: '门宽 0.15' },
  { url: '/assets/obj2/tool-canva.webp', maxW: 291, why: '门宽 0.25' },
  { url: '/assets/obj2/tool-cursor.webp', maxW: 198, why: '门宽 0.17' },
  { url: '/assets/obj2/tool-figma.webp', maxW: 163, why: '门宽 0.14' },
  { url: '/assets/obj2/tool-gpt.webp', maxW: 233, why: '门宽 0.20' },
  { url: '/assets/obj2/tool-jianying.webp', maxW: 151, why: '门宽 0.13' },
  { url: '/assets/obj2/tool-jimeng.webp', maxW: 210, why: '门宽 0.18' },
  { url: '/assets/obj2/tool-pr.webp', maxW: 128, why: '门宽 0.11' },
  { url: '/assets/obj2/tool-ps.webp', maxW: 198, why: '门宽 0.17' },
  { url: '/assets/obj2/stk6.webp', maxW: 244, why: '门宽 0.21' },
  { url: '/assets/obj2/stk7.webp', maxW: 279, why: '门宽 0.24' },
  { url: '/assets/obj2/stk8.webp', maxW: 268, why: '门宽 0.23' },
  { url: '/assets/obj2/stk9.webp', maxW: 151, why: '门宽 0.13' },
  // 提交 11f 新增的两张文字贴纸，等场景层在 decalSpecs 里排位后才会出现在门上
  { url: '/assets/obj2/stk10.webp', maxW: 233, why: '门宽 0.20（待场景层排位）' },
  { url: '/assets/obj2/stk11.webp', maxW: 198, why: '门宽 0.17（待场景层排位）' },
  // ── 门 1 / 门 4 外表面：全程关着，只在落位帧的尺度上出现 ──
  { url: '/assets/obj/posterwall.webp', maxW: 322, why: '门宽 0.56 × 1.6 余量' },
  { url: '/assets/obj/trayA.webp', maxW: 230, why: '门宽 0.40 × 1.6 余量' },
  { url: '/assets/obj/trayB.webp', maxW: 230, why: '门宽 0.40 × 1.6 余量' },
  { url: '/assets/obj2/polaroids.webp', maxW: 379, why: '门宽 0.66 × 1.6 余量' },
]

/** texture-report.mjs 判定必须走混合的块；其余全部 cutout */
const BLEND_URLS = new Set(['/assets/obj/tapes.webp'])

/**
 * 与场景层对账：**哪些贴花存在**由 src/scene/decalSpecs.ts 说了算，
 * 这里只负责它们**在图集里的位置**。两边各维护一份名单就会漂移，
 * 而且是运行时才看得出来的错位，所以打包前先核对，不一致直接失败。
 * （资源层在 imageSources.ts / assetManifest.ts 上踩过同一个坑。）
 */
const SPECS_FILE = 'src/scene/decalSpecs.ts'

function reconcileWithScene() {
  let src
  try {
    src = readFileSync(join(ROOT, SPECS_FILE), 'utf8')
  } catch {
    console.warn(`  ! 读不到 ${SPECS_FILE}，跳过对账`)
    return
  }
  const inScene = new Set([...src.matchAll(/url:\s*'(\/assets\/[^']+)'/g)].map((m) => m[1]))
  const inAtlas = new Set(MEMBERS.map((m) => m.url))
  const missing = [...inScene].filter((u) => !inAtlas.has(u))
  const extra = [...inAtlas].filter((u) => !inScene.has(u))
  /*
   * 两个方向不对称：
   *   · 场景层用到、图集里没有 —— 运行时直接取不到 UV，是**硬错误**。
   *   · 图集里有、场景层还没用 —— 素材层先把资源备好、等场景层排位，
   *     是正常的交接中间态，只警告。
   */
  if (missing.length) {
    for (const u of missing) console.error(`  ✗ ${SPECS_FILE} 用到但图集里没有：${u}`)
    console.error(
      `\n改完 ${SPECS_FILE} 之后要同步 MEMBERS 并重打图集：\n` +
        '  bun run scripts/assets/pack-decals.mjs',
    )
    process.exit(1)
  }
  for (const u of extra) console.log(`  ! 图集已备好但 ${SPECS_FILE} 尚未排位：${u}`)
  console.log(`  · 与 ${SPECS_FILE} 对账：${inScene.size} 张已排位，${extra.length} 张待排位`)
}

reconcileWithScene()

/**
 * MaxRects 装箱（best-short-side-fit）。
 * 货架法在这批「高矮悬殊的竖长条」上只能到 50% 占用率，
 * 多出来的像素会实打实变成 GPU 显存，所以这里用真正的装箱。
 */
function maxRects(boxes, W, H) {
  const free = [{ x: 0, y: 0, w: W, h: H }]
  const placed = []
  const todo = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h)

  while (todo.length) {
    let best = null
    for (let i = 0; i < todo.length; i++) {
      const b = todo[i]
      for (const f of free) {
        if (b.w > f.w || b.h > f.h) continue
        const shortSide = Math.min(f.w - b.w, f.h - b.h)
        const longSide = Math.max(f.w - b.w, f.h - b.h)
        if (
          !best ||
          shortSide < best.shortSide ||
          (shortSide === best.shortSide && longSide < best.longSide)
        ) {
          best = { i, x: f.x, y: f.y, shortSide, longSide }
        }
      }
    }
    if (!best) return null
    const b = todo.splice(best.i, 1)[0]
    const rect = { x: best.x, y: best.y, w: b.w, h: b.h }
    placed.push({ ...b, x: rect.x, y: rect.y })

    // 切开所有与新矩形相交的空闲区
    const next = []
    for (const f of free) {
      if (
        rect.x >= f.x + f.w ||
        rect.x + rect.w <= f.x ||
        rect.y >= f.y + f.h ||
        rect.y + rect.h <= f.y
      ) {
        next.push(f)
        continue
      }
      if (rect.x > f.x) next.push({ x: f.x, y: f.y, w: rect.x - f.x, h: f.h })
      if (rect.x + rect.w < f.x + f.w)
        next.push({ x: rect.x + rect.w, y: f.y, w: f.x + f.w - (rect.x + rect.w), h: f.h })
      if (rect.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: rect.y - f.y })
      if (rect.y + rect.h < f.y + f.h)
        next.push({ x: f.x, y: rect.y + rect.h, w: f.w, h: f.y + f.h - (rect.y + rect.h) })
    }
    // 丢掉被其它空闲区完全包含的
    free.length = 0
    for (let i = 0; i < next.length; i++) {
      const a = next[i]
      if (a.w <= 0 || a.h <= 0) continue
      let contained = false
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue
        const c = next[j]
        if (a.x >= c.x && a.y >= c.y && a.x + a.w <= c.x + c.w && a.y + a.h <= c.y + c.h) {
          if (a.w === c.w && a.h === c.h && j > i) continue
          contained = true
          break
        }
      }
      if (!contained) free.push(a)
    }
  }
  return placed
}

/**
 * 在候选宽度上各二分一次高度，取总像素最少的方案。
 * 长宽比限制在 2.5 以内：像 768×2512 这种细长图集虽然面积也不大，
 * 但 mip 链一路降到 1×N 才结束，白白多出好几级几乎用不到的层。
 */
const MAX_ASPECT = 2.5

function bestBin(boxes) {
  const area = boxes.reduce((n, b) => n + b.w * b.h, 0)
  const maxW = Math.max(...boxes.map((b) => b.w))
  const maxH = Math.max(...boxes.map((b) => b.h))
  let best = null
  for (const W of WIDTHS) {
    if (W < maxW) continue
    let lo = maxH
    let hi = Math.max(maxH, Math.ceil((area * 2) / W))
    let found = null
    while (lo <= hi) {
      const mid = Math.ceil((lo + hi) / 2 / 4) * 4
      const p = maxRects(boxes, W, mid)
      if (p) {
        found = { W, H: mid, placed: p }
        hi = mid - 4
      } else {
        lo = mid + 4
      }
    }
    if (!found) continue
    const aspect = Math.max(found.W / found.H, found.H / found.W)
    if (aspect > MAX_ASPECT) continue
    if (!best || found.W * found.H < best.W * best.H) best = found
  }
  return best
}

/** 把一块 RGBA 贴进画布，并把边缘 RGB 向外挤出 PAD 圈 */
function blit(canvas, CW, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const s = (y * sw + x) * 4
      const d = ((oy + y) * CW + ox + x) * 4
      canvas[d] = src[s]
      canvas[d + 1] = src[s + 1]
      canvas[d + 2] = src[s + 2]
      canvas[d + 3] = src[s + 3]
    }
  }
  /*
   * padding 里的每个像素取源图中最近的那个像素的 RGB。
   * alpha 给 1 而不是 0：libwebp 会把「整块 alpha 全 0」的区域 RGB 清零
   * 换压缩率（sharp 没暴露 -exact），刚挤出去的颜色会被它当场丢掉。
   * 1/255 = 0.4% 的不透明度在混合下不可见，alphaTest 也会丢掉它。
   * 理由和 scripts/bleed-alpha.mjs 的 keepBleedAlive 完全一致。
   */
  for (let y = -PAD; y < sh + PAD; y++) {
    for (let x = -PAD; x < sw + PAD; x++) {
      if (y >= 0 && y < sh && x >= 0 && x < sw) continue
      const cx = Math.min(sw - 1, Math.max(0, x))
      const cy = Math.min(sh - 1, Math.max(0, y))
      const s = (cy * sw + cx) * 4
      const d = ((oy + y) * CW + ox + x) * 4
      canvas[d] = src[s]
      canvas[d + 1] = src[s + 1]
      canvas[d + 2] = src[s + 2]
      canvas[d + 3] = 1
    }
  }
}

/* ── 读源图并按目标分辨率缩放 ─────────────────────────────── */

const boxes = []
for (const m of MEMBERS) {
  const p = join(ROOT, 'public', m.url.replace(/^\//, ''))
  const meta = await sharp(p).metadata()
  const scale = Math.min(1, m.maxW / meta.width)
  const tw = Math.max(1, Math.round(meta.width * scale))
  const th = Math.max(1, Math.round(meta.height * scale))
  const pipe = sharp(p).ensureAlpha()
  if (scale < 1) pipe.resize(tw, th, { kernel: 'lanczos3', fit: 'fill' })
  const { data, info } = await pipe.raw().toBuffer({ resolveWithObject: true })
  boxes.push({
    url: m.url,
    why: m.why,
    data,
    srcW: meta.width,
    srcH: meta.height,
    sw: info.width,
    sh: info.height,
    w: info.width + PAD * 2,
    h: info.height + PAD * 2,
  })
}

const chosen = bestBin(boxes)
if (!chosen) {
  console.error('候选画布都塞不下')
  process.exit(1)
}
const { W, H, placed } = chosen
const used = boxes.reduce((n, b) => n + b.sw * b.sh, 0)
const srcPx = boxes.reduce((n, b) => n + b.srcW * b.srcH, 0)
const mib = (px) => ((px * 4 * 4) / 3 / 1048576).toFixed(1)

console.log(
  `图集 ${W}×${H}  ${placed.length} 块  有效像素占用 ${((used / (W * H)) * 100).toFixed(0)}%\n` +
    `源图合计 ${(srcPx / 1e6).toFixed(2)}M 像素 → 缩放后 ${(used / 1e6).toFixed(2)}M → 图集 ${((W * H) / 1e6).toFixed(2)}M\n` +
    `GPU（RGBA8 + mipmap）：15 张独立贴图 ${mib(srcPx)}MiB → 一张图集 ${mib(W * H)}MiB\n`,
)

const canvas = new Uint8Array(W * H * 4)
const entries = {}
for (const b of placed.sort((a, z) => a.url.localeCompare(z.url))) {
  const ox = b.x + PAD
  const oy = b.y + PAD
  blit(canvas, W, b.data, b.sw, b.sh, ox, oy)
  entries[b.url] = {
    // 与 src/scene/decalAtlas.ts 的 AtlasEntry 同形：[u0, v0, du, dv]，v 轴已翻
    rect: [ox / W, 1 - (oy + b.sh) / H, b.sw / W, b.sh / H],
    aspect: +(b.sw / b.sh).toFixed(6),
    /** 透明处理方式，来自 scripts/assets/texture-report.mjs 的判定 */
    mode: BLEND_URLS.has(b.url) ? 'blend' : 'cutout',
    px: [ox, oy, b.sw, b.sh],
    source: [b.srcW, b.srcH],
  }
  const tag = b.sw < b.srcW ? `缩 ${((b.sw / b.srcW) * 100).toFixed(0)}%` : '原分辨率'
  console.log(
    `  ${b.url.replace('/assets/', '').padEnd(20)} ${String(b.srcW).padStart(4)}×${String(b.srcH).padEnd(4)} → ` +
      `${String(b.sw).padStart(4)}×${String(b.sh).padEnd(4)} @ (${String(ox).padStart(4)},${String(oy).padStart(4)})  ${tag.padEnd(9)}${b.why}`,
  )
}

if (DRY) process.exit(0)

const outPath = join(ROOT, OUT)
// 先编码到内存：--check 只比对，不能改动磁盘上的产物
const encoded = await sharp(Buffer.from(canvas), { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toBuffer()

const bytes = encoded.length
const version = createHash('sha256').update(encoded).digest('hex').slice(0, 8)

const payload =
  JSON.stringify(
    {
      // 由 scripts/assets/pack-decals.mjs 生成，不要手改
      url: '/' + OUT.replace(/^public\//, ''),
      width: W,
      height: H,
      bytes,
      version,
      pad: PAD,
      entries,
    },
    null,
    2,
  ) + '\n'

if (CHECK) {
  const onDisk = createHash('sha256').update(readFileSync(outPath)).digest('hex').slice(0, 8)
  const prev = readFileSync(join(ROOT, JSON_OUT), 'utf8')
  if (onDisk !== version) {
    console.error(`  ✗ ${OUT} 与源图不一致（磁盘 ${onDisk} / 应为 ${version}），需要重打`)
    process.exit(1)
  }
  if (prev !== payload) {
    console.error(`  ✗ ${JSON_OUT} 与源图/配置不一致，需要重打：bun run scripts/assets/pack-decals.mjs`)
    process.exit(1)
  }
  console.log('  · 图集与 UV 表是当前源图的产物，一致')
  process.exit(0)
}

writeFileSync(outPath, encoded)
writeFileSync(join(ROOT, JSON_OUT), payload)

console.log(`\n→ ${OUT}  ${(bytes / 1024).toFixed(0)}KiB  v=${version}`)
console.log(`→ ${JSON_OUT}（UV 表，与 decalAtlas.ts 的 AtlasEntry 同形）`)
