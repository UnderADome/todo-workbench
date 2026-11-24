import { Check, History, SlidersHorizontal, X } from 'lucide-react'
import type { HistoryItem, HistoryScope, Todo } from '@shared/types'
import type { HistoryGroup } from '../dateGroups'
import { shortDateLabel } from '../utils'
import { EmptyState } from './common'

interface HistoryPanelProps {
  groups: HistoryGroup[]
  scope: HistoryScope
  todayPending: number
  onScopeChange: (scope: HistoryScope) => void
  onOpenGrouping: () => void
  onClose: () => void
  onStatus: (todo: Todo, action: 'complete') => void
  onNavigate: (item: HistoryItem) => void
}

function priorityClass(priority: string): string {
  return priority === 'high' ? 'high' : priority === 'medium' ? 'medium' : 'low'
}

export function HistoryPanel({
  groups,
  scope,
  todayPending,
  onScopeChange,
  onOpenGrouping,
  onClose,
  onStatus,
  onNavigate
}: HistoryPanelProps): React.JSX.Element {
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <aside className="history-column">
      <div className="history-head">
        <div className="history-title-row">
          <div className="history-title">
            历史遗留项 <span className="history-badge">{total}</span>
          </div>
          <div className="history-head-actions">
            {scope === 'all' ? (
              <button className="icon-button" title="全部项目历史/新建项目默认分组规则" onClick={onOpenGrouping}>
                <SlidersHorizontal size={14} />
              </button>
            ) : null}
            <button className="icon-button" title="关闭历史遗留项" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="scope-switch">
          <button className={scope === 'project' ? 'active' : ''} onClick={() => onScopeChange('project')}>
            本项目
          </button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => onScopeChange('all')}>
            全部项目
          </button>
        </div>
        <div className="history-sub">仅统计往期未完成 · 按日期分组聚合</div>
      </div>

      <div className="history-scroll">
        {groups.length === 0 ? (
          <EmptyState icon={<History size={26} />} title="暂无历史遗留项" description="往期未完成任务会汇总在这里" />
        ) : (
          groups.map(({ group, items }) => (
            <div className="history-group" key={group.key}>
              <div className="history-group-head">
                <div className="history-date">
                  {group.label} <span>{group.rangeLabel}</span>
                </div>
                <div className="history-count">{items.length} 项</div>
              </div>
              {items.map((item) => (
                <div className="history-item" key={item.id}>
                  <button
                    className="history-check"
                    title="标记完成"
                    onClick={() => onStatus(item, 'complete')}
                  >
                    <Check size={10} strokeWidth={3} />
                  </button>
                  <button className="history-item-main" onClick={() => onNavigate(item)}>
                    <span className="history-item-title">{item.content}</span>
                    <span className="history-item-meta">
                      {group.start !== group.end ? (
                        <span className="history-item-date">{shortDateLabel(item.todoDate)}</span>
                      ) : null}
                      {scope === 'all' ? <span className="project-chip">{item.projectName}</span> : null}
                      {item.hasLongTerm ? <span className="history-longterm">长期</span> : null}
                      {item.pinnedAt ? <span className="history-pin">置顶</span> : null}
                    </span>
                  </button>
                  <span className={`priority-dot ${priorityClass(item.priority)}`} />
                </div>
              ))}
            </div>
          ))
        )}

        {todayPending > 0 ? (
          <div className="history-today-note">
            今日仍有 {todayPending} 项未完成，不计入历史遗留项；可在「当日待办项」中继续处理。
          </div>
        ) : null}
        <div className="history-note">
          {scope === 'all'
            ? '全部项目历史使用独立的全局分组规则；各项目日期列仍使用自己的规则。'
            : '本项目历史与日期列使用当前项目的分组规则；未来日期任务不进入。'}
        </div>
      </div>
    </aside>
  )
}
