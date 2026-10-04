#!/usr/bin/env bun
/**
 * 把 src/experience/assetManifest.ts 里的 bytes / version 同步成磁盘上的真值。
 *
 * 清单的 bytes 是 Loader 的加权进度分母，version 是 sha256 前 8 位；
 * 换过图不同步，进度条会跑偏，开发期还会打漂移告警（见 assetManifest.ts 文件头）。
 * 手工改二十几处很容易漏，所以做成脚本。
 *
 * **只改数字和哈希**，不动清单的结构、顺序和任何导出接口。
 * 改完会打印每一处的新旧值，方便 review diff。
 *
 *   bun run scripts/assets/sync-manifest.mjs          写回
 *   bun run scripts/assets/sync-manifest.mjs --check  只报告差异，有差异时退出码 1
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Windows 下 URL.pathname 会多出前导斜杠（/D:/...），必须走 fileURLToPath
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '')
const FILE = join(ROOT, 'src/experience/assetManifest.ts')
const CHECK = process.argv.includes('--check')

function onDisk(url) {
  const p = join(ROOT, 'public', url.replace(/^\//, ''))
  if (!existsSync(p)) return null
  return {
    bytes: statSync(p).size,
    version: createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 8),
  }
}

let text = readFileSync(FILE, 'utf8')
const changes = []
const missing = []

/** 形态 A：`{ width: 300, url: '/assets/…', bytes: 9470, version: 'abcd1234' }` */
text = text.replace(
  /url: '(\/assets\/[^']+)', bytes: (\d+), version: '([0-9a-f]{8})'/g,
  (whole, url, bytes, version) => {
    const d = onDisk(url)
    if (!d) {
      missing.push(url)
      return whole
    }
    if (+bytes === d.bytes && version === d.version) return whole
    changes.push([url, bytes, version, d.bytes, d.version])
    return `url: '${url}', bytes: ${d.bytes}, version: '${d.version}'`
  },
)

/**
 * 形态 B：`prop('id', '/assets/…', 85978, '8c22dd20', true)`
 *         `decal('id', '/assets/…', 17112, '50d79573')`
 *         `lazyAsset('id', '/assets/…', 'work.poster', 174186, 'cbba82ef')`
 * 中间可能换行（prettier 对长参数会折行），所以允许空白。
 */
text = text.replace(
  /('(?:\/assets\/[^']+)',\s*(?:'[a-z][a-z.]*',\s*)?)(\d+),(\s*)'([0-9a-f]{8})'/g,
  (whole, head, bytes, gap, version) => {
    const url = head.match(/'(\/assets\/[^']+)'/)[1]
    const d = onDisk(url)
    if (!d) {
      missing.push(url)
      return whole
    }
    if (+bytes === d.bytes && version === d.version) return whole
    changes.push([url, bytes, version, d.bytes, d.version])
    return `${head}${d.bytes},${gap}'${d.version}'`
  },
)

for (const url of [...new Set(missing)]) console.error(`  ✗ 清单里的资源在磁盘上不存在：${url}`)

if (!changes.length) {
  console.log(`清单已与磁盘一致（${missing.length ? missing.length + ' 项缺失' : '无缺失'}）`)
  process.exit(missing.length ? 1 : 0)
}

for (const [url, ob, ov, nb, nv] of changes) {
  console.log(
    `  ${url.padEnd(34)} ${String(ob).padStart(7)} → ${String(nb).padStart(7)} bytes   ${ov} → ${nv}`,
  )
}
console.log(`\n${changes.length} 项${CHECK ? '需要同步' : '已同步'}`)

if (CHECK) process.exit(1)
writeFileSync(FILE, text)
