import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Ban,
  Bell,
  Flag,
  Hourglass,
  Inbox,
  List,
  Pencil,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Undo2
} from 'lucide-react'
import type {
  AppSettings,
  Priority,
  ProjectData,
  ShortcutAction,
  SortMode,
  TaskViewMode,
  Todo
} from '@shared/types'
import type { DateGroup } from '../dateGroups'
import { findShortcutAction, keyboardEventToShortcut } from '../shortcuts'
import type { TaskNode } from '../utils'
import {
  breadcrumb,
  buildTaskTree,
  getLongTermRootInfos,
  priorityRank,
  rootOf,
  shortDateLabel
} from '../utils'
import { EmptyState } from './common'
import { TaskItem } from './TaskItem'

type StatusFilter = 'default' | 'todo' | 'done' | 'not_done'
type PriorityFilter = 'all' | Priority

interface TaskColumnProps {
  projectData: ProjectData | null
  dateGroup: DateGroup
  today: string
  settings: AppSettings
  viewMode: TaskViewMode
  repeatLongTerm: boolean
  onViewModeChange: (mode: TaskViewMode) => void
  onCreateTask: (content: string, priority: Priority) => Promise<void> | void
  onSelectDate: (date: string) => void
  onStatus: (todo: Todo, action: 'complete' | 'uncomplete' | 'not_done' | 'restore_not_done') => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onPin: (todo: Todo, pinned: boolean) => void
  onReminder: (todo: Todo) => void
  onAddChild: (todo: Todo) => void
  onPriority: (todo: Todo, priority: Priority) => void
  onLongTerm: (todo: Todo, longTerm: boolean) => void
  onNotify: (message: string) => void
  focusTodoId?: string | null
  onFocusHandled?: () => void
}

function pruneDone(nodes: TaskNode[]): TaskNode[] {
  return nodes
    .filter((node) => node.status !== 'done')
    .map((node) => ({ ...node, children: pruneDone(node.children) }))
}

function statusText(status: Todo['status']): string {
  if (status === 'done') return '已完成'
  if (status === 'not_done') return '不做'
  return '待办'
}

function priorityText(priority: Priority): string {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

export function TaskColumn({
  projectData,
  dateGroup,
  today,
  settings,
  viewMode,
  repeatLongTerm,
  onViewModeChange,
  onCreateTask,
  onSelectDate,
  onStatus,
  onEdit,
  onDelete,
  onPin,
  onReminder,
  onAddChild,
  onPriority,
  onLongTerm,
  onNotify,
  focusTodoId = null,
  onFocusHandled
}: TaskColumnProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('default')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>(settings.defaultSort)
  const [newContent, setNewContent] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ todo: Todo; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const addInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setSortMode(settings.defaultSort)
  }, [settings.defaultSort])

  useEffect(() => {
    const element = addInputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(120, Math.max(34, element.scrollHeight))}px`
  }, [newContent])

  useEffect(() => {
    setQuery('')
    setStatusFilter('default')
    setPriorityFilter('all')
    setSelectedId(null)
    setMenu(null)
  }, [dateGroup.key, projectData?.project.id])

  useEffect(() => {
    setSelectedId(null)
  }, [query, statusFilter, priorityFilter])

  const selectedTodo = useMemo(
    () => projectData?.todos.find((todo) => todo.id === selectedId) ?? null,
    [projectData, selectedId]
  )

  useEffect(() => {
    if (selectedId && !projectData?.todos.some((todo) => todo.id === selectedId)) {
      setSelectedId(null)
    }
  }, [projectData, selectedId])

  useEffect(() => {
    if (!focusTodoId) return
    if (!projectData) return
    if (!projectData.todos.some((todo) => todo.id === focusTodoId)) {
      onNotify('提醒对应的任务已删除或不可用')
      onFocusHandled?.()
      return
    }
    // 通知点击时先恢复默认视图，确保目标任务不会被搜索、筛选或任务菜单隐藏。
    setMenu(null)
    setQuery('')
    setStatusFilter('default')
    setPriorityFilter('all')
    let cancelled = false
    const tryFocus = async (): Promise<void> => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (cancelled) return
        const element = document.querySelector(`[data-todo-id="${focusTodoId}"]`)
        if (element) {
          setSelectedId(focusTodoId)
          element.scrollIntoView({ block: 'center', behavior: 'smooth' })
          onNotify('已定位到提醒任务')
          onFocusHandled?.()
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100))
      }
      if (cancelled) return
      onNotify('任务已完成或已隐藏，未能定位')
      onFocusHandled?.()
    }
    void tryFocus()
    return () => {
      cancelled = true
    }
  }, [focusTodoId, projectData, dateGroup.key, onFocusHandled, onNotify])

  useEffect(() => {
    if (!menu) return
    const onMouseDown = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    const closeMenu = (): void => setMenu(null)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [menu])

  const runTaskAction = useCallback(
    (action: ShortcutAction, todo: Todo): void => {
      if (action === 'edit') onEdit(todo)
      else if (action === 'addChild') onAddChild(todo)
      else if (action === 'pin') onPin(todo, !todo.pinnedAt)
      else if (action === 'priorityHigh') onPriority(todo, 'high')
      else if (action === 'priorityMedium') onPriority(todo, 'medium')
      else if (action === 'priorityLow') onPriority(todo, 'low')
      else if (action === 'notDone') {
        if (todo.parentId) {
          onNotify('子项不支持“标记不做”')
          return
        }
        onStatus(todo, todo.status === 'not_done' ? 'restore_not_done' : 'not_done')
      } else if (action === 'delete') onDelete(todo)
    },
    [onAddChild, onDelete, onEdit, onNotify, onPin, onPriority, onStatus]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat || menu) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('.modal-overlay')) return
      const pressed = keyboardEventToShortcut(event)
      if (!pressed) return
      const action = findShortcutAction(settings.shortcuts, pressed)
      if (!action) return
      event.preventDefault()
      if (!selectedTodo) {
        onNotify('请先单击选择一个待办项，再使用快捷键')
        return
      }
      if (action === 'delete') setSelectedId(null)
      runTaskAction(action, selectedTodo)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menu, onNotify, runTaskAction, selectedTodo, settings.shortcuts])

  const openTaskMenu = useCallback((todo: Todo, x: number, y: number): void => {
    setSelectedId(todo.id)
    setMenu({
      todo,
      x: Math.min(x, Math.max(8, window.innerWidth - 246)),
      y: Math.min(y, Math.max(8, window.innerHeight - 440))
    })
  }, [])

  const runMenuAction = (action: ShortcutAction): void => {
    if (!menu) return
    const todo = menu.todo
    setMenu(null)
    if (action === 'delete') setSelectedId(null)
    runTaskAction(action, todo)
  }

  const runMenuLongTerm = (): void => {
    if (!menu) return
    const todo = menu.todo
    setMenu(null)
    onLongTerm(todo, !todo.isLongTerm)
  }

  const longTermRootInfos = useMemo(
    () => getLongTermRootInfos(projectData?.todos ?? []),
    [projectData]
  )

  const dayTasks = useMemo(() => {
    if (!projectData) return []
    const included = new Map<string, Todo>()
    for (const todo of projectData.todos) {
      if (todo.todoDate >= dateGroup.start && todo.todoDate <= dateGroup.end) {
        included.set(todo.id, todo)
      }
    }
    if (repeatLongTerm) {
      for (const todo of projectData.todos) {
        const info = longTermRootInfos.get(todo.rootId)
        if (info?.active && info.start <= dateGroup.end) included.set(todo.id, todo)
      }
    }
    return [...included.values()]
  }, [projectData, dateGroup, repeatLongTerm, longTermRootInfos])

  const counts = useMemo(() => {
    const roots = dayTasks.filter((todo) => todo.parentId === null)
    return {
      pending: roots.filter((todo) => todo.status === 'todo').length,
      completed: roots.filter((todo) => todo.status === 'done').length
    }
  }, [dayTasks])

  const tree = useMemo(() => buildTaskTree(dayTasks, sortMode), [dayTasks, sortMode])

  const filteredRoots = useMemo(() => {
    let roots = tree
    if (statusFilter === 'default') {
      roots = roots.filter((node) => node.status !== 'not_done')
      if (settings.completedDisplay === 'hidden') {
        roots = pruneDone(roots)
      }
    } else {
      roots = roots.filter((node) => node.status === statusFilter)
    }
    if (priorityFilter !== 'all') {
      roots = roots.filter((node) => node.priority === priorityFilter)
    }
    if (settings.completedDisplay === 'bottom' && statusFilter === 'default') {
      roots = roots.filter((node) => node.status !== 'done')
    }
    return roots
  }, [tree, statusFilter, priorityFilter, settings.completedDisplay])

  const completedRoots = useMemo(() => {
    if (settings.completedDisplay !== 'bottom' || statusFilter !== 'default') return []
    let roots = tree.filter((node) => node.status === 'done')
    if (priorityFilter !== 'all') roots = roots.filter((node) => node.priority === priorityFilter)
    return roots
  }, [tree, settings.completedDisplay, statusFilter, priorityFilter])

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized || !projectData) return []
    return projectData.todos
      .filter((todo) => todo.status !== 'deleted' && todo.content.toLowerCase().includes(normalized))
      .filter((todo) => {
        if (statusFilter === 'default') return true
        return todo.status === statusFilter
      })
      .filter((todo) => priorityFilter === 'all' || todo.priority === priorityFilter)
      .sort((a, b) => {
        if (a.todoDate !== b.todoDate) return a.todoDate < b.todoDate ? 1 : -1
        return priorityRank(b.priority) - priorityRank(a.priority)
      })
  }, [query, projectData, statusFilter, priorityFilter])

  const toggleCollapse = (id: string): void => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const submitTask = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const content = newContent.trim()
    if (!content || adding) return
    setAdding(true)
    try {
      await onCreateTask(content, newPriority)
      setNewContent('')
      setNewPriority('medium')
    } finally {
      setAdding(false)
    }
  }

  const handleAddKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const projectName = projectData?.project.name ?? '未选择项目'
  const sortLabel =
    sortMode === 'created_desc' ? '创建时间（新→旧）' : sortMode === 'created_asc' ? '创建时间（旧→新）' : '重要程度'
  const showTodoDate = dateGroup.start !== dateGroup.end

  const renderTree = (nodes: TaskNode[]): React.JSX.Element => (
    <div className={viewMode === 'note' ? 'task-grid note-grid' : 'task-grid list-grid'}>
      {nodes.map((node) => (
        <TaskItem
          key={node.id}
          node={node}
          level={0}
          viewMode={viewMode}
          selectedId={selectedId}
          shortcuts={settings.shortcuts}
          collapsedIds={collapsedIds}
          onSelect={setSelectedId}
          onOpenMenu={openTaskMenu}
          onToggleCollapse={toggleCollapse}
          onStatus={onStatus}
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
          onReminder={onReminder}
          onAddChild={onAddChild}
          onPriority={onPriority}
          onLongTerm={onLongTerm}
          showTodoDate={showTodoDate}
        />
      ))}
    </div>
  )

  return (
    <main className="main-column">
      <div className="main-head">
        <div className="main-head-inner">
          <div className="main-title-row">
            <div>
              <div className="main-title">
                <span className="accent">{projectName}</span> · {dateGroup.label}待办
              </div>
              <div className="main-sub">
                {dateGroup.subLabel} <span className="meta-dot" />{' '}
                {settings.todayPinned ? '当前分组置顶' : '按日期排序'} <span className="meta-dot" /> {sortLabel}
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-chip pending">
                <span className="stat-dot" />
                待办 {counts.pending}
              </div>
              <div className="stat-chip completed">
                <span className="stat-dot" />
                已完成 {counts.completed}
              </div>
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <Search size={14} />
              <input
                value={query}
                placeholder="搜索任务…"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button className="search-clear" onClick={() => setQuery('')} title="清空搜索">
                  ×
                </button>
              ) : (
                <span className="search-kbd">Ctrl K</span>
              )}
            </div>
            <select
              className="toolbar-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              title="状态筛选"
            >
              <option value="default">默认视图</option>
              <option value="todo">仅待办</option>
              <option value="done">已完成</option>
              <option value="not_done">不做</option>
            </select>
            <select
              className="toolbar-select"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
              title="优先级筛选"
            >
              <option value="all">全部优先级</option>
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <select
              className="toolbar-select"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              title="排序方式"
            >
              <option value="created_desc">创建时间（新→旧）</option>
              <option value="created_asc">创建时间（旧→新）</option>
              <option value="priority">重要程度</option>
            </select>
            <div className="view-switch" role="group" aria-label="任务视图">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                title="列表式"
                onClick={() => onViewModeChange('list')}
              >
                <List size={13} />
                列表
              </button>
              <button
                className={viewMode === 'note' ? 'active' : ''}
                title="便签式"
                onClick={() => onViewModeChange('note')}
              >
                <StickyNote size={13} />
                便签
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="main-body">
        <div className="task-scroll">
          <div className="task-scroll-inner">
            {query ? (
              <>
                <div className="list-heading">
                  <span>搜索结果</span>
                  <span className="list-heading-hint">{searchResults.length} 项</span>
                </div>
                {searchResults.length === 0 ? (
                  <EmptyState icon={<Search size={26} />} title="没有找到匹配的任务" description="换一个关键词试试" />
                ) : (
                  searchResults.map((task) => {
                    const root = projectData ? rootOf(projectData.todos, task.id) : undefined
                    return (
                      <button
                        key={task.id}
                        className="search-result"
                        onClick={() => {
                          onSelectDate(task.todoDate)
                          setQuery('')
                        }}
                      >
                        <div className="search-result-main">
                          <span className={`search-result-title ${task.status === 'done' ? 'done' : ''}`}>
                            {task.content}
                          </span>
                          <span className={`priority-tag ${task.priority}`}>{priorityText(task.priority)}</span>
                          <span className={`status-tag status-${task.status}`}>{statusText(task.status)}</span>
                        </div>
                        <div className="search-result-meta">
                          {shortDateLabel(task.todoDate)}
                          {root && root.id !== task.id ? ` · ${breadcrumb(projectData?.todos ?? [], task.id)}` : ''}
                        </div>
                      </button>
                    )
                  })
                )}
              </>
            ) : (
              <>
                <div className="list-heading">
                  <span>待完成</span>
                  <span className="list-heading-hint">按{sortLabel}</span>
                </div>
                {filteredRoots.length === 0 && completedRoots.length === 0 ? (
                  <EmptyState
                    icon={<Inbox size={28} />}
                    title={dateGroup.kind === 'day' ? '这一天还没有任务' : '这个分组还没有任务'}
                    description="在下方输入框添加第一条任务"
                  />
                ) : (
                  renderTree(filteredRoots)
                )}

                {completedRoots.length > 0 ? (
                  <>
                    <div className="section-divider">
                      已完成 <span>{completedRoots.length}</span>
                    </div>
                    {renderTree(completedRoots)}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="add-bar">
          <form className="add-inner" onSubmit={(event) => void submitTask(event)}>
            <div className="add-plus">
              <Plus size={12} />
            </div>
            <textarea
              ref={addInputRef}
              className="add-input"
              rows={1}
              value={newContent}
              title="Enter 添加，Shift+Enter 换行"
              placeholder="输入任务…"
              onChange={(event) => setNewContent(event.target.value)}
              onKeyDown={handleAddKeyDown}
            />
            <select
              className="add-priority"
              value={newPriority}
              onChange={(event) => setNewPriority(event.target.value as Priority)}
              title="重要程度"
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
            <button className="add-submit" type="submit" disabled={!newContent.trim() || adding}>
              <Plus size={12} />
              添加
            </button>
          </form>
        </div>
      </div>

      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="context-menu task-context-menu"
              style={{ left: menu.x, top: menu.y }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button className="context-item" onClick={() => runMenuAction('edit')}>
                <Pencil size={13} />
                编辑任务
                <span className="context-shortcut">{settings.shortcuts.edit}</span>
              </button>
              <button className="context-item" onClick={() => runMenuAction('pin')}>
                <Pin size={13} />
                {menu.todo.pinnedAt ? '取消置顶' : '置顶任务'}
                <span className="context-shortcut">{settings.shortcuts.pin}</span>
              </button>
              <button className="context-item" onClick={() => runMenuAction('addChild')}>
                <Plus size={13} />
                添加子项
                <span className="context-shortcut">{settings.shortcuts.addChild}</span>
              </button>
              <div className="context-divider" />
              <div className="context-menu-label">优先级</div>
              {(
                [
                  ['high', '高优先级', 'priorityHigh'],
                  ['medium', '中优先级', 'priorityMedium'],
                  ['low', '低优先级', 'priorityLow']
                ] as const
              ).map(([priority, label, action]) => (
                <button key={priority} className="context-item" onClick={() => runMenuAction(action)}>
                  <span className={`priority-tag ${priority}`}>{priorityText(priority)}</span>
                  {label}
                  {menu.todo.priority === priority ? (
                    <span className="context-check">✓</span>
                  ) : (
                    <span className="context-shortcut">{settings.shortcuts[action]}</span>
                  )}
                </button>
              ))}
              <button className="context-item" onClick={runMenuLongTerm}>
                <Hourglass size={13} />
                {menu.todo.isLongTerm ? '取消长期工作' : '标记为长期工作'}
                {menu.todo.isLongTerm ? <span className="context-check">✓</span> : null}
              </button>
              <div className="context-divider" />
              {!menu.todo.parentId ? (
                <button className="context-item" onClick={() => runMenuAction('notDone')}>
                  {menu.todo.status === 'not_done' ? <Undo2 size={13} /> : <Ban size={13} />}
                  {menu.todo.status === 'not_done' ? '恢复不做' : '标记不做'}
                  <span className="context-shortcut">{settings.shortcuts.notDone}</span>
                </button>
              ) : null}
              {!menu.todo.parentId && menu.todo.status === 'todo' ? (
                <button
                  className="context-item"
                  onClick={() => {
                    const todo = menu.todo
                    setMenu(null)
                    onReminder(todo)
                  }}
                >
                  <Bell size={13} />
                  提醒设置
                </button>
              ) : null}
              <div className="context-divider" />
              <button className="context-item danger" onClick={() => runMenuAction('delete')}>
                <Trash2 size={13} />
                {menu.todo.parentId ? '删除子项' : '删除任务'}
                <span className="context-shortcut">{settings.shortcuts.delete}</span>
              </button>
            </div>,
            document.body
          )
        : null}
    </main>
  )
}
