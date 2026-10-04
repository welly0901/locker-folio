/* ============================================================================
 * 几何构造小工具
 *
 * 柜体全部是程序化几何。为了守住「首屏 draw calls ≤ 35」的预算，
 * 同材质的板件在这里先合并成一条 BufferGeometry 再交给一只 mesh，
 * 而不是一块板一个 mesh。
 * ========================================================================== */

import type { BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type BoxSpec = {
  size: [number, number, number]
  /** 中心位置 */
  at: [number, number, number]
  /** 倒角半径，缺省按最短边自动取 2–5mm 视觉倒角 */
  radius?: number
  segments?: number
}

/** 造一块带倒角的板 */
export function roundedBox(spec: BoxSpec): BufferGeometry {
  const [w, h, d] = spec.size
  const r = spec.radius ?? Math.min(0.02, Math.min(w, h, d) * 0.34)
  const g = new RoundedBoxGeometry(w, h, d, spec.segments ?? 2, r)
  g.translate(spec.at[0], spec.at[1], spec.at[2])
  return g
}

/** 造一组板并合并成一条几何；调用方负责在卸载时 dispose */
export function mergeBoxes(specs: BoxSpec[]): BufferGeometry {
  const parts = specs.map(roundedBox)
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('mergeGeometries 失败：板件属性不一致')
  return merged
}
