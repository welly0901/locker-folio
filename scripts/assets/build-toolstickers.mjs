/* 一次性脚本：把 9 张工具图标做成圆角贴纸的 512×512 webp。
 * 无描边，只套一个统一圆角矩形蒙版（半径 ~20%，应用图标风格）。 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const SRC_DIR = 'c:/Users/wwimf/Desktop/奖状'
const OUT_DIR = 'public/assets/obj2'
const SIZE = 512
const PAD = 8
/** 圆角半径（相对 512 画布 ≈ 20%，接近应用图标的 squircle 观感） */
const RADIUS = 100

const ICONS = {
  'tool-ai': 'AIi.png',
  'tool-canva': 'canva.png',
  'tool-cursor': 'cursor.png',
  'tool-figma': 'figma.png',
  'tool-gpt': 'GPT.png',
  'tool-jianying': 'jianying.png',
  'tool-jimeng': 'jimeng.png',
  'tool-pr': 'PR.png',
  'tool-ps': 'PS.png',
}

mkdirSync(OUT_DIR, { recursive: true })

for (const [name, file] of Object.entries(ICONS)) {
  // 1. 裁掉透明边，等比放进内框
  const inner = SIZE - PAD * 2
  const iconBuf = await sharp(`${SRC_DIR}/${file}`)
    .trim()
    .resize(inner, inner, { fit: 'inside' })
    .png()
    .toBuffer()
  const meta = await sharp(iconBuf).metadata()
  const canvas = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: iconBuf, left: Math.round((SIZE - meta.width) / 2), top: Math.round((SIZE - meta.height) / 2) },
    ])
    .png()
    .toBuffer()

  // 2. 圆角矩形蒙版（dest-in：只保留圆角内的部分）
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
      <rect x="${PAD}" y="${PAD}" width="${SIZE - PAD * 2}" height="${SIZE - PAD * 2}"
            rx="${RADIUS}" ry="${RADIUS}" fill="#ffffff"/>
    </svg>`,
  )
  const { data: px, info } = await sharp(canvas)
    .composite([{ input: mask, blend: 'dest-in' }])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // 3. 透明区 RGB 填白（mip 边缘防灰）
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255 }
  }
  await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(`${OUT_DIR}/${name}.webp`)
  console.log(`ok ${name}.webp`)
}
