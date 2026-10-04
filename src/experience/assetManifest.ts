/* ============================================================================
 * 首屏资源清单 AssetManifest
 *
 * 这里是全站资源的**唯一事实来源**：
 *   1. 每项资源记录 id / url / 类型 / 分组 / 是否首屏阻塞 / 是否 preload /
 *      预期体积 / 解码方式 / fallback / 授权来源 / 版本哈希。
 *   2. Loader 只统计本清单中的真实事件（请求完成、decode() 完成），
 *      不再使用固定计时的假进度。
 *   3. index.html 里的 <link rel="preload"> 必须与 PRELOAD_ASSETS 一一对应，
 *      开发模式下 auditPreloadLinks() 会校验两边是否漂移。
 *
 * 约定：
 *   - version 是文件内容 sha256 前 8 位，**不拼进 URL**。
 *     拼进 URL 会和 <img src="/assets/..."> 产生两次不同缓存键的请求。
 *     换图后请用下面的命令重新生成：
 *       shasum -a 256 public/assets/<path> | cut -c1-8
 *   - bytes 是磁盘上的真实传输体积，Loader 用它做加权进度，
 *     所以换图后 bytes 也要同步更新（stat -f%z）。
 * ========================================================================== */

import { useSyncExternalStore } from 'react'

/* ── 类型 ─────────────────────────────────────────────────── */

export type AssetKind = 'image' | 'font'

export type AssetGroup =
  | 'hero.prop' // 柜内立体物件：首屏阻塞
  | 'hero.decal' // 柜门贴纸：首屏阻塞，但缺失可降级
  | 'type.display' // 网页字体阶段
  | 'work.poster'
  | 'work.ppt'
  | 'work.photo'
  | 'work.cover'
  | 'work.character'
  | 'work.ip'
  | 'work.xhs'
  | 'work.study'
  | 'work.font'
  | 'work.pkg'

/** 资源失败后的处置方式 */
export type FailPolicy =
  /** 冒泡到 Loader 的错误态，提供重试；不阻止最终放行 */
  | 'error'
  /** 静默降级，只写开发期日志 */
  | 'degrade'

/**
 * 响应式派生图。由 scripts/gen-image-variants.sh 生成，
 * 运行时由 src/components/work/imageSources.ts 的 workImage() 拼成 srcset，
 * 浏览器按显示尺寸和 DPR 只取其中一张 —— 所以变体是同一份资源的不同档位，
 * 不是彼此独立的资源，登记为 entry 的子项而不是并列条目。
 */
export type AssetVariant = {
  /** 像素宽，对应 srcset 的 <w> 描述符 */
  width: number
  url: string
  bytes: number
  version: string
}

export type AssetEntry = {
  /** 稳定 ID，供状态机/热点引用 */
  id: string
  /** 站点根绝对路径，必须与 DOM 中 <img src> 完全一致 */
  url: string
  kind: AssetKind
  group: AssetGroup
  /** 首屏阻塞：Loader 必须等它 ready 才允许走到 100% */
  blocking: boolean
  /** 是否写进 index.html 的 <link rel="preload"> */
  preload: boolean
  /** 预期传输体积（字节），用于加权进度 */
  bytes: number
  /** 解码方式：图片走 HTMLImageElement.decode()，字体走 document.fonts.ready */
  decode: 'img-decode' | 'font-ready'
  /** 失败降级目标；null 表示没有备用资源 */
  fallback: string | null
  onFail: FailPolicy
  /** 单项超时上限（毫秒） */
  timeoutMs: number
  /** 内容授权来源。TODO：原始素材授权尚未确认 */
  license: string
  /** 内容哈希前 8 位 */
  version: string
  /** 响应式派生档位；首屏物件图没有变体，为空数组 */
  variants: readonly AssetVariant[]
}

const DEFAULT_TIMEOUT = 9_000
const LICENSE_TODO = 'unverified/待确认'

/** Hero 直接采样的实体表面纹理：首屏必须全部可用于渲染 */
function prop(
  id: string,
  url: string,
  bytes: number,
  version: string,
  preload = false,
): AssetEntry {
  return {
    id,
    url,
    kind: 'image',
    group: 'hero.prop',
    blocking: true,
    preload,
    bytes,
    decode: 'img-decode',
    fallback: null,
    onFail: 'error',
    timeoutMs: DEFAULT_TIMEOUT,
    license: LICENSE_TODO,
    version,
    variants: [],
  }
}

/** 柜门贴纸：首屏可见，但单张缺失不影响主结构可读，失败静默降级 */
function decal(
  id: string,
  url: string,
  bytes: number,
  version: string,
  preload = false,
): AssetEntry {
  return {
    id,
    url,
    kind: 'image',
    group: 'hero.decal',
    blocking: true,
    preload,
    bytes,
    decode: 'img-decode',
    fallback: null,
    onFail: 'degrade',
    timeoutMs: 8_000,
    license: LICENSE_TODO,
    version,
    variants: [],
  }
}

/** 作品页资源：全部非阻塞，进入对应栏目时按需加载 */
function lazyAsset(
  id: string,
  url: string,
  group: AssetGroup,
  bytes: number,
  version: string,
): AssetEntry {
  return {
    id,
    url,
    kind: 'image',
    group,
    blocking: false,
    preload: false,
    bytes,
    decode: 'img-decode',
    fallback: null,
    onFail: 'degrade',
    timeoutMs: DEFAULT_TIMEOUT,
    license: LICENSE_TODO,
    version,
    // 作品图按栏目显示宽度生成了 1x / 2x 档位，见 WORK_VARIANTS
    variants: WORK_VARIANTS[url] ?? [],
  }
}

/* ── 清单本体 ─────────────────────────────────────────────── */

/**
 * 当前 Hero 会直接交给 Three.js 的实体表面纹理。
 *
 * 唱机、书、背包、文件袋、打字机、吉他与门托盘都已经换成程序化实体网格，
 * 不再把旧透明 WebP 当作材质；右门只保留 polaroids.webp 作为三张实体卡
 * 的组合印刷层。这里必须只登记真实的纹理请求，否则 Loader 虽然
 * 显示 100%，实际上却是在等待场景根本不会用到的旧图片。
 */
const HERO_PROPS: AssetEntry[] = [
  prop('hero.posterwall', '/assets/obj/posterwall.webp', 432228, 'ddf43c3f', true),
  prop('hero.findaword', '/assets/obj/findaword2.webp', 30894, '193897a8', true),
  prop('hero.door4.polaroids', '/assets/obj2/polaroids.webp', 59540, '395570cd', true),
]

/**
 * 柜门贴花。
 *
 * `hero.decalAtlas` 是 scripts/assets/pack-decals.mjs 打的**构建期图集**。
 * DecalField 只上传这张图集；decalSpecs 里的单图 URL 只是图集 UV 的稳定键，
 * 运行时不会逐张请求。因此 Loader 也只等待这一个真实请求。
 */
const HERO_DECALS: AssetEntry[] = [
  decal('hero.decalAtlas', '/assets/obj2/doorDecals.webp', 270856, 'd9578cf3', true),
]

/**
 * 字体阶段。Google Fonts 由 <link rel="stylesheet"> 拉取，
 * 这里只把「字体是否可用」作为一个可计量的阶段接进进度条。
 * 超时后直接放行，字体失败绝不阻塞站点。
 */
const TYPE_STAGE: AssetEntry = {
  id: 'type.display',
  url: 'https://fonts.googleapis.com/css2?family=Ultra…',
  kind: 'font',
  group: 'type.display',
  blocking: true,
  preload: false,
  // 名义权重：不代表真实字节数，只让字体阶段在进度条里占约 2.5% 的一小格。
  // 注意 document.fonts.ready 在没有待加载字体时会立即 resolve，
  // 所以这一格常常很快就满，权重必须给小。
  bytes: 24_000,
  decode: 'font-ready',
  fallback: 'system-ui 尺寸校准回退栈（见 global.css --font-*）',
  onFail: 'degrade',
  timeoutMs: 2_500,
  license: 'Google Fonts / OFL',
  version: 'css2-2026-08',
  variants: [],
}

/**
 * 作品图的响应式派生档位。
 * 宽度必须与 scripts/gen-image-variants.sh 和 imageSources.ts 的 VARIANTS 一致；
 * 换图后用文件头的命令重新生成 bytes / version。
 */
const WORK_VARIANTS: Record<string, readonly AssetVariant[]> = {
  '/assets/photo/p1.webp': [
    { width: 300, url: '/assets/photo/p1-300.webp', bytes: 15924, version: 'e4e013ea' },
    { width: 600, url: '/assets/photo/p1-600.webp', bytes: 39970, version: 'a40a4ff7' },
    { width: 900, url: '/assets/photo/p1-900.webp', bytes: 63970, version: '881612a5' },
  ],
  '/assets/photo/p2.webp': [
    { width: 300, url: '/assets/photo/p2-300.webp', bytes: 18594, version: '148c4bb2' },
    { width: 600, url: '/assets/photo/p2-600.webp', bytes: 46428, version: '07e245c0' },
    { width: 900, url: '/assets/photo/p2-900.webp', bytes: 74840, version: '1c71a780' },
  ],
  '/assets/photo/p3.webp': [
    { width: 300, url: '/assets/photo/p3-300.webp', bytes: 21728, version: '8f8a344e' },
    { width: 600, url: '/assets/photo/p3-600.webp', bytes: 68580, version: '2e7f03d7' },
    { width: 900, url: '/assets/photo/p3-900.webp', bytes: 124266, version: '45046ad7' },
  ],
  '/assets/photo/p4.webp': [
    { width: 300, url: '/assets/photo/p4-300.webp', bytes: 14012, version: '9fe27722' },
    { width: 600, url: '/assets/photo/p4-600.webp', bytes: 32972, version: 'fb96b9c3' },
    { width: 900, url: '/assets/photo/p4-900.webp', bytes: 53142, version: '8f57a9ec' },
  ],
  '/assets/photo/p5.webp': [
    { width: 300, url: '/assets/photo/p5-300.webp', bytes: 22252, version: '557584c1' },
    { width: 600, url: '/assets/photo/p5-600.webp', bytes: 65728, version: '17eeeeb0' },
    { width: 900, url: '/assets/photo/p5-900.webp', bytes: 112308, version: 'b05a8910' },
  ],
  '/assets/photo/p6.webp': [
    { width: 300, url: '/assets/photo/p6-300.webp', bytes: 7566, version: '1e2c76e0' },
    { width: 600, url: '/assets/photo/p6-600.webp', bytes: 23074, version: '25dbc5c7' },
    { width: 900, url: '/assets/photo/p6-900.webp', bytes: 43216, version: '883157c6' },
  ],
  '/assets/photo/p7.webp': [
    { width: 300, url: '/assets/photo/p7-300.webp', bytes: 4386, version: '99edc6df' },
    { width: 600, url: '/assets/photo/p7-600.webp', bytes: 13802, version: 'b89c7a96' },
    { width: 900, url: '/assets/photo/p7-900.webp', bytes: 25598, version: '332d9d8a' },
  ],
  '/assets/photo/p8.webp': [
    { width: 300, url: '/assets/photo/p8-300.webp', bytes: 14058, version: '96c8f166' },
    { width: 600, url: '/assets/photo/p8-600.webp', bytes: 32358, version: '18b74e4f' },
    { width: 900, url: '/assets/photo/p8-900.webp', bytes: 53052, version: '6a336ba5' },
  ],
  '/assets/photo/p9.webp': [
    { width: 300, url: '/assets/photo/p9-300.webp', bytes: 22834, version: '987f3104' },
    { width: 600, url: '/assets/photo/p9-600.webp', bytes: 86410, version: '3f86b814' },
    { width: 900, url: '/assets/photo/p9-900.webp', bytes: 180668, version: '110e5a9a' },
  ],
  '/assets/posters/ad1.webp': [
    { width: 400, url: '/assets/posters/ad1-400.webp', bytes: 35648, version: '4ab8793c' },
    { width: 700, url: '/assets/posters/ad1-700.webp', bytes: 82318, version: '2bd8d794' },
  ],
  '/assets/posters/ad2.webp': [
    { width: 400, url: '/assets/posters/ad2-400.webp', bytes: 49412, version: 'e8cee8f7' },
    { width: 700, url: '/assets/posters/ad2-700.webp', bytes: 128606, version: 'e4a9c195' },
  ],
  '/assets/posters/ad3.webp': [
    { width: 400, url: '/assets/posters/ad3-400.webp', bytes: 27350, version: '895c46c4' },
    { width: 700, url: '/assets/posters/ad3-700.webp', bytes: 55622, version: '7464d7eb' },
  ],
  '/assets/posters/ad4.webp': [
    { width: 400, url: '/assets/posters/ad4-400.webp', bytes: 36216, version: '7a98c48a' },
    { width: 700, url: '/assets/posters/ad4-700.webp', bytes: 80524, version: 'b7b38abd' },
  ],
  '/assets/posters/ad5.webp': [
    { width: 400, url: '/assets/posters/ad5-400.webp', bytes: 18048, version: '84a21dcf' },
    { width: 700, url: '/assets/posters/ad5-700.webp', bytes: 50486, version: 'c7c12225' },
  ],
  '/assets/posters/ad6.webp': [
    { width: 400, url: '/assets/posters/ad6-400.webp', bytes: 22376, version: '7267d628' },
    { width: 700, url: '/assets/posters/ad6-700.webp', bytes: 60906, version: 'c21e0a31' },
  ],
  '/assets/posters/ad7.webp': [
    { width: 400, url: '/assets/posters/ad7-400.webp', bytes: 18214, version: 'd6427cd9' },
    { width: 700, url: '/assets/posters/ad7-700.webp', bytes: 47200, version: '46b57542' },
  ],
  '/assets/posters/ad8.webp': [
    { width: 400, url: '/assets/posters/ad8-400.webp', bytes: 21188, version: '0caeaa2a' },
    { width: 700, url: '/assets/posters/ad8-700.webp', bytes: 50358, version: 'eecf796e' },
  ],
  '/assets/posters/ad9.webp': [
    { width: 400, url: '/assets/posters/ad9-400.webp', bytes: 18748, version: '962ed72b' },
    { width: 700, url: '/assets/posters/ad9-700.webp', bytes: 46800, version: '24ddcbd5' },
  ],
  '/assets/posters/ad10.webp': [
    { width: 400, url: '/assets/posters/ad10-400.webp', bytes: 21106, version: '2b6d59e2' },
    { width: 700, url: '/assets/posters/ad10-700.webp', bytes: 54024, version: 'af0d1dfb' },
  ],
  '/assets/posters/ad11.webp': [
    { width: 400, url: '/assets/posters/ad11-400.webp', bytes: 20400, version: '087b7090' },
    { width: 700, url: '/assets/posters/ad11-700.webp', bytes: 41512, version: 'ba59e5cd' },
  ],
  '/assets/posters/ad12.webp': [
    { width: 400, url: '/assets/posters/ad12-400.webp', bytes: 21938, version: '1ca243d8' },
    { width: 700, url: '/assets/posters/ad12-700.webp', bytes: 44228, version: '6fb3042e' },
  ],
  '/assets/posters/ad13.webp': [
    { width: 400, url: '/assets/posters/ad13-400.webp', bytes: 19924, version: 'b8c4d2f7' },
    { width: 700, url: '/assets/posters/ad13-700.webp', bytes: 41010, version: '49f8b026' },
  ],
  '/assets/posters/ad14.webp': [
    { width: 400, url: '/assets/posters/ad14-400.webp', bytes: 98822, version: '508a5e79' },
    { width: 700, url: '/assets/posters/ad14-700.webp', bytes: 278032, version: '06746b25' },
  ],
  '/assets/posters/ad15.webp': [
    { width: 400, url: '/assets/posters/ad15-400.webp', bytes: 97134, version: '3df1cbcc' },
    { width: 700, url: '/assets/posters/ad15-700.webp', bytes: 288632, version: 'fcd7d7e3' },
  ],
  '/assets/posters/ad16.webp': [
    { width: 400, url: '/assets/posters/ad16-400.webp', bytes: 20586, version: '255472c8' },
    { width: 700, url: '/assets/posters/ad16-700.webp', bytes: 44880, version: '4c3cf546' },
  ],
  '/assets/posters/ad17.webp': [
    { width: 400, url: '/assets/posters/ad17-400.webp', bytes: 17894, version: '366cd1b3' },
    { width: 700, url: '/assets/posters/ad17-700.webp', bytes: 40526, version: '05186e81' },
  ],
  '/assets/character/cp1.webp': [
    { width: 400, url: '/assets/character/cp1-400.webp', bytes: 34496, version: '50f28713' },
    { width: 700, url: '/assets/character/cp1-700.webp', bytes: 74694, version: 'fdfadb22' },
  ],
  '/assets/character/cp2.webp': [
    { width: 400, url: '/assets/character/cp2-400.webp', bytes: 37608, version: '90df77eb' },
    { width: 700, url: '/assets/character/cp2-700.webp', bytes: 75784, version: '3b717e3f' },
  ],
  '/assets/character/cp3.webp': [
    { width: 400, url: '/assets/character/cp3-400.webp', bytes: 33450, version: 'eca81478' },
    { width: 700, url: '/assets/character/cp3-700.webp', bytes: 71574, version: '6c47cfa4' },
  ],
  '/assets/character/cp4.webp': [
    { width: 400, url: '/assets/character/cp4-400.webp', bytes: 46814, version: '509fe65d' },
    { width: 700, url: '/assets/character/cp4-700.webp', bytes: 121014, version: '8649d888' },
  ],
  '/assets/character/cp5.webp': [
    { width: 400, url: '/assets/character/cp5-400.webp', bytes: 35552, version: 'e0274906' },
    { width: 700, url: '/assets/character/cp5-700.webp', bytes: 74006, version: 'e8926842' },
  ],
  '/assets/character/cp6.webp': [
    { width: 400, url: '/assets/character/cp6-400.webp', bytes: 26266, version: 'b8829d8f' },
    { width: 700, url: '/assets/character/cp6-700.webp', bytes: 52646, version: '18d757b7' },
  ],
  '/assets/character/cp7.webp': [
    { width: 400, url: '/assets/character/cp7-400.webp', bytes: 29716, version: '2b32644b' },
    { width: 700, url: '/assets/character/cp7-700.webp', bytes: 61470, version: 'f4381f76' },
  ],
  '/assets/character/cp8.webp': [
    { width: 400, url: '/assets/character/cp8-400.webp', bytes: 34484, version: '97a7860d' },
    { width: 700, url: '/assets/character/cp8-700.webp', bytes: 68146, version: '65d8e164' },
  ],
  '/assets/ip/ip1.webp': [
    { width: 360, url: '/assets/ip/ip1-360.webp', bytes: 31658, version: '9f584fad' },
    { width: 640, url: '/assets/ip/ip1-640.webp', bytes: 74478, version: '1f65c946' },
  ],
  '/assets/ppt/pp1.webp': [
    { width: 480, url: '/assets/ppt/pp1-480.webp', bytes: 30680, version: 'b8463718' },
    { width: 900, url: '/assets/ppt/pp1-900.webp', bytes: 74378, version: '96fcd009' },
  ],
  '/assets/ppt/pp2.webp': [
    { width: 480, url: '/assets/ppt/pp2-480.webp', bytes: 32106, version: 'f238a08e' },
    { width: 900, url: '/assets/ppt/pp2-900.webp', bytes: 76406, version: 'ad1b5324' },
  ],
  '/assets/ppt/pp3.webp': [
    { width: 480, url: '/assets/ppt/pp3-480.webp', bytes: 18810, version: 'e54f6b6d' },
    { width: 900, url: '/assets/ppt/pp3-900.webp', bytes: 40166, version: '5994af19' },
  ],
  '/assets/xhs/x1.webp': [
    { width: 400, url: '/assets/xhs/x1-400.webp', bytes: 37424, version: 'a46bd5f1' },
    { width: 700, url: '/assets/xhs/x1-700.webp', bytes: 79258, version: '7cf988e2' },
  ],
  '/assets/xhs/x2.webp': [
    { width: 400, url: '/assets/xhs/x2-400.webp', bytes: 40222, version: '5a165f6b' },
    { width: 700, url: '/assets/xhs/x2-700.webp', bytes: 81646, version: '113541aa' },
  ],
  '/assets/xhs/x3.webp': [
    { width: 400, url: '/assets/xhs/x3-400.webp', bytes: 37308, version: '2464bc05' },
    { width: 700, url: '/assets/xhs/x3-700.webp', bytes: 78458, version: '4c1a7d9d' },
  ],
  '/assets/xhs/x4.webp': [
    { width: 400, url: '/assets/xhs/x4-400.webp', bytes: 36378, version: 'f43f907a' },
    { width: 700, url: '/assets/xhs/x4-700.webp', bytes: 73922, version: '56ba7db0' },
  ],
  '/assets/xhs/x5.webp': [
    { width: 400, url: '/assets/xhs/x5-400.webp', bytes: 40308, version: '83221e13' },
    { width: 700, url: '/assets/xhs/x5-700.webp', bytes: 82326, version: 'e572b66a' },
  ],
  '/assets/xhs/x6.webp': [
    { width: 400, url: '/assets/xhs/x6-400.webp', bytes: 40656, version: '2fd5b5f1' },
    { width: 700, url: '/assets/xhs/x6-700.webp', bytes: 83968, version: 'ef11b92e' },
  ],
  '/assets/xhs/x7.webp': [
    { width: 400, url: '/assets/xhs/x7-400.webp', bytes: 32692, version: '6577bc82' },
    { width: 700, url: '/assets/xhs/x7-700.webp', bytes: 66406, version: '4c31426a' },
  ],
  '/assets/xhs/x8.webp': [
    { width: 400, url: '/assets/xhs/x8-400.webp', bytes: 41966, version: '66f36cb0' },
    { width: 700, url: '/assets/xhs/x8-700.webp', bytes: 86916, version: '2db1dd75' },
  ],
  '/assets/xhs/x9.webp': [
    { width: 400, url: '/assets/xhs/x9-400.webp', bytes: 34444, version: '4e1a06da' },
    { width: 700, url: '/assets/xhs/x9-700.webp', bytes: 72812, version: '6b809694' },
  ],
  '/assets/study/ss1.webp': [
    { width: 480, url: '/assets/study/ss1-480.webp', bytes: 30422, version: '8ccfecb5' },
    { width: 900, url: '/assets/study/ss1-900.webp', bytes: 84662, version: 'bf7fcf20' },
  ],
  '/assets/study/ss2.webp': [
    { width: 480, url: '/assets/study/ss2-480.webp', bytes: 20670, version: '37e252b0' },
    { width: 900, url: '/assets/study/ss2-900.webp', bytes: 55968, version: '261822f1' },
  ],
  '/assets/font/f1.webp': [
    { width: 360, url: '/assets/font/f1-360.webp', bytes: 8690, version: '4ec2db67' },
    { width: 640, url: '/assets/font/f1-640.webp', bytes: 14554, version: '110beac6' },
  ],
  '/assets/font/f2.webp': [
    { width: 360, url: '/assets/font/f2-360.webp', bytes: 12366, version: 'fff75535' },
    { width: 640, url: '/assets/font/f2-640.webp', bytes: 21756, version: '948ad977' },
  ],
  '/assets/font/f3.webp': [
    { width: 360, url: '/assets/font/f3-360.webp', bytes: 7032, version: '077b4561' },
    { width: 640, url: '/assets/font/f3-640.webp', bytes: 15146, version: '82a36508' },
  ],
  '/assets/font/f4.webp': [
    { width: 360, url: '/assets/font/f4-360.webp', bytes: 19286, version: '8d90d89e' },
    { width: 640, url: '/assets/font/f4-640.webp', bytes: 46098, version: 'ca3f9c45' },
  ],
  '/assets/pkg/pk1.webp': [
    { width: 480, url: '/assets/pkg/pk1-480.webp', bytes: 45622, version: 'cc4da423' },
    { width: 900, url: '/assets/pkg/pk1-900.webp', bytes: 132772, version: '2dae0a87' },
  ],
  '/assets/pkg/pk2.webp': [
    { width: 480, url: '/assets/pkg/pk2-480.webp', bytes: 45948, version: '9b640224' },
    { width: 900, url: '/assets/pkg/pk2-900.webp', bytes: 128290, version: '0c28176c' },
  ],
  '/assets/cover/baoli.webp': [
    { width: 480, url: '/assets/cover/baoli-480.webp', bytes: 34396, version: '850891af' },
    { width: 640, url: '/assets/cover/baoli-640.webp', bytes: 47874, version: 'af790993' },
    { width: 960, url: '/assets/cover/baoli-960.webp', bytes: 73288, version: 'b7e62802' },
  ],
  '/assets/cover/coffee.webp': [
    { width: 480, url: '/assets/cover/coffee-480.webp', bytes: 9884, version: '8df54a37' },
    { width: 640, url: '/assets/cover/coffee-640.webp', bytes: 15000, version: '971a4c8d' },
    { width: 960, url: '/assets/cover/coffee-960.webp', bytes: 27670, version: '1f074ddb' },
  ],
  '/assets/cover/drama.webp': [
    { width: 480, url: '/assets/cover/drama-480.webp', bytes: 11226, version: 'c5e2e458' },
    { width: 640, url: '/assets/cover/drama-640.webp', bytes: 15742, version: '362495d6' },
    { width: 960, url: '/assets/cover/drama-960.webp', bytes: 25030, version: '17ed5bed' },
  ],
  '/assets/cover/pv1.webp': [
    { width: 480, url: '/assets/cover/pv1-480.webp', bytes: 9736, version: '07e0a8dd' },
    { width: 640, url: '/assets/cover/pv1-640.webp', bytes: 14140, version: '7da7ebea' },
    { width: 960, url: '/assets/cover/pv1-960.webp', bytes: 23284, version: '25893e5d' },
  ],
  '/assets/cover/pv2.webp': [
    { width: 480, url: '/assets/cover/pv2-480.webp', bytes: 9742, version: 'be84e6f4' },
    { width: 640, url: '/assets/cover/pv2-640.webp', bytes: 14014, version: 'b6e991d8' },
    { width: 960, url: '/assets/cover/pv2-960.webp', bytes: 22412, version: 'ad353bf8' },
  ],
  '/assets/cover/wechat.webp': [
    { width: 480, url: '/assets/cover/wechat-480.webp', bytes: 14812, version: '27c25d07' },
    { width: 640, url: '/assets/cover/wechat-640.webp', bytes: 27566, version: 'b7c8c14e' },
    { width: 960, url: '/assets/cover/wechat-960.webp', bytes: 59956, version: '227ddc04' },
  ],
}

/** 作品页资源：非首屏阻塞 */
const WORK_ASSETS: AssetEntry[] = [
  lazyAsset('poster.ad1', '/assets/posters/ad1.webp', 'work.poster', 69536, '56a2519d'),
  lazyAsset('poster.ad2', '/assets/posters/ad2.webp', 'work.poster', 140272, '7b95e84b'),
  lazyAsset('poster.ad3', '/assets/posters/ad3.webp', 'work.poster', 59252, 'dff754d0'),
  lazyAsset('poster.ad4', '/assets/posters/ad4.webp', 'work.poster', 86860, '869dbccb'),
  lazyAsset('poster.ad5', '/assets/posters/ad5.webp', 'work.poster', 55544, '51c4988b'),
  lazyAsset('poster.ad6', '/assets/posters/ad6.webp', 'work.poster', 67274, '959ee7d9'),
  lazyAsset('poster.ad7', '/assets/posters/ad7.webp', 'work.poster', 51584, '893ffb3b'),
  lazyAsset('poster.ad8', '/assets/posters/ad8.webp', 'work.poster', 54356, 'be0cdce1'),
  lazyAsset('poster.ad9', '/assets/posters/ad9.webp', 'work.poster', 51624, 'da04be32'),
  lazyAsset('poster.ad10', '/assets/posters/ad10.webp', 'work.poster', 59034, '40b38da0'),
  lazyAsset('poster.ad11', '/assets/posters/ad11.webp', 'work.poster', 44588, 'b54c7c02'),
  lazyAsset('poster.ad12', '/assets/posters/ad12.webp', 'work.poster', 47764, 'f6cc961a'),
  lazyAsset('poster.ad13', '/assets/posters/ad13.webp', 'work.poster', 43708, '1f0bbefd'),
  lazyAsset('poster.ad14', '/assets/posters/ad14.webp', 'work.poster', 301364, '264d265f'),
  lazyAsset('poster.ad15', '/assets/posters/ad15.webp', 'work.poster', 313500, 'cb1201c5'),
  lazyAsset('poster.ad16', '/assets/posters/ad16.webp', 'work.poster', 48898, '8968e681'),
  lazyAsset('poster.ad17', '/assets/posters/ad17.webp', 'work.poster', 44438, '96834a88'),

  lazyAsset('ppt.pp1', '/assets/ppt/pp1.webp', 'work.ppt', 94664, 'caf5df5e'),
  lazyAsset('ppt.pp2', '/assets/ppt/pp2.webp', 'work.ppt', 82532, '41946248'),
  lazyAsset('ppt.pp3', '/assets/ppt/pp3.webp', 'work.ppt', 59134, 'c95b1855'),

  lazyAsset('photo.p1', '/assets/photo/p1.webp', 'work.photo', 75434, '7e55d9f2'),
  lazyAsset('photo.p2', '/assets/photo/p2.webp', 'work.photo', 88476, 'd1e3eb9b'),
  lazyAsset('photo.p3', '/assets/photo/p3.webp', 'work.photo', 148670, '74a8b649'),
  lazyAsset('photo.p4', '/assets/photo/p4.webp', 'work.photo', 61858, 'f4e0e558'),
  lazyAsset('photo.p5', '/assets/photo/p5.webp', 'work.photo', 136288, '9a501b9a'),
  lazyAsset('photo.p6', '/assets/photo/p6.webp', 'work.photo', 53832, '7c14d0ad'),
  lazyAsset('photo.p7', '/assets/photo/p7.webp', 'work.photo', 32364, 'cab18108'),
  lazyAsset('photo.p8', '/assets/photo/p8.webp', 'work.photo', 61278, 'db5ce667'),
  lazyAsset('photo.p9', '/assets/photo/p9.webp', 'work.photo', 237118, 'd5b227a1'),

  lazyAsset('cover.baoli', '/assets/cover/baoli.webp', 'work.cover', 138712, '915b70bc'),
  lazyAsset('cover.coffee', '/assets/cover/coffee.webp', 'work.cover', 93228, '05c9bfa9'),
  lazyAsset('cover.drama', '/assets/cover/drama.webp', 'work.cover', 63816, 'c2b35052'),
  lazyAsset('cover.pv1', '/assets/cover/pv1.webp', 'work.cover', 51286, 'c8a696ad'),
  lazyAsset('cover.pv2', '/assets/cover/pv2.webp', 'work.cover', 55314, '803b87d2'),
  lazyAsset('cover.wechat', '/assets/cover/wechat.webp', 'work.cover', 229136, '7840b9cd'),

  lazyAsset('character.cp1', '/assets/character/cp1.webp', 'work.character', 96132, '4014d0d0'),
  lazyAsset('character.cp2', '/assets/character/cp2.webp', 'work.character', 98242, 'a5f6f7ed'),
  lazyAsset('character.cp3', '/assets/character/cp3.webp', 'work.character', 91464, '3f7e986a'),
  lazyAsset('character.cp4', '/assets/character/cp4.webp', 'work.character', 155600, 'cf506d01'),
  lazyAsset('character.cp5', '/assets/character/cp5.webp', 'work.character', 94640, 'ad508a08'),
  lazyAsset('character.cp6', '/assets/character/cp6.webp', 'work.character', 67652, '36a57a24'),
  lazyAsset('character.cp7', '/assets/character/cp7.webp', 'work.character', 79630, '46a93c0e'),
  lazyAsset('character.cp8', '/assets/character/cp8.webp', 'work.character', 85936, 'cd0743cb'),

  lazyAsset('ip.ip1', '/assets/ip/ip1.webp', 'work.ip', 772702, '3f9c9fd8'),

  lazyAsset('xhs.x1', '/assets/xhs/x1.webp', 'work.xhs', 175132, '7ea90878'),
  lazyAsset('xhs.x2', '/assets/xhs/x2.webp', 'work.xhs', 177826, '3f3763fd'),
  lazyAsset('xhs.x3', '/assets/xhs/x3.webp', 'work.xhs', 170658, '0ab779d7'),
  lazyAsset('xhs.x4', '/assets/xhs/x4.webp', 'work.xhs', 156598, '6b5c1322'),
  lazyAsset('xhs.x5', '/assets/xhs/x5.webp', 'work.xhs', 177652, '0c8be123'),
  lazyAsset('xhs.x6', '/assets/xhs/x6.webp', 'work.xhs', 182506, 'f1dbe253'),
  lazyAsset('xhs.x7', '/assets/xhs/x7.webp', 'work.xhs', 141606, '8dbef2cf'),
  lazyAsset('xhs.x8', '/assets/xhs/x8.webp', 'work.xhs', 185366, '4e2b0710'),
  lazyAsset('xhs.x9', '/assets/xhs/x9.webp', 'work.xhs', 154812, 'bae60959'),

  lazyAsset('font.f1', '/assets/font/f1.webp', 'work.font', 24244, '727db485'),
  lazyAsset('study.ss1', '/assets/study/ss1.webp', 'work.study', 127012, '8bac43b8'),
  lazyAsset('study.ss2', '/assets/study/ss2.webp', 'work.study', 90926, '43d25fa3'),
  lazyAsset('font.f2', '/assets/font/f2.webp', 'work.font', 26612, 'a5e10084'),
  lazyAsset('font.f3', '/assets/font/f3.webp', 'work.font', 31596, '396940d1'),
  lazyAsset('font.f4', '/assets/font/f4.webp', 'work.font', 70440, '34a1d0de'),

  lazyAsset('pkg.pk1', '/assets/pkg/pk1.webp', 'work.pkg', 930134, '1cc50313'),
  lazyAsset('pkg.pk2', '/assets/pkg/pk2.webp', 'work.pkg', 1048688, '5d8ae9bf'),
]

/** 全站资源清单 */
export const ASSET_MANIFEST: readonly AssetEntry[] = [
  ...HERO_PROPS,
  ...HERO_DECALS,
  TYPE_STAGE,
  ...WORK_ASSETS,
]

/** 首屏阻塞资源：只有 Hero 真正采样的纹理 + 字体阶段 */
export const BLOCKING_ASSETS: readonly AssetEntry[] = ASSET_MANIFEST.filter((a) => a.blocking)

/** 需要在 index.html 里 <link rel="preload"> 的资源 */
export const PRELOAD_ASSETS: readonly AssetEntry[] = ASSET_MANIFEST.filter((a) => a.preload)

export const ASSETS_BY_ID: ReadonlyMap<string, AssetEntry> = new Map(
  ASSET_MANIFEST.map((a) => [a.id, a]),
)

export function assetsInGroup(group: AssetGroup): AssetEntry[] {
  return ASSET_MANIFEST.filter((a) => a.group === group)
}

/**
 * 各栏目的派生档位宽度，从清单实际登记的变体反推。
 * imageSources.ts 目前自己硬编码了一份同样的宽度表；以清单为准，
 * 两边不一致时开发期的 auditWorkImageSources() 会点名。
 */
export const VARIANT_WIDTHS: Readonly<Partial<Record<AssetGroup, readonly number[]>>> =
  ASSET_MANIFEST.reduce<Partial<Record<AssetGroup, readonly number[]>>>((acc, a) => {
    if (a.variants.length > 0 && acc[a.group] === undefined) {
      acc[a.group] = a.variants.map((v) => v.width)
    }
    return acc
  }, {})

/** 清单里登记的全部文件数（原图 + 派生档位） */
export const ASSET_FILE_COUNT = ASSET_MANIFEST.reduce(
  (n, a) => n + (a.kind === 'image' ? 1 + a.variants.length : 0),
  0,
)

const BLOCKING_BYTES = BLOCKING_ASSETS.reduce((n, a) => n + a.bytes, 0)

/* ============================================================================
 * 运行时：真实进度统计
 * ========================================================================== */

export type AssetStatus =
  | 'pending' // 尚未开始
  | 'loading' // 请求中
  | 'decoding' // 网络已完成，正在 decode()
  | 'ready' // 已 decode，可用于渲染
  | 'degraded' // 失败但允许放行
  | 'failed' // 失败且需要提示重试

export type AssetRuntime = {
  entry: AssetEntry
  status: AssetStatus
  attempts: number
  /** 请求完成耗时（毫秒） */
  netMs: number | null
  /** decode() 耗时（毫秒） */
  decodeMs: number | null
  error: string | null
}

export type LoadSnapshot = {
  /** 0–100 的真实进度，单调递增 */
  progress: number
  /** 所有阻塞资源都有了结果（成功、降级或失败） */
  settled: boolean
  /** settled 且没有需要提示的硬失败 */
  ok: boolean
  /** 正在重试中 */
  retrying: boolean
  /** 需要提示的失败项 */
  failed: readonly AssetRuntime[]
  /** 已经 ready 的阻塞项数量 */
  readyCount: number
  /** 阻塞项总数 */
  totalCount: number
  /** 从开始加载到现在（或到 settled）的毫秒数 */
  elapsedMs: number
  items: readonly AssetRuntime[]
}

/** 网络阶段在单项权重里占的比例，剩下的归 decode() */
const NET_SHARE = 0.55
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF = [350, 1_000]
/**
 * 首屏加载硬预算。到点仍未结算的项一律按各自的 onFail 就地结算，
 * 保证 Loader 无论如何都会在这个时间内走完 100%，不会永久卡住。
 */
const HARD_DEADLINE_MS = 12_000

const runtimes: AssetRuntime[] = BLOCKING_ASSETS.map((entry) => ({
  entry,
  status: 'pending',
  attempts: 0,
  netMs: null,
  decodeMs: null,
  error: null,
}))

/** 持有 Image 引用，避免解码结果在 DOM 用到之前被回收 */
const warmed: HTMLImageElement[] = []

const listeners = new Set<() => void>()
let startedAt = 0
let settledAt = 0
let progressFloor = 0
let retryingCount = 0
let snapshot: LoadSnapshot = buildSnapshot()
let loadPromise: Promise<LoadSnapshot> | null = null
/** 硬预算到点后置位，正在重试的项会就地停下，不再把状态拉回 loading */
let aborted = false

function isSettled(status: AssetStatus) {
  return status === 'ready' || status === 'degraded' || status === 'failed'
}

function statusShare(rt: AssetRuntime): number {
  switch (rt.status) {
    case 'pending':
      return 0
    case 'loading':
      return 0
    case 'decoding':
      return NET_SHARE
    default:
      // ready / degraded / failed 都算已结算，保证进度不会卡住
      return 1
  }
}

function buildSnapshot(): LoadSnapshot {
  let weighted = 0
  let readyCount = 0
  const failed: AssetRuntime[] = []
  let settled = true

  for (const rt of runtimes) {
    weighted += rt.entry.bytes * statusShare(rt)
    if (rt.status === 'ready') readyCount += 1
    if (rt.status === 'failed') failed.push(rt)
    if (rt.status === 'pending' || rt.status === 'loading' || rt.status === 'decoding') {
      settled = false
    }
  }

  const raw = BLOCKING_BYTES > 0 ? (weighted / BLOCKING_BYTES) * 100 : 100
  // 单调递增：显示值只允许往上走
  progressFloor = Math.max(progressFloor, Math.min(100, raw))

  return {
    progress: settled ? 100 : Math.min(99, progressFloor),
    settled,
    ok: settled && failed.length === 0,
    retrying: retryingCount > 0,
    failed,
    readyCount,
    totalCount: runtimes.length,
    elapsedMs: startedAt === 0 ? 0 : (settledAt || performance.now()) - startedAt,
    items: runtimes,
  }
}

function emit() {
  snapshot = buildSnapshot()
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** 加载一张图片：load 事件记网络耗时，decode() 完成才算真正可渲染 */
function warmImage(rt: AssetRuntime, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    warmed.push(img)
    img.decoding = 'async'
    // 透明物件图没有跨域需求，crossOrigin 留空以复用 <img> 的缓存键
    const t0 = performance.now()
    let done = false

    const timer = window.setTimeout(() => {
      if (done) return
      done = true
      img.src = ''
      reject(new Error(`超时 ${rt.entry.timeoutMs}ms`))
    }, rt.entry.timeoutMs)

    const fail = (msg: string) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      reject(new Error(msg))
    }

    img.onerror = () => fail('请求失败或不是可解码的图片')
    img.onload = () => {
      if (done) return
      rt.netMs = performance.now() - t0
      rt.status = 'decoding'
      emit()
      const t1 = performance.now()
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        rt.decodeMs = performance.now() - t1
        resolve()
      }
      // 部分浏览器对游离节点的 decode() 会抛 EncodingError，
      // 但 load 已成功说明位图可用，按成功处理即可。
      img.decode().then(finish, finish)
    }

    img.src = url
  })
}

/**
 * Loader 首屏真正用到的字面。
 * Ultra 是超粗板衬，回退栈里的 Playfair / serif 是细衬线，两者差距极大，
 * 换字的瞬间非常刺眼，所以必须点名等这一支。
 */
const CRITICAL_FACES = ['400 1em Ultra', '300 1em Inter']

function warmFonts(rt: AssetRuntime): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  const t0 = performance.now()
  rt.status = 'decoding'
  emit()
  // 只等 document.fonts.ready 是不够的：还没有任何字面进入待加载队列时它会立刻
  // resolve，于是这一格瞬间就满，但 Ultra 其实还在路上。先用 fonts.load() 把
  // 关键字面显式拉起来，再等整体 ready，这一格才代表真实状态。
  const load = Promise.all(CRITICAL_FACES.map((f) => document.fonts.load(f)))
    .then(() => document.fonts.ready)
    .then(() => undefined)
  return Promise.race([
    load,
    sleep(rt.entry.timeoutMs).then(() => {
      throw new Error(`字体未在 ${rt.entry.timeoutMs}ms 内就绪，使用回退字体栈`)
    }),
  ]).then(() => {
    rt.decodeMs = performance.now() - t0
  })
}

async function runOne(rt: AssetRuntime) {
  // 字体阶段本身已经带超时，重试没有意义，只会白白吃掉首屏预算
  const maxAttempts = rt.entry.decode === 'font-ready' ? 1 : MAX_ATTEMPTS

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (aborted) break
    rt.attempts = attempt
    rt.status = 'loading'
    rt.error = null
    emit()
    try {
      if (rt.entry.decode === 'font-ready') await warmFonts(rt)
      else await warmImage(rt, rt.entry.url)
      rt.status = 'ready'
      emit()
      return
    } catch (err) {
      rt.error = err instanceof Error ? err.message : String(err)
      if (attempt < maxAttempts && !aborted) {
        await sleep(RETRY_BACKOFF[attempt - 1] ?? 1_000)
        continue
      }
    }
  }

  // 重试用尽：先试 fallback，再按 onFail 决定是否需要提示用户
  if (!aborted && rt.entry.fallback && rt.entry.decode === 'img-decode') {
    try {
      await warmImage(rt, rt.entry.fallback)
      rt.status = 'degraded'
      emit()
      return
    } catch {
      /* fallback 也失败，继续往下 */
    }
  }
  if (isSettled(rt.status)) return
  rt.status = rt.entry.onFail === 'degrade' ? 'degraded' : 'failed'
  emit()
}

/** 硬预算到点：把还没结果的项就地结算，Loader 才不会无限等下去 */
function forceSettle() {
  aborted = true
  let changed = false
  for (const rt of runtimes) {
    if (isSettled(rt.status)) continue
    rt.error = rt.error ?? `超出首屏加载预算 ${HARD_DEADLINE_MS}ms`
    rt.status = rt.entry.onFail === 'degrade' ? 'degraded' : 'failed'
    changed = true
  }
  if (changed) emit()
}

/** 启动首屏阻塞资源加载（幂等，返回同一个 promise） */
export function startBlockingLoad(): Promise<LoadSnapshot> {
  if (loadPromise) return loadPromise
  startedAt = performance.now()
  emit()
  const watchdog = window.setTimeout(forceSettle, HARD_DEADLINE_MS)
  loadPromise = Promise.all(runtimes.map(runOne)).then(() => {
    window.clearTimeout(watchdog)
    settledAt = performance.now()
    emit()
    if (import.meta.env.DEV) {
      reportToConsole()
      void auditPreloadLinks()
      void auditWorkImageSources()
    }
    return snapshot
  })
  return loadPromise
}

/** 供后续状态机 await 的就绪 promise */
export function blockingAssetsReady(): Promise<LoadSnapshot> {
  return startBlockingLoad()
}

/** 重试所有硬失败项。进度保持在原位不回退，成功后错误态自动消失 */
export function retryFailedAssets(): void {
  const broken = runtimes.filter((rt) => rt.status === 'failed')
  if (broken.length === 0) return
  // 用户显式重试：解除硬预算，并给这批资源一个新的预算窗口
  aborted = false
  window.setTimeout(forceSettle, HARD_DEADLINE_MS)
  retryingCount += broken.length
  emit()
  for (const rt of broken) {
    void runOne(rt).finally(() => {
      retryingCount = Math.max(0, retryingCount - 1)
      emit()
    })
  }
}

/** 字体阶段的资源 ID */
export const FONT_STAGE_ID = 'type.display'

/**
 * 展示字体是否已经可以用来排版（含超时降级）。
 * Loader 用它决定 WELCOME 什么时候上屏，避免细衬线回退跳成 Ultra。
 */
export function isDisplayFontReady(snap: LoadSnapshot): boolean {
  const rt = snap.items.find((i) => i.entry.id === FONT_STAGE_ID)
  return rt === undefined || isSettled(rt.status)
}

/** React 订阅入口 */
export function useBlockingAssets(): LoadSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/* ============================================================================
 * 开发期报告
 * ========================================================================== */

function reportToConsole() {
  const rows = runtimes.map((rt) => ({
    id: rt.entry.id,
    状态: rt.status,
    分组: rt.entry.group,
    'KB': Math.round(rt.entry.bytes / 102.4) / 10,
    '网络ms': rt.netMs === null ? '-' : Math.round(rt.netMs),
    '解码ms': rt.decodeMs === null ? '-' : Math.round(rt.decodeMs),
    次数: rt.attempts,
    url: rt.entry.url,
  }))
  const bad = runtimes.filter((rt) => rt.status === 'failed' || rt.status === 'degraded')
  const total = Math.round(snapshot.elapsedMs)
  const net = Math.max(0, ...runtimes.map((r) => r.netMs ?? 0))
  const dec = Math.max(0, ...runtimes.map((r) => r.decodeMs ?? 0))

  console.groupCollapsed(
    `[assets] 首屏阻塞 ${snapshot.readyCount}/${snapshot.totalCount} ready · ` +
      `总耗时 ${total}ms · 最慢网络 ${Math.round(net)}ms · 最慢解码 ${Math.round(dec)}ms`,
  )
  console.table(rows)
  if (bad.length > 0) {
    console.warn(
      '[assets] 失败/降级资源：\n' +
        bad.map((rt) => `  ${rt.status.padEnd(8)} ${rt.entry.url}  ← ${rt.error}`).join('\n'),
    )
  }
  reportSizeDrift()
  console.groupEnd()
}

/**
 * 清单登记的体积/版本会随素材重新压制而过期，进度加权就会失真。
 * 用 Resource Timing 的真实 encodedBodySize 对账，偏差超过 5% 就点名，
 * 提示按文件头的命令重新生成 bytes 和 version。零额外请求。
 */
function reportSizeDrift() {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return
  const seen = new Map<string, number>()
  for (const e of performance.getEntriesByType('resource')) {
    const size = (e as PerformanceResourceTiming).encodedBodySize
    if (size > 0) seen.set(new URL(e.name, location.origin).pathname, size)
  }
  const drift: string[] = []
  const check = (url: string, bytes: number) => {
    const real = seen.get(url)
    if (real === undefined) return
    if (Math.abs(real - bytes) / bytes > 0.05) drift.push(`${url}  清单 ${bytes}B → 实际 ${real}B`)
  }
  for (const a of ASSET_MANIFEST) {
    if (a.kind !== 'image') continue
    check(a.url, a.bytes)
    // 派生档位也要对账：srcset 实际取的往往是变体而不是原图
    for (const v of a.variants) check(v.url, v.bytes)
  }
  if (drift.length > 0) {
    console.warn(
      '[assets] 清单登记体积已过期，请重新生成 bytes / version：\n  ' + drift.join('\n  '),
    )
  }
}

/**
 * 跨模块契约检查：imageSources.ts 的 workImage() 自己拼 srcset，
 * 那份宽度表和本清单是两处独立的真相，改了一处忘了另一处就会请求到 404。
 * 这里把它真实生成的每个 URL 拿来和清单对一遍。
 *
 * 用动态 import 是为了不把作品页模块拽进主包；生产构建里整段是死代码。
 */
async function auditWorkImageSources(): Promise<void> {
  try {
    const { workImage } = await import('../components/work/imageSources')
    const known = new Set<string>()
    for (const a of ASSET_MANIFEST) {
      known.add(a.url)
      for (const v of a.variants) known.add(v.url)
    }
    const missing: string[] = []
    for (const a of ASSET_MANIFEST) {
      const m = /^\/assets\/(photo|posters|ppt|character|ip|xhs|study|font|pkg|cover)\/([^/]+)\.webp$/.exec(a.url)
      if (!m) continue
      const dir = m[1] as Parameters<typeof workImage>[0]
      const { src, srcSet } = workImage(dir, m[2])
      const urls = [src, ...srcSet.split(',').map((x) => x.trim().split(/\s+/)[0])]
      for (const u of urls) {
        if (!known.has(u)) missing.push(`${u}  ← workImage('${dir}', '${m[2]}')`)
      }
    }
    if (missing.length > 0) {
      console.warn('[assets] imageSources 会请求清单里没有登记的档位：\n  ' + missing.join('\n  '))
    }
  } catch {
    /* 作品页模块不可用时跳过，这只是开发期的一致性检查 */
  }
}

/**
 * 校验 index.html 的 preload 与清单是否一致，并确认 URL 真的返回图片
 * （SPA fallback 会用 HTML 冒充 200）。
 */
export async function auditPreloadLinks(): Promise<void> {
  if (typeof document === 'undefined') return
  const declared = new Set(
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')).map(
      (l) => new URL(l.href, location.origin).pathname,
    ),
  )
  const expected = new Set(PRELOAD_ASSETS.map((a) => a.url))

  const missing = [...expected].filter((u) => !declared.has(u))
  const extra = [...declared].filter((u) => !expected.has(u))
  if (missing.length) console.warn('[preload] 清单里标了 preload 但 index.html 没写：', missing)
  if (extra.length) console.warn('[preload] index.html 多出的 preload（清单里没有）：', extra)

  const problems: string[] = []
  await Promise.all(
    [...declared].map(async (url) => {
      try {
        const res = await fetch(url, { method: 'GET', cache: 'force-cache' })
        const type = res.headers.get('content-type') ?? ''
        if (!res.ok) problems.push(`${url} → HTTP ${res.status}`)
        else if (!type.startsWith('image/')) problems.push(`${url} → content-type ${type}（疑似 SPA fallback 返回 HTML）`)
      } catch (err) {
        problems.push(`${url} → ${err instanceof Error ? err.message : String(err)}`)
      }
    }),
  )
  if (problems.length) console.error('[preload] 预加载 URL 校验失败：\n  ' + problems.join('\n  '))
  else console.info(`[preload] ${declared.size} 条预加载 URL 全部真实返回图片`)
}

/* 模块被引入即开始加载，不等任何组件挂载（「页面启动后立即挂载资源层」） */
if (typeof window !== 'undefined') void startBlockingLoad()
