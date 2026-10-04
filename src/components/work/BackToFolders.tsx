import { useStore } from '../../store'
import { sweepBackToFolders } from './workTransition'

/** 作品子页面左上角的返回入口；返回时播放米黄色径向遮罩过渡 */
export default function BackToFolders() {
  const setWorkView = useStore((s) => s.setWorkView)
  return (
    <button
      type="button"
      className="wv__back"
      onClick={() => {
        sweepBackToFolders(() => setWorkView(null))
      }}
    >
      <span>←</span> BACK TO FOLDERS
    </button>
  )
}
