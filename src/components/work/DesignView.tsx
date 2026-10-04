import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import BackToFolders from './BackToFolders'
import PostersDeck from './PostersDeck'
import PptDesign from './PptDesign'
import CharacterPoster from './CharacterPoster'
import IpDesign from './IpDesign'
import XhsCover from './XhsCover'
import StudySheetDesign from './StudySheetDesign'
import FontDesign from './FontDesign'
import PackagingDesign from './PackagingDesign'
import './design.css'

const SECTIONS = ['posters', 'ppt', 'character', 'ip', 'xhs', 'study', 'font', 'pkg'] as const

/** SELECTED WORK › DESIGN —— 八段式：海报 / PPT / 角色海报 / IP / 小红书封面 / 学习单 / 字体 / 包装 */
export default function DesignView() {
  const [sec, setSec] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)
  const lock = useRef(false)
  const [chromeHost, setChromeHost] = useState<HTMLDivElement | null>(null)

  /* 返回按钮与导航点的独立层：FONT DESIGN 通过 body 下的全屏层渲染，
     这些 chrome 元素必须挂到更高的层级才不会被盖住。 */
  useLayoutEffect(() => {
    const el = document.createElement('div')
    el.className = 'dv__chrome'
    document.body.appendChild(el)
    setChromeHost(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [])

  const goto = useCallback((i: number) => {
    const n = Math.max(0, Math.min(SECTIONS.length - 1, i))
    setSec(n)
    lock.current = true
    window.setTimeout(() => {
      lock.current = false
    }, 950)
  }, [])

  /* 整页纵向切换：滚轮 / 键盘。海报段的横向滚轮交由内部消费 */
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // 图片放大层打开时，滚轮完全留给放大层（避免误切整页段落）
      if (document.querySelector('.ppt__lightbox, .pkg__lightbox, .ss__lightbox')) return
      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)
      // 横向占优时始终留给当前作品组件；即使光标落在页点或底部按钮上，
      // 斜向触控板手势也不能误触发整页纵向切换。
      if (absY <= absX) return
      if ((e.target as HTMLElement)?.closest('[data-hscroll]')) {
        if (absY < 26) return
      }
      if (lock.current || absY < 14) return
      // PPT 等内部纵向滚动的栏目：未到边界时把滚轮留给组件自身
      const vscroll = (e.target as HTMLElement)?.closest<HTMLElement>('[data-vscroll]')
      if (vscroll) {
        const goingDown = e.deltaY > 0
        const atEnd = goingDown
          ? vscroll.scrollTop + vscroll.clientHeight >= vscroll.scrollHeight - 2
          : vscroll.scrollTop <= 2
        if (!atEnd) return
      }
      goto(sec + (e.deltaY > 0 ? 1 : -1))
    }
    const onKey = (e: KeyboardEvent) => {
      // FONT DESIGN 展开 detail stack 时，方向键留给内部浏览
      if (document.querySelector('.fd[data-mode="detail"]')) return
      // 图片放大层打开时，段落切换键无效（放大层自己处理左右切换 / Esc）
      if (document.querySelector('.ppt__lightbox, .pkg__lightbox, .ss__lightbox')) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') goto(sec + 1)
      if (e.key === 'ArrowUp' || e.key === 'PageUp') goto(sec - 1)
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [sec, goto])

  return (
    <div className="wv dv">
      <span className="dv__index">
        {String(sec + 1).padStart(2, '0')} /
      </span>

      <div ref={railRef} className="dv__rail" style={{ transform: `translateY(${-sec * 100}%)` }}>
        <section className="dv__sec">
          <PostersDeck active={sec === 0} />
        </section>
        <section className="dv__sec">
          <PptDesign active={sec === 1} />
        </section>
        <section className="dv__sec">
          <CharacterPoster active={sec === 2} />
        </section>
        <section className="dv__sec">
          <IpDesign active={sec === 3} />
        </section>
        <section className="dv__sec">
          <XhsCover active={sec === 4} />
        </section>
        <section className="dv__sec">
          <StudySheetDesign active={sec === 5} />
        </section>
        <section className="dv__sec">
          <FontDesign active={sec === 6} onNext={() => goto(7)} />
        </section>
        <section className="dv__sec">
          <PackagingDesign active={sec === 7} />
        </section>
      </div>

      {sec < SECTIONS.length - 1 && (
        <div className="wv__foot">
          <button
            type="button"
            className="wv__jump"
            onClick={() => goto(sec + 1)}
          >
            {sec === 0
              ? 'VIEW PPT DESIGN'
              : sec === 1
                ? 'VIEW CHARACTER POSTER'
                : sec === 2
                  ? 'VIEW IP DESIGN'
                  : sec === 3
                    ? 'VIEW XIAOHONGSHU COVER'
                    : sec === 4
                      ? 'VIEW STUDY SHEET DESIGN'
                      : sec === 5
                        ? 'VIEW FONT DESIGN'
                        : 'VIEW PACKAGING DESIGN'}
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M6 1v9M2.4 6.6 6 10.2l3.6-3.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {chromeHost &&
        createPortal(
          <>
            <BackToFolders />
            <div className="dv__dots" aria-hidden>
              {SECTIONS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  data-on={i === sec}
                  onClick={() => goto(i)}
                  aria-label={s}
                />
              ))}
            </div>
          </>,
          chromeHost,
        )}
    </div>
  )
}