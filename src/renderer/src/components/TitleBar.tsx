import { Check, Minus, Square, X } from 'lucide-react'

export function TitleBar({ activeArea }: { activeArea: 'projects' | 'health' }): React.JSX.Element {
  return (
    <header className="titlebar" onDoubleClick={() => window.api.windowToggleMaximize()}>
      <div className="brand">
        <div className="brand-logo">
          <Check size={14} strokeWidth={3} />
        </div>
        <div className="brand-name">待办工作台</div>
      </div>
      <div className="title-divider" />
      <div className="title-context">
        <span className="status-dot" />
        {activeArea === 'health' ? '健康管理 · 功能规划中' : '本地 SQLite · 自动保存'}
      </div>
      <div className="window-controls no-drag">
        <button className="window-btn" title="最小化" onClick={() => window.api.windowMinimize()}>
          <Minus size={13} />
        </button>
        <button className="window-btn" title="最大化 / 还原" onClick={() => window.api.windowToggleMaximize()}>
          <Square size={11} />
        </button>
        <button className="window-btn close" title="关闭到托盘" onClick={() => window.api.windowClose()}>
          <X size={13} />
        </button>
      </div>
    </header>
  )
}
