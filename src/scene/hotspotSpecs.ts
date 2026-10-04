/* ============================================================================
 * 柜内热点
 *
 * ── 点击与拖拽共用真实物件 ──────────────────────────────────
 * 可移动实体自己处理 5px 阈值后的拖拽与阈值内点击，避免额外透明 hit mesh
 * 在 pointerdown 阶段盖住邻近物件。这里的 `size` 只控制 hover / focus 圆环，
 * 不再参与射线命中；键盘入口仍由每个热点的真实 HTML button 提供。
 *
 * ── 44×44 是怎么保证的 ──────────────────────────────────────
 * 触控目标不能小于 44×44px。热点在 3D 里，屏幕尺寸随镜头变，
 * 所以按**稳定态的机位**（自动推近终点 ABOUT_POSE）反算了一遍：
 *
 * | 热点 | 命中框投影 | 屏幕中心 |
 * |---|---|---|
 * | SKILLS 唱片机 | 227 × 282 px | (494, 244) |
 * | SELECTED WORK 文件盒 | 245 × 223 px | (544, 468) |
 * | CONTACT 打字机 | 307 × 232 px | (738, 794) |
 * | ABOUT 工牌 | 见下 | (736, 156) |
 *
 * 全部远超 44×44。打字机的中心落在画幅下方之外（稳定态镜头已经推到 About 近景，
 * 参考里打字机也只露出下半截），但命中框顶部仍在画内约 46px，
 * 键盘与顶部导航都能进同一个入口，不依赖它露出多少。
 *
 * 命中框刻意比工牌轮廓大一圈：贴着轮廓做命中区的话，ABOUT 只有 23×63。
 * ========================================================================== */

import type { Overlay } from '../store'

export type HotspotId = Exclude<Overlay, null>

export type HotspotSpec = {
  id: HotspotId
  /** 无障碍名。与顶部导航一致，读屏念出来是同一个入口 */
  label: string
  /** hover / focus 时浮出的中文说明 */
  caption: string
  /**
   * 命中框中心。
   * `frame: 'world'` 用世界坐标；`'door2inner'` 用第 2 扇门内侧内容组的局部坐标，
   * `'door1face'` 用第 1 扇关闭门的门面内容组局部坐标（该组无旋转，
   * 与世界只差平移）。这样门转到哪它跟到哪，不需要每帧同步 —— 热点是绑在模型节点上的。
   */
  at: readonly [number, number, number]
  frame: 'world' | 'door2inner' | 'door1face'
  /** 反馈圆环的世界尺寸；指针命中使用对应真实物件 */
  size: readonly [number, number]
  /** 局部镜头聚焦时希望在画面里占到的世界高度，用来反算机位距离 */
  focusHeight: number
  /**
   * 聚焦取景方向。缺省沿「当前机位 → 锚点」直推；
   * `'surface'` 改成沿承载面法线**正对**过去 —— 门斜着的时候直推会得到一个
   * 斜面，参考点开工牌是正面近景。
   */
  focusFacing?: 'surface'
  /** 文字标签相对命中框中心的偏移，避免标签落到画幅外 */
  labelOffset?: readonly [number, number, number]
}

export const HOTSPOTS: readonly HotspotSpec[] = [
  {
    id: 'projects',
    label: 'PROJECTS 项目经历',
    caption: '项目经历',
    // 上层隔板书堆：dragRoot [-0.51, 2.175, -0.085] + offset [0.02, 0.24, 0.1]
    at: [-0.49, 2.415, 0.015],
    frame: 'world',
    size: [0.82, 0.52],
    focusHeight: 0.72,
  },
  {
    id: 'skills',
    label: 'SKILLS 个人技能',
    caption: '个人技能',
    at: [-0.522, 1.705, 0.03],
    frame: 'world',
    size: [0.72, 0.9],
    focusHeight: 0.95,
  },
  {
    id: 'work',
    label: 'SELECTED WORK 作品展示',
    caption: '作品展示',
    at: [-0.37, 0.972, -0.04],
    frame: 'world',
    size: [0.8, 0.74],
    focusHeight: 0.8,
  },
  {
    id: 'contact',
    label: 'CONTACT 联系',
    caption: '联系方式',
    // 打字机现在磁吸在第 2 扇门内侧，热点也必须继承同一个铰链坐标系。
    // 这是稳定态的局部后备坐标；拖拽后会由 movingHotspotAnchor 实时覆盖。
    at: [0.015, -0.99, 0.248],
    frame: 'door2inner',
    size: [0.8, 0.62],
    focusHeight: 0.7,
  },
  {
    id: 'about',
    label: 'ABOUT 基本信息',
    caption: '基本信息',
    // 工牌贴在第 2 扇门内侧：门面百分比 left 26% / top 18% / width 38%
    // 换算成内容组局部坐标（贴片高度由图集里的宽高比 0.5658 算出）
    // z 取负值：命中框在贴花**后面**（贴花层在 0…0.012，门内侧面在 −0.0045）。
    // 这样指针先命中工牌本体、可以拖，落在工牌轮廓外那一圈
    // 才由命中框接住 —— 两条路都通到同一个入口（hotspotActions）。
    at: [-0.0462, 0.553, -0.002],
    frame: 'door2inner',
    size: [0.46, 0.74],
    focusHeight: 0.66,
    // 工牌贴在门内侧：正对那面推近，而不是从当前角度斜着怼上去
    focusFacing: 'surface',
  },
  {
    id: 'awards',
    label: 'AWARDS 荣誉奖项',
    caption: '荣誉奖项',
    // 海报磁吸在第 1 扇关闭门的门面上，与 Props 里 POSTER 的 position 同源；
    // 运行时锚点由 PhysicalItem 注册的实时坐标覆盖，这里只是首帧后备。
    at: [0.035, 0.79, 0.016],
    frame: 'door1face',
    size: [0.58, 0.8],
    focusHeight: 1,
    // 关闭门正面朝镜头，仍显式要求正对推近
    focusFacing: 'surface',
  },
]
