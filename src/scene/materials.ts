/* ============================================================================
 * 场景材质
 *
 * 统一 Metallic-Roughness：柜体是烤漆金属，低 metalness、中等 roughness，
 * 高光靠主光和半球光形成，不在贴图里画高光。
 * 颜色取自 参考画面 的采样，再按 ACES 色调映射
 * 与曝光 1.06 反推回 albedo。
 * ========================================================================== */

export const PALETTE = {
  /** 门面：奶油米白（参考闭合柜门 #e8e0d2） */
  door: '#e8e0d2',
  /** 门内侧：比外侧再亮一点的暖白 */
  doorInner: '#f0e9db',
  /** 柜壳与立柱：摩卡棕（参考框架 #8a6a50） */
  frame: '#8a6a50',
  /** 顶盖：受光最足的浅摩卡 */
  cap: '#9a7d62',
  /** 底座 */
  plinth: '#7d6148',
  /** 柜腔内壁：暖灰褐（灰米色调），深处靠 AO 压暗 */
  cavity: '#71685a',
  /** 柜腔后壁比侧壁亮一点，避免整腔糊成一块 */
  cavityBack: '#7e7566',
  /** 隔板：暖灰 */
  shelf: '#a1937e',
  /** 把手底板（深棕，处在阴影里） */
  handlePlate: '#6f5642',
  /** 把手深棕嵌条 */
  handleGrip: '#5a4535',
  /** 通风槽底衬：槽与槽之间那条暗色 */
  ventBack: '#6b5140',
} as const

/** 柜体烤漆的通用参数 */
export const PAINT = { roughness: 0.52, metalness: 0.08 } as const
/** 柜腔内壁：更哑，避免内部出现不该有的反光 */
export const MATTE = { roughness: 0.82, metalness: 0.02 } as const
/** 把手：金属感稍强 */
export const METAL = { roughness: 0.36, metalness: 0.42 } as const
