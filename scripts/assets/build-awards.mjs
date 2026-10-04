#!/usr/bin/env node
/* ============================================================================
 * AWARDS 奖状图构建
 *
 * 把桌面的 10 张奖状原图处理成 public/assets/awards/ 下的 webp 响应式变体，
 * 并为深度画廊提取每张图「专属」的氛围色（参考 codrops depth-gallery：
 * 每张图决定自己的背景色板），生成 src/data/awards.generated.ts。
 *
 * 用法：
 *   node scripts/assets/build-awards.mjs [原图目录]
 * ========================================================================== */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const srcDir = process.argv[2] ?? 'c:/Users/wwimf/Desktop/奖状'
const outDir = join(root, 'public', 'assets', 'awards')
const dataFile = join(root, 'src', 'data', 'awards.generated.ts')

/* 顺序即画廊顺序 —— 与上传清单一一对应 */
const FILES = [
  '3bb1b70c6288d5ca70bed0829cd21cf0.jpg', // 01 大广赛16届 优秀奖
  '6ced34f6844c198834d044dd133fcf18.jpg', // 02 荣誉证书 三等奖
  '11a755c0351293688cf8eaf0a116f5d3.jpg', // 03 国际创意营销 优胜奖
  '71.png', // 04 聘书 美编部负责人
  '78e490d479b6b4b917fb5c53b37e1df9.jpg', // 05 聘书
  '93ae9cdda4b1947d9c8bb96d21ba30af.jpg', // 06 大广赛17届 优秀奖
  '3027fd373bb1ac943427c6e13f9ed81a.jpg', // 07 优秀部门负责人
  'c46126a1070bd33bced20394524ce4c0.jpg', // 08 大广赛17届 三等奖
  'f55c83d278c4249b9958b5723a6867f7.jpg', // 09 优秀负责人
  'prize.png', // 10 大广赛18届 二等奖
  'prize_1.png', // 11
  'prize_2.png', // 12
  'prize_3.png', // 13
]

/* 画廊主图最长边（CSS 最高约 62vh，2x 足够） */
const FULL = 1200
const VARIANTS = [480, 800]

const PAPER = { r: 247, g: 243, b: 236 } // #f7f3ec，站点米色，背景色往它靠
const FALLBACK_ACCENT = { r: 176, g: 106, b: 68 } // 赭石

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n)))
const hex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')

function mix(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

/** rgb 转简易 hsv */
function rgb2hsv(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

/**
 * 提取一张奖状的氛围色板。
 * - bg：重度模糊后的整图均值（边缘/留白主导），再掺 62% 米色保证淡雅
 * - accent：饱和度最高的一批像素均值（红绸/金边框/蓝银奖）
 * - blob2：accent 与 bg 的中间色
 */
async function palette(path) {
  const stats = await sharp(path)
    .rotate()
    .resize(72, 72, { fit: 'fill' })
    .blur(14)
    .raw()
    .stats()
  const m = stats.channels
  const raw = { r: m[0].mean, g: m[1].mean, b: m[2].mean }
  // 自适应提亮：原图均值越暗（灰底证书），往米色靠得越多，保证背景始终淡雅
  const lum = (0.2126 * raw.r + 0.7152 * raw.g + 0.0722 * raw.b) / 255
  const t = 0.6 + (1 - Math.max(lum, 0.62)) * 1.05
  let bg = mix(raw, PAPER, Math.min(t, 0.9))

  const { data, info } = await sharp(path)
    .rotate()
    .resize(180, 180, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const hits = []
  for (let i = 0; i < data.length; i += ch) {
    const { s, v } = rgb2hsv(data[i], data[i + 1], data[i + 2])
    if (s > 0.28 && v > 0.22 && v < 0.96) hits.push({ r: data[i], g: data[i + 1], b: data[i + 2], w: s })
  }
  let accent = FALLBACK_ACCENT
  if (hits.length >= 40) {
    hits.sort((a, b) => b.w - a.w)
    const top = hits.slice(0, Math.min(hits.length, 220))
    const n = top.length
    const sum = top.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), {
      r: 0,
      g: 0,
      b: 0,
    })
    // 提一点亮、降一点饱和，避免色块发脏
    accent = mix({ r: sum.r / n, g: sum.g / n, b: sum.b / n }, PAPER, 0.18)
  }
  return { bg: hex(bg), blob1: hex(accent), blob2: hex(mix(accent, bg, 0.55)) }
}

mkdirSync(outDir, { recursive: true })
const entries = []

for (let i = 0; i < FILES.length; i++) {
  const id = `award-${String(i + 1).padStart(2, '0')}`
  const src = join(srcDir, FILES[i])
  readFileSync(src) // 不存在直接抛错

  /* 全量与变体：统一按长边 inside 缩放 */
  const make = (w) =>
    sharp(src)
      .rotate()
      .resize(w, w, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
  await make(FULL).toFile(join(outDir, `${id}.webp`))
  for (const w of VARIANTS) {
    await make(w).toFile(join(outDir, `${id}-${w}.webp`))
  }

  const colors = await palette(src)
  const outMeta = await sharp(join(outDir, `${id}.webp`)).metadata()
  entries.push({ id, w: outMeta.width, h: outMeta.height, ...colors })
  console.log(id, `${outMeta.width}x${outMeta.height}`, colors.bg, colors.blob1, colors.blob2)
}

const ts = `/* eslint-disable */
// 由 scripts/assets/build-awards.mjs 生成，请勿手改。
// 每张奖状的展示尺寸与专属氛围色（深度画廊背景按此交叉渐变）。
export const AWARDS = ${JSON.stringify(entries, null, 2)} as const

export type AwardImage = (typeof AWARDS)[number]
`
writeFileSync(dataFile, ts)
console.log(`\n${entries.length} 张 → ${outDir.replace(root + '/', '')}`)
console.log(`数据 → ${dataFile.replace(root + '\\', '')}`)
