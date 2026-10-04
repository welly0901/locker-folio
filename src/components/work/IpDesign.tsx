import { useEffect, useRef } from 'react'
import { IP_DESIGN } from '../../data/content'
import { releaseImages, SIZES, workImage } from './imageSources'

/** DESIGN › 03 IP DESIGN */
export default function IpDesign({ active }: { active: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)

  // 离开栏目时断开配图引用
  useEffect(() => {
    const root = rootRef.current
    return () => releaseImages(root)
  }, [])

  return (
    <div className="ip" data-active={active} ref={rootRef}>
      <div className="ip__copy">
        <span className="ip__kicker">{IP_DESIGN.kicker}</span>
        <h1 className="ip__title">{IP_DESIGN.title}</h1>
        {IP_DESIGN.desc.map((p) => (
          <p className="ip__desc" key={p.slice(0, 8)}>
            {p}
          </p>
        ))}

        <ul className="ip__specs">
          {IP_DESIGN.specs.map((s) => (
            <li key={s.k}>
              <span>{s.k}</span>
              <em>{s.v}</em>
            </li>
          ))}
        </ul>

        <div className="ip__swatches">
          {IP_DESIGN.swatches.map((s) => (
            <span key={s.name} className="ip__sw">
              <i style={{ background: s.hex }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <figure className="ip__visual">
        <img
          {...workImage('ip', 'ip1')}
          sizes={SIZES.ip}
          alt="HBN 品牌 IP 形象设计 · 晶透"
          decoding="async"
          draggable={false}
        />
      </figure>
    </div>
  )
}
