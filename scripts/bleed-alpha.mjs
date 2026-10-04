#!/usr/bin/env bun
/**
 * 透明贴图的颜色扩张（alpha bleed / edge padding）。
 * 贴花导出前做一遍颜色扩张与预乘 alpha 检查，消除白边和彩边。
 *
 * 为什么必须做：有损 WebP 在 alpha=0 的区域会把 RGB 编成任意值（实测均值 17–89 的
 * 暗色）。这些像素在 2D 里看不见，但一旦进 3D：
 *   - 生成 mipmap 时暗色被平均进边缘 → 物件周围一圈深色描边
 *   - 双线性插值同理，缩小时尤其明显
 *   - alphaTest 的硬边会直接露出脏色
 * 扩张就是把不透明像素的 RGB 向外推若干圈，让插值取到的是物件自己的颜色。
 * alpha 通道全程不动，所以视觉轮廓不变。
 *
 *   bun run scripts/bleed-alpha.mjs            处理首屏物件目录
 *   bun run scripts/bleed-alpha.mjs --check    只报告，不写文件
 */
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const DIRS = ['public/assets/obj', 'public/assets/obj2']
const CHECK = process.argv.includes('--check')
/** 向外推的圈数：够覆盖到最小 mip 级别取样即可，太多只是白白增大文件 */
const ROUNDS = 12
/**
 * alpha 低于这个值的像素，其 RGB **不可信**，需要被邻居的颜色替换。
 *
 * 一开始取 8（「几乎全透明」），但实测这个值不够：
 * 有损 WebP 在 alpha 9–40 的极淡抗锯齿边上几乎不分配码率，
 * 那一圈里 31%–36% 的像素 RGB 是近黑的垃圾值（stk5 36%、stk1 31%）。
 * 它们 alpha>8，会被当成「可信来源」，于是把黑色一路扩张出去 ——
 * 扩张带里 17% 的像素反而变成了黑的，等于这一步帮了倒忙。
 * alpha≥41 之后 RGB 就干净了（均值 230–250，是贴纸的白描边），
 * 所以门槛提到 48：既盖住不可信区间，又不动真正参与混合的软边。
 *
 * 这些像素只有 3%–19% 的不透明度，改掉它们的 RGB 在画面上表现为
 * 「边缘那一圈脏暗消失」，正是 §6.3 要的「消除白边和彩边」。
 */
const CUTOFF = 48

/**
 * 已经由 scripts/assets/pack-decals.mjs 自己做过边缘挤出的产物，跳过。
 * 图集是拼出来的，整张一起扩张会把颜色推过格子之间的空隙；
 * 而且每跑一次哈希就变一次，资源清单要跟着改。
 */
const SKIP = new Set(['doorDecals.webp'])

/**
 * 判定「这张已经是最终态」的两个条件，都满足就不回写。
 *
 * 每写一次就多一代有损重编码，而扩张本身每轮都会把整条带重新取一次平均，
 * 有损量化让结果永远差个 ±5–20，用「像素有没有变」当判据会导致脚本
 * 每跑一次都改一遍文件、每次都要重新同步清单哈希。
 *
 * 真正要修的问题只有两个（见文件头）：扩张带里残留近黑的垃圾值，
 * 以及 alpha 恰为 0 导致颜色被编码器抹掉。两个都不存在就说明已经修好了。
 */
const DARK_SUM = 30

/**
 * 把可信像素的 RGB 逐圈向透明区域推开。
 * 返回被推到的像素掩码，调用方要用它把 alpha=0 提到 1（见 KEEP_ALPHA 说明）。
 */
function bleed(rgba, w, h, rounds) {
  const known = new Uint8Array(w * h)
  const touched = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) known[i] = rgba[i * 4 + 3] > CUTOFF ? 1 : 0

  for (let r = 0; r < rounds; r++) {
    const next = known.slice()
    const writes = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (known[i]) continue
        let sr = 0, sg = 0, sb = 0, n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            if (nx < 0 || nx >= w) continue
            const j = ny * w + nx
            if (!known[j]) continue
            sr += rgba[j * 4]; sg += rgba[j * 4 + 1]; sb += rgba[j * 4 + 2]; n++
          }
        }
        if (n) {
          writes.push([i, (sr / n) | 0, (sg / n) | 0, (sb / n) | 0])
          next[i] = 1
          touched[i] = 1
        }
      }
    }
    if (!writes.length) break
    // 一轮内统一写回，避免同轮内已填的像素又被当作来源，产生方向性拖影
    for (const [i, cr, cg, cb] of writes) {
      rgba[i * 4] = cr; rgba[i * 4 + 1] = cg; rgba[i * 4 + 2] = cb
    }
    known.set(next)
  }
  return touched
}

/**
 * libwebp 会把「整块 alpha 全为 0」的区域的 RGB 直接抹掉换压缩率
 * （WebPCleanupTransparentArea），而且 sharp 没有暴露 `-exact` 开关。
 * 实测 posterwall 有 16.8% 的扩张带在编码后又变回黑色。
 *
 * 解决办法：把扩张带里 alpha 恰为 0 的像素提到 1。
 * 这样它们不再属于「全透明块」，颜色被完整保留；
 * 而 1/255 = 0.4% 的不透明度在混合下不可见，任何 alphaTest 也都会把它丢掉，
 * 所以轮廓和外观完全不变。实测扩张带的黑像素从 16.8% 降到 0%，代价 +2KiB。
 */
function keepBleedAlive(rgba, touched) {
  let lifted = 0
  for (let i = 0; i < touched.length; i++) {
    if (touched[i] && rgba[i * 4 + 3] === 0) {
      rgba[i * 4 + 3] = 1
      lifted++
    }
  }
  return lifted
}

let processed = 0
let before = 0
let after = 0

for (const dir of DIRS) {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) continue
  for (const name of readdirSync(abs).filter((f) => f.endsWith('.webp') && !SKIP.has(f))) {
    const file = join(abs, name)
    const b0 = statSync(file).size
    const img = sharp(file).ensureAlpha()
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    const { width, height } = info

    // 处理前：不可信区（alpha ≤ CUTOFF）的 RGB 均值，用来判断是否已经扩张过
    let ghostSum = 0, ghostN = 0
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] <= CUTOFF) {
        ghostSum += data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]
        ghostN += 3
      }
    }
    const ghostBefore = ghostN ? ghostSum / ghostN : 0

    const before0 = Uint8Array.prototype.slice.call(data)
    const touched = bleed(data, width, height, ROUNDS)

    // 扩张带里原来有多少近黑的垃圾值
    let darkBefore = 0
    for (let i = 0; i < touched.length; i++) {
      if (!touched[i]) continue
      if (before0[i * 4] + before0[i * 4 + 1] + before0[i * 4 + 2] < DARK_SUM) darkBefore++
    }
    const lifted = keepBleedAlive(data, touched)
    const unchanged = darkBefore === 0 && lifted === 0

    let gs = 0, gn = 0
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] <= CUTOFF) {
        gs += data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]
        gn += 3
      }
    }
    const ghostAfter = gn ? gs / gn : 0

    if (!CHECK && !unchanged) {
      await sharp(data, { raw: { width, height, channels: 4 } })
        // alphaQuality 100：alpha 通道走无损，轮廓不能有任何漂移
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toFile(file + '.tmp')
      const { renameSync } = await import('node:fs')
      renameSync(file + '.tmp', file)
    }
    const b1 = CHECK || unchanged ? b0 : statSync(file).size
    before += b0
    after += b1
    processed++
    console.log(
      `  ${name.padEnd(18)} 扩张带 RGB ${ghostBefore.toFixed(0).padStart(3)} → ${ghostAfter.toFixed(0).padStart(3)}   ` +
        `保活 ${String(lifted).padStart(6)} px   ` +
        (unchanged
          ? '已是最终态，跳过回写'
          : `黑像素 ${darkBefore}   ${(b0 / 1024).toFixed(0)}K → ${(b1 / 1024).toFixed(0)}K`),
    )
  }
}

console.log(
  `\n${CHECK ? '（仅检查）' : ''}处理 ${processed} 张，合计 ${(before / 1024).toFixed(0)}KiB → ${(after / 1024).toFixed(0)}KiB`,
)
