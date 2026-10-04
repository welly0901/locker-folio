#!/usr/bin/env bun
/**
 * 资产门禁：把「错误 preload」「素材引用断链」「首屏预算超限」变成可失败的检查。
 *
 *   bun run scripts/check-assets.mjs          对源码目录检查
 *   bun run scripts/check-assets.mjs dist     对构建产物检查
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const target = process.argv[2] === 'dist' ? 'dist' : null
const PUBLIC_DIR = target ? join(ROOT, 'dist') : join(ROOT, 'public')
const HTML = target ? join(ROOT, 'dist/index.html') : join(ROOT, 'index.html')

/** 首屏预算（§12.1）；作品页素材不算首屏 */
const BUDGET = {
  heroTransferKiB: 1600, // 首屏阻塞素材的传输体积
  totalTransferMiB: 8, // 全部静态素材
  heroDecodedMiB: 48, // 首屏 GPU 纹理 / RGBA 解码估算
  entryGzipKiB: 120, // 入口 JS 的 gzip 上限：Three/R3F 必须在 lazy 边界之外
}

const errors = []
const warnings = []
const notes = []

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

// ── 1. HTML 里的 preload 必须真实存在 ────────────────────────────
const html = existsSync(HTML) ? readFileSync(HTML, 'utf8') : ''
const preloads = [...html.matchAll(/<link[^>]+rel=["']preload["'][^>]*>/g)].map((m) => {
  const href = m[0].match(/href=["']([^"']+)["']/)
  const as = m[0].match(/\bas=["']([^"']+)["']/)
  return { href: href?.[1] ?? '', as: as?.[1] ?? '' }
})

for (const p of preloads) {
  if (!p.href) continue
  if (/^https?:/.test(p.href)) {
    notes.push(`preload 指向外部源，未校验存在性：${p.href}`)
    continue
  }
  if (!p.as) errors.push(`preload 缺少 as 属性：${p.href}`)
  const disk = join(PUBLIC_DIR, p.href.replace(/^\//, ''))
  if (!existsSync(disk)) {
    errors.push(`preload 指向不存在的资源：${p.href}`)
  }
}
notes.push(`preload 条目：${preloads.length}`)

// ── 2. 源码里引用的 /assets 路径必须真实存在 ──────────────────────
const srcFiles = walk(join(ROOT, 'src')).filter((f) =>
  ['.ts', '.tsx', '.css'].includes(extname(f)),
)
const referenced = new Set()
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/\/assets\/[A-Za-z0-9_\-/]+\.(?:webp|png|jpg|jpeg|avif|glb|gltf|ktx2|hdr)/g)) {
    referenced.add(m[0])
  }
}
// 模板字符串拼出来的路径（如 `/assets/posters/${x}.webp`）按目录整体放行
const dynamicDirs = new Set()
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/\/assets\/([A-Za-z0-9_\-/]+)\/\$\{/g)) dynamicDirs.add(m[1])
}

for (const ref of referenced) {
  const disk = join(ROOT, 'public', ref.replace(/^\//, ''))
  if (!existsSync(disk)) errors.push(`源码引用了不存在的素材：${ref}`)
}
notes.push(`静态引用素材：${referenced.size}；动态目录：${[...dynamicDirs].join(', ') || '无'}`)

// ── 3. 未被引用的素材（只警告，可能是动态引用） ───────────────────
const assetFiles = walk(join(ROOT, 'public/assets'))
for (const f of assetFiles) {
  const web = '/' + relative(join(ROOT, 'public'), f)
  if (referenced.has(web)) continue
  const dir = relative(join(ROOT, 'public/assets'), f).split('/').slice(0, -1).join('/')
  if (dynamicDirs.has(dir)) continue
  warnings.push(`素材未被任何源码引用：${web}`)
}

// ── 4. 体积与解码预算 ──────────────────────────────────────────
// 首屏 = 柜体场景用到的物件贴图；作品页素材不计入
const HERO_DIRS = ['obj', 'obj2', 'fix']
let heroBytes = 0
let totalBytes = 0
let heroDecoded = 0

// 解码量按真实像素数算：宽 × 高 × 4B × 4/3（mipmap chain）。
// 早先用「文件大小 × 34」的经验系数估出 28MiB，实测按像素只有 23.9MiB —— 
// 压缩比在不同图之间差很多，系数法会把结论带偏，直接读图头。
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  notes.push('未安装 sharp，解码估算退回文件大小系数法（偏保守）')
}

for (const f of assetFiles) {
  const size = statSync(f).size
  totalBytes += size
  const rel = relative(join(ROOT, 'public/assets'), f)
  const dir = rel.split('/')[0]
  if (HERO_DIRS.includes(dir)) {
    heroBytes += size
    if (sharp) {
      const { width = 0, height = 0 } = await sharp(f).metadata()
      heroDecoded += width * height * 4 * (4 / 3)
    } else {
      heroDecoded += size * 34
    }
  }
}

const heroKiB = heroBytes / 1024
const totalMiB = totalBytes / 1024 / 1024
const heroDecodedMiB = heroDecoded / 1024 / 1024

if (heroKiB > BUDGET.heroTransferKiB)
  errors.push(`首屏素材传输超预算：${heroKiB.toFixed(0)}KiB > ${BUDGET.heroTransferKiB}KiB`)
if (totalMiB > BUDGET.totalTransferMiB)
  errors.push(`静态素材总量超预算：${totalMiB.toFixed(2)}MiB > ${BUDGET.totalTransferMiB}MiB`)
if (heroDecodedMiB > BUDGET.heroDecodedMiB)
  warnings.push(
    `首屏解码估算超预算：约 ${heroDecodedMiB.toFixed(0)}MiB > ${BUDGET.heroDecodedMiB}MiB（粗估，接入 KTX2 后应重算）`,
  )

notes.push(
  `首屏素材 ${heroKiB.toFixed(0)}KiB / 总量 ${totalMiB.toFixed(2)}MiB / ` +
    `首屏解码估算约 ${heroDecodedMiB.toFixed(0)}MiB（口径：磁盘上全部首屏图；` +
    `3D 实际上传 GPU 的只是其中一部分，旧 DOM 柜体退役后会显著下降）`,
)

// ── 4b. 素材层的自检脚本（图集与清单的两处真相对账）────────────
if (!target) {
  const { spawnSync } = await import('node:child_process')
  for (const [label, script] of [
    ['贴花图集与场景层排位对账', 'scripts/assets/pack-decals.mjs'],
    ['清单 bytes/version 与磁盘对账', 'scripts/assets/sync-manifest.mjs'],
  ]) {
    if (!existsSync(join(ROOT, script))) continue
    const r = spawnSync('bun', [script, '--check'], { cwd: ROOT, encoding: 'utf8' })
    if (r.status !== 0) {
      const tail = (r.stdout || r.stderr || '').trim().split('\n').slice(-2).join(' / ')
      errors.push(`${label}未通过：${tail}`)
    } else {
      notes.push(`${label} 通过`)
    }
  }
}

// ── 5. 入口 JS 预算：3D 依赖不能进主包 ──────────────────────────
// 只在检查 dist 时有意义
if (target) {
  const { gzipSync } = await import('node:zlib')
  const entries = walk(join(ROOT, 'dist/assets')).filter((f) => /\/index-[^/]+\.js$/.test(f))
  for (const f of entries) {
    const raw = readFileSync(f)
    const gz = gzipSync(raw).length / 1024
    const hasThree = raw.includes('WebGLRenderer')
    notes.push(`入口 JS ${(raw.length / 1024).toFixed(0)}KiB / gzip ${gz.toFixed(0)}KiB`)
    if (hasThree) {
      errors.push(
        '入口 JS 里含 Three.js（命中 WebGLRenderer）——' +
          'R3F Canvas 必须在 lazy 边界之外，否则功能开关关着也要付下载和解析成本',
      )
    }
    if (gz > BUDGET.entryGzipKiB) {
      errors.push(`入口 JS gzip 超预算：${gz.toFixed(0)}KiB > ${BUDGET.entryGzipKiB}KiB`)
    }
  }
}

// ── 输出 ──────────────────────────────────────────────────────
for (const n of notes) console.log(`  · ${n}`)
for (const w of warnings) console.log(`  ! ${w}`)
for (const e of errors) console.error(`  ✗ ${e}`)

if (errors.length) {
  console.error(`\n资产门禁未通过：${errors.length} 项错误、${warnings.length} 项警告`)
  process.exit(1)
}
console.log(`\n资产门禁通过（${warnings.length} 项警告）`)
