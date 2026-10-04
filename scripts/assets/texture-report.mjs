#!/usr/bin/env bun
/**
 * 纹理规格体检（整改方案 §6.3）。
 *
 * 回答四个问题，全部用像素统计而不是肉眼判断：
 *
 *   1. **cutout 还是 blend**：统计半透明像素占比，并区分「抗锯齿软边」
 *      和「真实半透明区域」。软边是可以被 alphaTest 一刀切的；
 *      真实半透明（玻璃、烘焙投影、渐隐）一刀切就会出硬边和缺块。
 *   2. **mipmap 之后 alpha 覆盖率掉多少**：alphaTest 在低 mip 级别上会
 *      让物件「变瘦」甚至消失（细吉他弦、贴纸描边最明显）。
 *      这个数字决定要不要开 alphaToCoverage 或改 alphaTest 阈值。
 *   3. **预乘 alpha**：直通 alpha 的数据必然存在 max(RGB) > A 的像素；
 *      如果一张都没有，说明已经被预乘过，three 默认的
 *      `texture.premultiplyAlpha = false` 会让它整体变暗。
 *   4. **颜色扩张是否还在位**：透明区 RGB 均值。重新编码会破坏扩张结果，
 *      所以每次改完素材都要复查。
 *
 *   bun run scripts/assets/texture-report.mjs           人读表格
 *   bun run scripts/assets/texture-report.mjs --json    机读 JSON
 */
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import sharp from 'sharp'

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
const DIRS = ['public/assets/obj', 'public/assets/obj2']
/**
 * 图集是十几块拼出来的，「剪影周长」「半透明带宽」这些整图指标对它没有意义
 * （量出来的是所有格子边缘的总和，必然判成 blend）。
 * 图集里每一块的 cutout / blend 判定由 scripts/assets/pack-decals.mjs
 * 写进 decal-atlas.json 的 `mode`，源图在本表里各自单独列着。
 */
const ATLASES = new Set(['doorDecals.webp'])
const JSON_OUT = process.argv.includes('--json')

/** alpha 归一化后的判定阈值 */
const A_OPAQUE = 0.94 // ≥ 视为完全不透明
const A_CLEAR = 0.03 // ≤ 视为完全透明
/**
 * 有的素材整张都不到满 alpha（washi 胶带这类刻意做成半透的），
 * 用固定 0.94 会判定成「一个不透明像素都没有」，周长为 0、带宽算出天文数字。
 * 所以剪影阈值按**本张 alpha 的 99 分位**缩放：正常素材 p99=255，
 * 阈值回落到 0.94；整体半透明的素材阈值跟着它自己的实心值走。
 */
const SILHOUETTE_OF_P99 = 0.94
/**
 * 「软边」的最大宽度（像素）。抗锯齿边最多 1–2px；
 * 超过这个宽度的半透明带就不是锯齿，是真的半透明。
 */
const AA_BAND_PX = 2.5
/** 半透明像素占不透明面积多少以上，判定为必须 blend */
const BLEND_AREA_RATIO = 0.06
/**
 * 覆盖率要在两个 alphaTest 下各量一遍：
 *   0.1 —— PropDecal.tsx 目前用的值
 *   0.5 —— 建议值（配 alphaToCoverage）
 * 阈值越低，box-filter 之后越多「本来接近透明」的像素越过门槛，
 * 剪影在远处会**变胖**；0.5 落在软边中点上，缩放前后覆盖率最稳。
 */
const ALPHA_TESTS = [0.1, 0.5]

/** 简易 box-filter 降采样一级（模拟 GPU 生成 mipmap 的方式） */
function downsampleAlpha(a, w, h) {
  const nw = Math.max(1, w >> 1)
  const nh = Math.max(1, h >> 1)
  const out = new Float32Array(nw * nh)
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const x0 = Math.min(w - 1, x * 2)
      const x1 = Math.min(w - 1, x * 2 + 1)
      const y0 = Math.min(h - 1, y * 2)
      const y1 = Math.min(h - 1, y * 2 + 1)
      out[y * nw + x] =
        (a[y0 * w + x0] + a[y0 * w + x1] + a[y1 * w + x0] + a[y1 * w + x1]) / 4
    }
  }
  return { a: out, w: nw, h: nh }
}

function coverage(a, test) {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] >= test) n++
  return n / a.length
}

async function analyse(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const n = w * h

  const alpha = new Float32Array(n)
  let opaque = 0
  let clear = 0
  let partial = 0
  /** alpha 最大值。远小于 255 说明整张贴图被整体降透明度了，是缺陷 */
  let maxAlpha = 0
  // 直通 alpha 的证据：RGB 超过 alpha 的像素
  let straightEvidence = 0

  for (let i = 0; i < n; i++) {
    const a8 = data[i * 4 + 3]
    if (a8 > maxAlpha) maxAlpha = a8
    alpha[i] = a8 / 255
  }
  /** 本张贴图的「剪影内部」阈值：按可见像素 alpha 的 99 分位缩放 */
  const hist = new Uint32Array(256)
  let visible = 0
  for (let i = 0; i < n; i++) {
    const a8 = data[i * 4 + 3]
    if (a8 / 255 > A_CLEAR) {
      hist[a8]++
      visible++
    }
  }
  let acc = 0
  let p99 = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= visible * 0.99) {
      p99 = v
      break
    }
  }
  const aSolid = Math.min(A_OPAQUE, (p99 / 255) * SILHOUETTE_OF_P99)

  for (let i = 0; i < n; i++) {
    const a = alpha[i]
    if (a >= aSolid) opaque++
    else if (a <= A_CLEAR) clear++
    else partial++

    const mx = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255
    if (a > 0.02 && a < 0.98 && mx > a + 0.06) straightEvidence++
  }

  /*
   * 颜色扩张只推 12 圈，所以「透明区 RGB 均值」必须只在**扩张带内**量。
   * 对整张透明区取均值会被 12px 以外没动过的黑区拉低，看起来像没扩张。
   * 这里从不透明区做一次 BFS，取距离 ≤ BLEED_BAND 的透明像素。
   */
  const BLEED_BAND = 6
  const dist = new Int16Array(n).fill(-1)
  let frontier = []
  for (let i = 0; i < n; i++) {
    if (alpha[i] > A_CLEAR) {
      dist[i] = 0
      frontier.push(i)
    }
  }
  let bandSum = 0
  let bandN = 0
  for (let d = 1; d <= BLEED_BAND && frontier.length; d++) {
    const next = []
    for (const i of frontier) {
      const x = i % w
      const y = (i / w) | 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (dist[j] !== -1) continue
        dist[j] = d
        next.push(j)
        bandSum += data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]
        bandN += 3
      }
    }
    frontier = next
  }

  /* ── 轮廓周长：不透明像素里至少有一个非不透明 4-邻居的 ── */
  let perimeter = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (alpha[i] < aSolid) continue
      const up = y > 0 ? alpha[i - w] : 0
      const dn = y < h - 1 ? alpha[i + w] : 0
      const lf = x > 0 ? alpha[i - 1] : 0
      const rt = x < w - 1 ? alpha[i + 1] : 0
      if (up < aSolid || dn < aSolid || lf < aSolid || rt < aSolid) perimeter++
    }
  }

  /*
   * 半透明带的平均宽度 = 半透明像素数 ÷ 轮廓周长。
   * 一圈抗锯齿边 ≈ 1；烘焙投影、玻璃、渐隐会远大于这个数。
   */
  const bandPx = perimeter > 0 ? partial / perimeter : partial > 0 ? Infinity : 0

  /*
   * 「深处半透明」：距离最近的完全透明像素超过 3px 仍然半透明的像素。
   * 这类像素在物件内部，alphaTest 会把它们变成全不透明（丢失通透感）
   * 或者整块挖掉（如果低于阈值）。有一定数量就必须 blend。
   */
  const CH = 3
  let interiorPartial = 0
  for (let y = CH; y < h - CH; y++) {
    for (let x = CH; x < w - CH; x++) {
      const i = y * w + x
      const a = alpha[i]
      if (a <= A_CLEAR || a >= aSolid) continue
      let nearClear = false
      for (let dy = -CH; dy <= CH && !nearClear; dy++) {
        for (let dx = -CH; dx <= CH; dx++) {
          if (alpha[(y + dy) * w + (x + dx)] <= A_CLEAR) {
            nearClear = true
            break
          }
        }
      }
      if (!nearClear) interiorPartial++
    }
  }

  /* ── mipmap 之后的 alpha 覆盖率漂移，两个阈值各量一遍 ── */
  const levels = [{ a: alpha, w, h }]
  for (let k = 0; k < 4; k++) {
    const prev = levels[levels.length - 1]
    levels.push(downsampleAlpha(prev.a, prev.w, prev.h))
  }
  const drift = {}
  for (const t of ALPHA_TESTS) {
    const c = levels.map((l) => coverage(l.a, t))
    drift[t] = c[0] > 0 ? (c[4] - c[0]) / c[0] : 0
  }

  const opaqueArea = opaque || 1
  const partialOverOpaque = partial / opaqueArea
  const interiorOverOpaque = interiorPartial / opaqueArea

  /* ── 判定 ── */
  let mode
  let reason
  if (maxAlpha < 250) {
    // 整张贴图都到不了满 alpha：物件本身就是半透明的（如 washi 胶带），
    // 走 cutout 会把它变成实心纸片，必须 blend
    mode = 'blend'
    reason = `整张最高 alpha 只有 ${maxAlpha}/255（${((maxAlpha / 255) * 100).toFixed(0)}%），物件本体就是半透明的`
  } else if (bandPx > AA_BAND_PX && partialOverOpaque > BLEND_AREA_RATIO) {
    mode = 'blend'
    reason = `半透明带宽 ${bandPx.toFixed(1)}px（>${AA_BAND_PX}），且占不透明面积 ${(partialOverOpaque * 100).toFixed(1)}%`
  } else if (interiorOverOpaque > 0.02) {
    mode = 'blend'
    reason = `内部半透明像素占不透明面积 ${(interiorOverOpaque * 100).toFixed(1)}%，不是锯齿边`
  } else {
    mode = 'cutout'
    reason = `半透明只有 ${bandPx.toFixed(1)}px 的抗锯齿边，占不透明面积 ${(partialOverOpaque * 100).toFixed(1)}%`
  }

  return {
    file: relative(ROOT, file),
    w,
    h,
    bytes: statSync(file).size,
    npot: (w & (w - 1)) !== 0 || (h & (h - 1)) !== 0,
    opaquePct: (opaque / n) * 100,
    clearPct: (clear / n) * 100,
    partialPct: (partial / n) * 100,
    partialOverOpaquePct: partialOverOpaque * 100,
    interiorPartialPct: interiorOverOpaque * 100,
    bandPx,
    /** 直通 alpha 证据像素数；0 说明可能已被预乘 */
    straightEvidence,
    premultiplied: straightEvidence === 0 && partial > 32,
    maxAlpha,
    /** 扩张带（距不透明区 ≤6px）内的 RGB 均值；接近物件本色说明扩张在位 */
    bleedRgb: bandN ? bandSum / bandN : null,
    /** 第 4 级 mip 相对原图的覆盖率变化，按 alphaTest 分别给 */
    covDrift: drift[0.1],
    covDrift50: drift[0.5],
    mode,
    reason,
  }
}

const files = DIRS.flatMap((d) => {
  const abs = join(ROOT, d)
  if (!existsSync(abs)) return []
  return readdirSync(abs)
    .filter((f) => f.endsWith('.webp') && !ATLASES.has(f))
    .map((f) => join(abs, f))
}).sort()

const rows = []
for (const f of files) rows.push(await analyse(f))

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const pad = (s, n) => String(s).padEnd(n)
  const num = (v, n, d = 1) => v.toFixed(d).padStart(n)
  console.log(
    `${pad('文件', 30)}${pad('尺寸', 10)}${'半透%'.padStart(7)}${'/不透%'.padStart(8)}${'内部%'.padStart(7)}${'带宽px'.padStart(8)}${'mip4@.1'.padStart(9)}${'mip4@.5'.padStart(9)}${'扩张RGB'.padStart(9)}${'maxA'.padStart(6)}  模式`,
  )
  for (const r of rows) {
    console.log(
      pad(r.file.replace('public/assets/', ''), 30) +
        pad(`${r.w}x${r.h}`, 10) +
        num(r.partialPct, 7, 2) +
        num(r.partialOverOpaquePct, 8, 1) +
        num(r.interiorPartialPct, 7, 2) +
        num(r.bandPx, 8, 1) +
        `${(r.covDrift * 100 >= 0 ? '+' : '') + (r.covDrift * 100).toFixed(1)}%`.padStart(9) +
        `${(r.covDrift50 * 100 >= 0 ? '+' : '') + (r.covDrift50 * 100).toFixed(1)}%`.padStart(9) +
        (r.bleedRgb === null ? '—' : r.bleedRgb.toFixed(0)).padStart(9) +
        String(r.maxAlpha).padStart(6) +
        '  ' +
        r.mode,
    )
  }

  const cut = rows.filter((r) => r.mode === 'cutout')
  const bl = rows.filter((r) => r.mode === 'blend')
  console.log(`\n── cutout（alphaTest，硬边，可写深度）${cut.length} 张 ──`)
  for (const r of cut) console.log(`  · ${r.file.replace('public/assets/', '')} — ${r.reason}`)
  console.log(`\n── blend（必须混合）${bl.length} 张 ──`)
  for (const r of bl) console.log(`  · ${r.file.replace('public/assets/', '')} — ${r.reason}`)

  const pm = rows.filter((r) => r.premultiplied)
  console.log(
    `\n预乘 alpha 检查：${pm.length ? '疑似已预乘 → ' + pm.map((r) => r.file).join(', ') : '全部为直通 alpha（正确，three 默认 premultiplyAlpha=false）'}`,
  )
  const worst = (k) =>
    rows.reduce((m, r) => Math.max(m, Math.abs(r[k])), 0) * 100
  console.log(
    `mip4 覆盖率漂移最大值：alphaTest=0.1 时 ${worst('covDrift').toFixed(1)}%，alphaTest=0.5 时 ${worst('covDrift50').toFixed(1)}%` +
      `（正数=远处剪影变胖。0.5 明显更稳，建议配 alphaToCoverage 使用）`,
  )
  const ghost = rows.filter((r) => r.bleedRgb !== null && r.bleedRgb < 40)
  console.log(
    `颜色扩张缺失（扩张带 RGB 均值 <40）：${ghost.length ? ghost.map((r) => r.file).join('、') : '无'}`,
  )
  const dim = rows.filter((r) => r.maxAlpha < 250)
  console.log(
    `整体半透明（maxA<250，必须走 blend，不能 cutout）：${dim.length ? dim.map((r) => `${r.file.replace('public/assets/', '')} maxA=${r.maxAlpha}`).join('、') : '无'}`,
  )
}
