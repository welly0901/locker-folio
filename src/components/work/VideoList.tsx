import { useEffect, useRef } from 'react'
import { VIDEOS } from '../../data/content'
import BackToFolders from './BackToFolders'
import { releaseImages, SIZES, workImage } from './imageSources'
import './video.css'

/** SELECTED WORK › VIDEO 影像作品 */
export default function VideoList() {
  const rootRef = useRef<HTMLDivElement>(null)

  // 关闭栏目时断开封面图引用
  useEffect(() => {
    const root = rootRef.current
    return () => releaseImages(root)
  }, [])

  return (
    <div ref={rootRef} className="wv vl">
      <BackToFolders />
      <div className="vl__scroll">
        <div className="vl__inner">
          {VIDEOS.map((v) => (
            <article key={v.no} className="vl__item">
              <div className="vl__meta">
                <span className="vl__no">{v.no} ·</span>
                <h2 className="vl__title">{v.en}</h2>
                <p className="vl__cn">{v.cn}</p>
                <p className="vl__desc">{v.desc}</p>
              </div>
              <a
                className="vl__cover"
                href={v.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                <img
                  {...workImage('cover', v.cover)}
                  sizes={SIZES.video}
                  alt={`${v.en} 封面`}
                  loading="lazy"
                  decoding="async"
                />
                <span className="vl__play" aria-hidden>
                  <svg viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="19.2" stroke="#fff" strokeWidth="1.6" />
                    <path d="M16 12.6 28.4 20 16 27.4z" fill="#fff" />
                  </svg>
                </span>
              </a>
            </article>
          ))}
          <div className="vl__end">— END —</div>
        </div>
      </div>
    </div>
  )
}
