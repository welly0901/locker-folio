import { lazy, Suspense } from 'react'
import { FOLDERS } from '../../data/content'
import { useStore, type WorkView } from '../../store'
import CloseButton from './CloseButton'
import './overlay.css'
import './folders.css'

const DesignView = lazy(() => import('../work/DesignView'))
const PhotographWall = lazy(() => import('../work/PhotographWall'))
const VideoList = lazy(() => import('../work/VideoList'))
const WebsiteCarousel = lazy(() => import('../work/WebsiteCarousel'))

/* 视频里四个文件夹的版位（相对 1320×724 底稿换算成百分比） */
const POS: Record<string, { l: number; t: number; w: number; h: number; rot: number }> = {
  video: { l: 16.7, t: 47.0, w: 19.3, h: 30.4, rot: -6 },
  design: { l: 33.0, t: 27.6, w: 29.2, h: 44.2, rot: -7 },
  photograph: { l: 55.3, t: 9.7, w: 23.1, h: 35.9, rot: 3 },
  website: { l: 51.0, t: 61.5, w: 28.5, h: 34.0, rot: 2 },
}

export default function WorkFolders() {
  const workView = useStore((s) => s.workView)
  const setWorkView = useStore((s) => s.setWorkView)

  if (workView) {
    return (
      <Suspense fallback={<div className="wv wv--loading" />}>
        {workView === 'design' && <DesignView />}
        {workView === 'photograph' && <PhotographWall />}
        {workView === 'video' && <VideoList />}
        {workView === 'website' && <WebsiteCarousel />}
      </Suspense>
    )
  }

  return (
    <div className="ov">
      <CloseButton />
      <div className="fw">
        <Star className="fw__star fw__star--yellow" points={12} color="#f6dc86" />
        <Star className="fw__star fw__star--lime" points={10} color="#dcc36a" />

        {FOLDERS.map((f, i) => {
          const p = POS[f.id]
          return (
            <button
              key={f.id}
              type="button"
              className="fold"
              aria-label={`${f.en.join(' ')} ${f.cn}`}
              onClick={() => setWorkView(f.id as WorkView)}
              style={
                {
                  left: `${p.l}%`,
                  top: `${p.t}%`,
                  width: `${p.w}%`,
                  height: `${p.h}%`,
                  zIndex: f.z,
                  '--rot': `${p.rot}deg`,
                  '--bg': f.bg,
                  '--fg': f.fg,
                  '--cnfg': f.cnFg,
                  animationDelay: `${0.06 * i}s`,
                } as React.CSSProperties
              }
            >
              <span className="fold__back" />
              <span className="fold__papers">
                <i />
                <i />
                <i />
              </span>
              <span className="fold__front">
                <span className="fold__en">
                  {f.en.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </span>
                <span className="fold__cn">{f.cn}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Star({ points, color, className }: { points: number; color: string; className?: string }) {
  const pts: string[] = []
  const n = points * 2
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? 50 : 30
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <polygon points={pts.join(' ')} fill={color} />
    </svg>
  )
}
