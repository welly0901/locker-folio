#!/usr/bin/env bun
/**
 * SELECTED WORK 文件盒的内容校正（整改方案 §6.5）。
 *
 * 参考（参考画面 的 505,370 起 155×140 区域）：
 * 黄色文件夹正面缝线框里印着三行字 —— 红色描白边的 `SELECTED`、
 * 青色描白边的 `WORK`、红色描白边的「作品展示」。
 * 这三行字就是这件物件的识别标志，缺了它只是一个黄色文件夹。
 *
 * 现素材 obj2/paperbox.webp 的**形体和参考几乎一致**：黄色软塑文件夹、
 * 露出白纸、右上一枚棕色圆扣带绳。差的只有文字。
 * 所以和工牌一样走合成，不重新生成，形体材质光照一个像素都不动。
 *
 * ── 版式为什么和参考不完全一样 ──────────────────────────────
 * 参考里圆扣在正面板的右上角、文字从它下方开始占满整个板面。
 * 现素材的圆扣更大、位置更靠中（x 505–590、y 258–345，还带一条垂到 y≈370
 * 的绳），照参考的位置排字会被圆扣压住。
 * 这里把三行整体下移到圆扣以下的 y 370–595，仍然居中，
 * 视觉重心比参考低一点，但不压物件、不改物件。
 *
 *   bun run scripts/assets/build-paperbox.mjs
 */
import { join } from 'node:path'
import sharp from 'sharp'

sharp.cache(false)

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const BLANK = join(ROOT, 'scripts/assets/masters/paperbox-blank.webp')
const OUT = join(ROOT, 'public/assets/obj2/paperbox.webp')

const W = 760
const H = 694

/**
 * 正面缝线框（在 masters/paperbox-blank.webp 上量的）：
 * 左上 (45,228)、右上 (630,215)、左下 (52,608)、右下 (632,592)。
 * 顶边向右微微抬起，约 −1.3°，文字整体跟着转这个角度才贴在面上。
 */
const PANEL_CX = 337
const PANEL_TILT = -1.3

/** 三行的基线，都在圆扣（下缘 345、绳尾 ≈370）以下 */
const ROWS = [
  { text: 'SELECTED', y: 414, size: 66, fill: '#D4472E', latin: true },
  { text: 'WORK', y: 486, size: 66, fill: '#3FAFC2', latin: true },
  { text: '作品展示', y: 560, size: 62, fill: '#D4472E', latin: false },
]

/**
 * 描边宽度。参考里是白描边 + 一点点深色投影的复古立体字；
 * 这里用 paint-order:stroke 画白边，再垫一层下移 3px 的暗色副本充当厚度，
 * 不用真的做 3D 挤出 —— 这块字在屏幕上只有 40px 高，做多了反而糊。
 */
const STROKE = 6
const SHADOW = '#00000026'

const LATIN = 'Helvetica Neue, Helvetica, Arial, sans-serif'
const CJK = 'PingFang SC, Hiragino Sans GB, sans-serif'

const rows = ROWS.map(
  (r) => `
  <text x="${PANEL_CX}" y="${r.y + 3}" text-anchor="middle"
        font-family="${r.latin ? LATIN : CJK}" font-weight="700"
        font-size="${r.size}" letter-spacing="${r.latin ? 2 : 4}"
        fill="${SHADOW}">${r.text}</text>
  <text x="${PANEL_CX}" y="${r.y}" text-anchor="middle"
        font-family="${r.latin ? LATIN : CJK}" font-weight="700"
        font-size="${r.size}" letter-spacing="${r.latin ? 2 : 4}"
        fill="${r.fill}" stroke="#FFF8EC" stroke-width="${STROKE}"
        stroke-linejoin="round" paint-order="stroke">${r.text}</text>`,
).join('\n')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <g transform="rotate(${PANEL_TILT} ${PANEL_CX} 500)">${rows}</g>
</svg>`

const composed = await sharp(BLANK)
  .ensureAlpha()
  .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
  .raw()
  .toBuffer({ resolveWithObject: true })

// 文字层画在整张画布上，落到物件外的笔画要按底图 alpha 裁掉
const base = await sharp(BLANK).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const out = composed.data
for (let i = 0; i < W * H; i++) {
  if (base.data[i * 4 + 3] < 8) out[i * 4 + 3] = 0
  else if (out[i * 4 + 3] > base.data[i * 4 + 3]) out[i * 4 + 3] = base.data[i * 4 + 3]
}

await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(OUT)

console.log(`→ ${OUT.replace(ROOT + '/', '')}`)
console.log('  记得跑 `bun run assets:bleed` 与 `bun run scripts/assets/sync-manifest.mjs`')
