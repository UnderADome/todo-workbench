import { useEffect, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Lock, Pin, SlidersHorizontal } from 'lucide-react'
import { groupContainsDate, type DateGroup } from '../dateGroups'
import { parseDate } from '../utils'

interface DateColumnProps {
  groups: DateGroup[]
  selectedDate: string | null
  selectedGroupKey: string | null
  today: string
  todayPinned: boolean
  counts: Record<string, number>
  collapsed: boolean
  locked: boolean
  onSelectGroup: (group: DateGroup) => void
  onJumpDate: (date: string) => void
  onOpenGrouping: () => void
  onToggleCollapse: () => void
}

export function DateColumn({
  groups,
  selectedDate,
  selectedGroupKey,
  today,
  todayPinned,
  counts,
  collapsed,
  locked,
  onSelectGroup,
  onJumpDate,
  onOpenGrouping,
  onToggleCollapse
}: DateColumnProps): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (!pickerOpen) return
    const close = (): void => setPickerOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [pickerOpen])

  if (collapsed) {
    return (
      <section className={`column date-column ${locked ? 'column-locked' : ''}`}>
        <div className="column-rail date-rail">
          {locked ? (
            <>
              <div className="rail-lock" title="健康管理模式下不可用">
                <Lock size={14} />
              </div>
              <div className="rail-disabled-icon">
                <Calendar size={17} />
              </div>
            </>
          ) : (
            <>
              <button className="rail-expand" title="展开日期列" onClick={onToggleCollapse}>
                <ChevronRight size={13} />
              </button>
              <div className="date-chip-list">
                {groups.map((group) => {
                  const parsed = parseDate(group.start)
                  return (
                    <button
                      key={group.key}
                      className={`date-chip ${selectedGroupKey === group.key ? 'active' : ''}`}
                      title={`${group.label} · ${group.rangeLabel}`}
                      onClick={() => onSelectGroup(group)}
                    >
                      <span>{parsed.getMonth() + 1}月</span>
                      <strong>{parsed.getDate()}</strong>
                      <em>{counts[group.key] ?? 0}</em>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="column date-column">
      <div className="column-expanded">
        <div className="column-head">
          <div>
            <div className="column-title">日期</div>
            <div className="column-subtitle">本项目规则 · {todayPinned ? '当前分组置顶' : '按日期排序'}</div>
          </div>
          <div className="column-head-actions">
            <button
              className="mini-icon-button"
              title="日期分组规则"
              data-scope="project"
              onClick={onOpenGrouping}
            >
              <SlidersHorizontal size={13} />
            </button>
            <button
              className="mini-icon-button"
              title="跳转到日期（补录历史或规划未来）"
              onClick={(event) => {
                event.stopPropagation()
                setPickerOpen((open) => !open)
              }}
            >
              <Calendar size={13} />
            </button>
            <button className="mini-icon-button" title="折叠日期列" onClick={onToggleCollapse}>
              <ChevronLeft size={13} />
            </button>
          </div>
        </div>
        {pickerOpen ? (
          <div className="date-picker-popover" onClick={(event) => event.stopPropagation()}>
            <div className="date-picker-title">选择日期</div>
            <input
              className="text-input date-picker-input"
              type="date"
              value={selectedDate ?? today}
              autoFocus
              onChange={(event) => {
                if (!event.target.value) return
                onJumpDate(event.target.value)
                setPickerOpen(false)
              }}
            />
            <div className="date-picker-hint">选择日期后会自动归入对应分组；补录历史或规划未来都适用。</div>
          </div>
        ) : null}
        <div className="column-scroll">
          {groups.map((group) => {
            const containsToday = groupContainsDate(group, today)
            return (
              <button
                key={group.key}
                className={`date-item ${selectedGroupKey === group.key ? 'active' : ''} ${
                  group.start > today ? 'future' : ''
                }`}
                onClick={() => onSelectGroup(group)}
                title={`${group.label} · ${group.rangeLabel}`}
              >
                <div className="date-item-top">
                  <span className="date-dot" />
                  <span className="date-label">{group.label}</span>
                  {containsToday && todayPinned ? (
                    <span className="date-pin" title="当前分组置顶">
                      <Pin size={10} />
                    </span>
                  ) : null}
                  <span className="date-count">{counts[group.key] ?? 0}</span>
                </div>
                <div className="date-sub">{group.subLabel}</div>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
