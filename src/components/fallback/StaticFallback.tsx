import type { ReactNode } from 'react'
import { NAV, SITE } from '../../data/content'
import { FALLBACK_REASON_TEXT, type FallbackReason } from './capabilities'
import './fallback.css'

export type NavId = (typeof NAV)[number]['id']

export type StaticFallbackProps = {
  /** 触发降级的原因，用于给用户一句解释；不传就不显示说明 */
  reason?: FallbackReason | null
  /**
   * 静态柜体图（应当是同一 3D 场景的预渲染图）。
   * 不传时渲染一个 CSS 占位块，并明确标注「预渲染图待补」。
   */
  image?: string
  imageAlt?: string
  /** 点击内容入口。不传时入口仍可聚焦，但不产生跳转 */
  onSelect?: (id: NavId) => void
  /** 当前已打开的入口，用于 aria-current 与选中态 */
  activeId?: NavId | null
  /** 额外插槽：可以把浮层宿主、表单或其它入口塞进来 */
  children?: ReactNode
}

/**
 * 无 WebGL / Save-Data / 低性能设备下的静态首屏。
 *
 * 刻意做成完全自足的展示组件：不读 store、不引 Scene，
 * 由调用方决定挂载时机和点击行为。接线示例见 index.ts 的注释。
 */
export default function StaticFallback({
  reason = null,
  image,
  imageAlt = '柜体静态预览图',
  onSelect,
  activeId = null,
  children,
}: StaticFallbackProps) {
  return (
    <section className="fb" aria-label="静态版本首屏">
      <div className="fb__inner">
        <figure className="fb__figure">
          {image ? (
            <img className="fb__image" src={image} alt={imageAlt} />
          ) : (
            <FallbackPlaceholder />
          )}
        </figure>

        <div className="fb__panel">
          <p className="fb__kicker u-mono-label">{SITE.tagline}</p>
          <h1 className="fb__title">{SITE.owner}</h1>
          {reason && (
            <p className="fb__note">
              {FALLBACK_REASON_TEXT[reason]}，已切换到静态版本。下面的入口全部可用。
            </p>
          )}

          <nav className="fb__nav" aria-label="内容入口">
            <ul className="fb__list">
              {NAV.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="fb__entry"
                    data-active={activeId === n.id}
                    aria-current={activeId === n.id ? 'true' : undefined}
                    onClick={() => onSelect?.(n.id)}
                  >
                    <span className="fb__entry-label">{n.label}</span>
                    <span className="fb__entry-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {children}
    </section>
  )
}

/**
 * 占位柜体：真正的场景预渲染图要等 3D 场景稳定后才能出，
 * 这里先用纯色块拼一个可辨认的柜体轮廓，并显式标注它是占位。
 */
function FallbackPlaceholder() {
  return (
    <div className="fb__ph" role="img" aria-label="柜体静态预览图占位">
      <div className="fb__ph-body">
        <span className="fb__ph-door" />
        <span className="fb__ph-door fb__ph-door--open" />
        <span className="fb__ph-door" />
      </div>
      <p className="fb__ph-caption u-mono-label">STATIC PREVIEW · 场景预渲染图待补</p>
    </div>
  )
}
