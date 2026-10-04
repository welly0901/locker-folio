#!/usr/bin/env bun
/**
 * 门内侧缺的两张**文字贴纸**（整改方案 §6.5「柜门内侧的个人贴纸集合」）。
 *
 * ── 差在哪 ──────────────────────────────────────────────────
 * 参考里门 2 内侧那面门上约 18 张贴纸，
 * 仓库里只有 9 张，而且**全是人物 / 动物 / 图形**，一张文字贴纸都没有。
 * 参考里贴在门顶、正好框住工牌的那两张恰恰是文字贴纸：
 * 左边黄底黑字的 `JUST ANOTHER DAY`、右边红黑涂鸦体的 `NOWADAYS`。
 * 它们在自动推近的终点、也就是整段开场的收尾画面里占了上半屏，
 * 缺了这两张，那一帧的上半部分是空的。
 *
 * ── 为什么用 SVG 画而不是 image_gen ─────────────────────────
 * 1. 参考里这两张本来就是**印刷体贴纸**，比旁边的人物贴纸平、边缘更硬，
 *    不是软塑立体件。画成矢量反而更贴参考。
 * 2. 文字必须准确。生成模型在小字上不可靠，而这两张的全部信息就是那几个字。
 * 3. 风格靠三件事和其余 9 张对齐，而不是靠"看起来像"：
 *    · 同样的白色模切描边（现有 9 张每张都有一圈 8–10px 白边）
 *    · 左上 45° 主光 —— 底色用自左上向右下的浅→深渐变
 *    · **不加柔和投影**。用 texture-report 量过现有 9 张：
 *      半透明像素只有 1.8%–3.1%，全部集中在 1–2px 的抗锯齿边上，
 *      内部半透明是 0.00%–0.04%，也就是**一张都没有柔和投影**。
 *      第一版加了 feDropShadow，量出来内部半透明 5.8%–8.2%、判定成 blend，
 *      正是「引入风格不一致的资产」。阴影交给 3D 里的实时投影（§6.4）。
 *    · 低饱和粉彩取色，不用纯饱和色
 *
 *   bun run scripts/assets/build-textstickers.mjs
 */
import { join } from 'node:path'
import sharp from 'sharp'

sharp.cache(false)

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

/** 白色模切描边宽度，量自现有 9 张贴纸 */
const DIE_CUT = 11
const LATIN = 'Helvetica Neue, Helvetica, Arial, sans-serif'

/**
 * 尺寸按 decalSpecs 的门宽比例反推（门 2 内侧在近景终点是 1164 设备像素/门宽）：
 * `JUST ANOTHER DAY` 参考占门宽约 0.20 → 233px；`NOWADAYS` 约 0.17 → 198px。
 * 这里各留一点余量，和现有贴纸的分辨率量级（150–300px）一致。
 */
const STICKERS = [
  {
    out: 'public/assets/obj2/stk10.webp',
    w: 260,
    h: 132,
    /** 黄底黑字的方牌，参考里带一颗小红星 */
    svg: (w, h) => `
      <defs>
        <linearGradient id="face" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stop-color="#FBE08A"/>
          <stop offset="1" stop-color="#F2C64E"/>
        </linearGradient>
      </defs>
      <g transform="rotate(-3 ${w / 2} ${h / 2})">
        <rect x="${DIE_CUT}" y="${DIE_CUT + 6}" width="${w - DIE_CUT * 2}" height="${h - DIE_CUT * 2 - 12}"
              rx="7" fill="#FFFFFF"/>
        <rect x="${DIE_CUT + 6}" y="${DIE_CUT + 12}" width="${w - DIE_CUT * 2 - 12}" height="${h - DIE_CUT * 2 - 24}"
              rx="4" fill="url(#face)"/>
        <text x="${w / 2 + 12}" y="${h / 2 - 6}" text-anchor="middle" font-family="${LATIN}"
              font-weight="700" font-size="27" letter-spacing="0.5" fill="#22201B">JUST</text>
        <text x="${w / 2}" y="${h / 2 + 26}" text-anchor="middle" font-family="${LATIN}"
              font-weight="700" font-size="27" letter-spacing="0.5" fill="#22201B">ANOTHER DAY</text>
        <path d="M ${w * 0.155} ${h * 0.35} l 4.5 -12 l 4.5 12 l 12 4 l -12 4 l -4.5 12 l -4.5 -12 l -12 -4 z"
              fill="#D9503C"/>
      </g>`,
  },
  {
    out: 'public/assets/obj2/stk11.webp',
    w: 250,
    h: 214,
    /**
     * 红黑涂鸦体的两行标牌。
     * 参考里这张在门上是 45×40 屏幕像素，接近正方（宽高比 1.13），
     * 不是横条 —— decalSpecs 只给宽度、高度按贴图比例算，
     * 比例错了在门上就会矮一截，所以这里做成 250×214（1.17）。
     */
    svg: (w, h) => `
      <defs>
        <linearGradient id="face2" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stop-color="#E1614A"/>
          <stop offset="1" stop-color="#C4402C"/>
        </linearGradient>
      </defs>
      <g transform="rotate(4 ${w / 2} ${h / 2})">
        <path d="M ${DIE_CUT} ${h * 0.26} L ${w * 0.50} ${DIE_CUT} L ${w - DIE_CUT} ${h * 0.20}
                 L ${w - DIE_CUT - 4} ${h - DIE_CUT - 6} L ${w * 0.44} ${h - DIE_CUT}
                 L ${DIE_CUT + 4} ${h - DIE_CUT - 14} Z" fill="#FFFFFF"/>
        <path d="M ${DIE_CUT + 9} ${h * 0.30} L ${w * 0.50} ${DIE_CUT + 10} L ${w - DIE_CUT - 9} ${h * 0.245}
                 L ${w - DIE_CUT - 13} ${h - DIE_CUT - 16} L ${w * 0.44} ${h - DIE_CUT - 10}
                 L ${DIE_CUT + 14} ${h - DIE_CUT - 24} Z" fill="url(#face2)"/>
        <text x="${w / 2}" y="${h * 0.42}" text-anchor="middle" font-family="${LATIN}"
              font-weight="700" font-size="26" letter-spacing="5" fill="#FFE3D6"
              transform="rotate(-3 ${w / 2} ${h * 0.42})">RIGHT</text>
        <text x="${w / 2}" y="${h * 0.68}" text-anchor="middle" font-family="${LATIN}"
              font-weight="700" font-size="30" letter-spacing="0" fill="#231A18"
              stroke="#FFF3EC" stroke-width="4" stroke-linejoin="round" paint-order="stroke"
              transform="rotate(-3 ${w / 2} ${h * 0.68})">NOWADAYS</text>
        <text x="${w / 2}" y="${h * 0.87}" text-anchor="middle" font-family="${LATIN}"
              font-weight="700" font-size="17" letter-spacing="7" fill="#FFD9C9"
              transform="rotate(-3 ${w / 2} ${h * 0.87})">2 0 2 6</text>
      </g>`,
  },
]

for (const s of STICKERS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}">${s.svg(s.w, s.h)}</svg>`
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  })
  // 按 alpha 包围盒裁紧，和其余贴纸的约定一致（高度由运行时按比例算）
  let x0 = info.width
  let x1 = 0
  let y0 = info.height
  let y1 = 0
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 4) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(join(ROOT, s.out))
  console.log(`→ ${s.out}  ${x1 - x0 + 1}×${y1 - y0 + 1}`)
}

console.log('  记得跑 `bun run assets:bleed` 与 `bun run scripts/assets/sync-manifest.mjs`')
