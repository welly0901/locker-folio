/* 从三联拍立得源图（卡片互相倾斜叠放、无透明通道、棋盘格底）生成
 * src 场景需要的 polaroids.webp：三张照片各自旋正后拼到 760×704 透明画布。
 *
 * 角度与裁切框是从源图客观测量的（Sobel 边缘 + 卡片底边水平验证）：
 *   friends 源卡 -5.61°  beach -11.13°  camera +8.75°
 * PhysicalProps.tsx 的 POLAROID_CROPS 必须与本脚本的摆放位置一致。 */
import sharp from 'sharp'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'

const SRC = 'c:/Users/wwimf/Downloads/poli.png'
const OUT = 'public/assets/obj2/polaroids.webp'
const CANVAS = { w: 760, h: 704 }

/** 每张照片：整图旋转角（sharp 正角=顺时针）、旋转后照片矩形、在输出画布的位置 */
const PHOTOS = [
  {
    n: 'friends',
    rotate: 5.61,
    src: { left: 536, top: 229, width: 466, height: 374 },
    dest: { left: 279, top: 62, width: 256, height: 206 },
  },
  {
    n: 'beach',
    rotate: 11.13,
    src: { left: 202, top: 670, width: 406, height: 376 },
    dest: { left: 62, top: 310, width: 231, height: 214 },
  },
  {
    n: 'camera',
    rotate: -8.75,
    src: { left: 862, top: 717, width: 434, height: 383 },
    dest: { left: 460, top: 340, width: 240, height: 212 },
  },
]

mkdirSync('public/assets/obj2', { recursive: true })
const origBackup = 'public/assets/obj2/polaroids.orig.webp'
if (!existsSync(origBackup)) copyFileSync(OUT, origBackup)

const layers = []
for (const p of PHOTOS) {
  const buf = await sharp(await sharp(SRC).rotate(p.rotate).png().toBuffer())
    .extract(p.src)
    .resize(p.dest.width, p.dest.height)
    .png()
    .toBuffer()
  layers.push({ input: buf, ...p.dest })
  console.log(`ok ${p.n}`)
}

let { data, info } = await sharp({
  create: { width: CANVAS.w, height: CANVAS.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(layers)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

// 透明区 RGB 填白：mip 平均时边缘不发灰
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] === 0) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255 }
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(OUT)
console.log(`→ ${OUT}`)
