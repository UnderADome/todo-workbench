import { BookOpen, ChevronLeft, ChevronRight, Folder, HeartPulse, ScrollText, Settings, Trash2 } from 'lucide-react'

interface SidebarProps {
  collapsed: boolean
  activeArea: 'projects' | 'health'
  pendingToday: number
  historyCount: number
  recycleCount: number
  onToggleCollapse: () => void
  onSelectArea: (area: 'projects' | 'health') => void
  onOpenRecycle: () => void
  onOpenUsage: () => void
  onOpenChangelog: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  collapsed,
  activeArea,
  pendingToday,
  historyCount,
  recycleCount,
  onToggleCollapse,
  onSelectArea,
  onOpenRecycle,
  onOpenUsage,
  onOpenChangelog,
  onOpenSettings
}: SidebarProps): React.JSX.Element {
  if (collapsed) {
    return (
      <aside className="sidebar sidebar-rail-wrap">
        <div className="sidebar-rail">
          <button className="rail-expand" title="展开功能区" onClick={onToggleCollapse}>
            <ChevronRight size={13} />
          </button>
          <button
            className={`rail-icon ${activeArea === 'projects' ? 'active' : ''}`}
            title="项目管理"
            onClick={() => onSelectArea('projects')}
          >
            <Folder size={17} />
          </button>
          <button
            className={`rail-icon ${activeArea === 'health' ? 'active' : ''}`}
            title="健康管理"
            onClick={() => onSelectArea('health')}
          >
            <HeartPulse size={17} />
          </button>
          <div className="rail-spacer" />
          <button className="rail-icon" title="使用说明" onClick={onOpenUsage}>
            <BookOpen size={17} />
          </button>
          <button className="rail-icon" title="更新日志" onClick={onOpenChangelog}>
            <ScrollText size={17} />
          </button>
          <button className="rail-icon" title="回收站" onClick={onOpenRecycle}>
            <Trash2 size={17} />
            {recycleCount > 0 ? <span className="rail-badge">{recycleCount}</span> : null}
          </button>
          <button className="rail-icon" title="设置" onClick={onOpenSettings}>
            <Settings size={17} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-expanded">
        <div className="side-head">
          <span className="side-caption">功能区</span>
          <button className="side-collapse" title="折叠功能区" onClick={onToggleCollapse}>
            <ChevronLeft size={13} />
          </button>
        </div>

        <button
          className={`nav-item ${activeArea === 'projects' ? 'active' : ''}`}
          onClick={() => onSelectArea('projects')}
        >
          <Folder size={17} />
          <span>项目管理</span>
          <span className="nav-count">{pendingToday}</span>
        </button>
        <button
          className={`nav-item ${activeArea === 'health' ? 'active' : ''}`}
          onClick={() => onSelectArea('health')}
        >
          <HeartPulse size={17} />
          <span>健康管理</span>
          <span className="nav-tag">规划中</span>
        </button>

        <div className="side-spacer" />
        <div className="side-tip">
          <div className="side-tip-title">今日概览</div>
          <div className="side-tip-row">
            <span>待办</span>
            <strong>{pendingToday} 项</strong>
          </div>
          <div className="side-tip-row">
            <span>历史遗留</span>
            <strong>{historyCount} 项</strong>
          </div>
        </div>
        <div className="side-bottom">
          <button className="nav-item" onClick={onOpenUsage}>
            <BookOpen size={17} />
            <span>使用说明</span>
          </button>
          <button className="nav-item" onClick={onOpenChangelog}>
            <ScrollText size={17} />
            <span>更新日志</span>
          </button>
          <button className="nav-item" onClick={onOpenRecycle}>
            <Trash2 size={17} />
            <span>回收站</span>
            {recycleCount > 0 ? <span className="nav-count">{recycleCount}</span> : null}
          </button>
          <button className="nav-item" onClick={onOpenSettings}>
            <Settings size={17} />
            <span>设置</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
