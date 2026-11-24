import {
  Ban,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Hourglass,
  Pin,
  Plus,
  Repeat2,
  Trash2,
  Undo2
} from 'lucide-react'
import { format } from 'date-fns'
import type { ShortcutMap, TaskViewMode, Todo } from '@shared/types'
import type { TaskNode } from '../utils'
import { dateTimeLabel, shortDateLabel, timeOnly } from '../utils'

interface TaskItemProps {
  node: TaskNode
  level: number
  viewMode: TaskViewMode
  selectedId: string | null
  shortcuts: ShortcutMap
  collapsedIds: Set<string>
  onSelect: (id: string) => void
  onOpenMenu: (todo: Todo, x: number, y: number) => void
  onToggleCollapse: (id: string) => void
  onStatus: (todo: Todo, action: 'complete' | 'uncomplete' | 'not_done' | 'restore_not_done') => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
  onPin: (todo: Todo, pinned: boolean) => void
  onReminder: (todo: Todo) => void
  onAddChild: (todo: Todo) => void
  onPriority: (todo: Todo, priority: Todo['priority']) => void
  onLongTerm: (todo: Todo, longTerm: boolean) => void
  showTodoDate?: boolean
}

function hasLongTermInTree(node: TaskNode): boolean {
  return node.isLongTerm || node.children.some(hasLongTermInTree)
}

function priorityText(priority: Todo['priority']): string {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function reminderLabel(todo: Todo): string {
  if (!todo.remindAt) return ''
  return format(new Date(todo.remindAt), 'M月d日 HH:mm')
}

export function TaskItem({
  node,
  level,
  viewMode,
  selectedId,
  shortcuts,
  collapsedIds,
  onSelect,
  onOpenMenu,
  onToggleCollapse,
  onStatus,
  onEdit,
  onDelete,
  onPin,
  onReminder,
  onAddChild,
  onPriority,
  onLongTerm,
  showTodoDate = false
}: TaskItemProps): React.JSX.Element {
  const isRoot = level === 0
  const noteMode = viewMode === 'note' && isRoot
  const selected = selectedId === node.id
  const done = node.status === 'done'
  const notDone = node.status === 'not_done'
  const hasChildren = node.children.length > 0
  const collapsed = collapsedIds.has(node.id)
  const childDone = node.children.filter((child) => child.status === 'done').length
  const progress = hasChildren ? Math.round((childDone / node.children.length) * 100) : 0
  const showLongTerm = isRoot ? hasLongTermInTree(node) : node.isLongTerm
  const iconSize = isRoot ? 13 : 12
  const nextPriority: Todo['priority'] =
    node.priority === 'high' ? 'medium' : node.priority === 'medium' ? 'low' : 'high'

  const selectTask = (): void => onSelect(node.id)

  const handleRowClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    selectTask()
    event.currentTarget.focus()
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    event.stopPropagation()
    selectTask()
    event.currentTarget.focus()
    onEdit(node)
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    selectTask()
    event.currentTarget.focus()
    onOpenMenu(node, event.clientX, event.clientY)
  }

  const checkbox = (
    <button
      className={`task-check ${done ? 'checked' : ''} ${notDone ? 'not-done' : ''}`}
      title={done ? '取消完成' : '标记完成'}
      onClick={(event) => {
        event.stopPropagation()
        onStatus(node, done ? 'uncomplete' : 'complete')
      }}
    >
      {done ? <Check size={10} strokeWidth={3} /> : null}
    </button>
  )

  const titleRow = (
    <div className="task-title-row">
      {hasChildren ? (
        <button
          className="expand-btn"
          title={collapsed ? '展开子项' : '收起子项'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleCollapse(node.id)
          }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : null}
      <span className={`task-title ${done ? 'done' : ''} ${notDone ? 'muted' : ''}`} title="双击编辑任务">
        {node.content}
      </span>
      {node.pinnedAt ? (
        <span className="pin-mark" title="已置顶">
          <Pin size={11} />
        </span>
      ) : null}
      <span className={`priority-tag ${node.priority}`}>{priorityText(node.priority)}</span>
      {showLongTerm ? (
        <span
          className="longterm-tag"
          title={isRoot && !node.isLongTerm ? '包含长期子项' : '长期工作'}
        >
          <Hourglass size={10} />
          长期工作
        </span>
      ) : null}
      {notDone ? <span className="status-tag">不做</span> : null}
      {isRoot && node.remindAt ? (
        <span className="reminder-tag" title={node.remindAt}>
          {node.repeatRule && node.repeatRule !== 'none' ? <Repeat2 size={10} /> : <Bell size={10} />}
          {reminderLabel(node)}
        </span>
      ) : null}
    </div>
  )

  const meta = (
    <div className="task-meta">
      {showTodoDate ? (
        <>
          <span className="task-date-label">{shortDateLabel(node.todoDate)}</span>
          <span className="meta-dot" />
        </>
      ) : null}
      {isRoot ? (
        <>
          <span>{timeOnly(node.createdAt)} 创建</span>
          {hasChildren ? (
            <>
              <span className="meta-dot" />
              <span>
                子项 {childDone}/{node.children.length}
              </span>
              <span className="mini-progress">
                <span style={{ width: `${progress}%` }} />
              </span>
            </>
          ) : null}
          {node.completedAt ? (
            <>
              <span className="meta-dot" />
              <span>完成于 {dateTimeLabel(node.completedAt)}</span>
            </>
          ) : null}
          {notDone && node.notDoneAt ? (
            <>
              <span className="meta-dot" />
              <span>标记于 {timeOnly(node.notDoneAt)}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          {hasChildren ? <span>子项 {childDone}/{node.children.length}</span> : null}
          {done && node.completedAt ? <span>完成于 {dateTimeLabel(node.completedAt)}</span> : null}
        </>
      )}
    </div>
  )

  const pinButton = (
    <button
      className={`task-icon-btn ${node.pinnedAt ? 'active' : ''}`}
      title={`${node.pinnedAt ? '取消置顶' : '置顶任务'} (${shortcuts.pin})`}
      onClick={(event) => {
        event.stopPropagation()
        selectTask()
        onPin(node, !node.pinnedAt)
      }}
    >
      <Pin size={iconSize} />
    </button>
  )

  const addChildButton = (
    <button
      className="task-icon-btn"
      title={`添加子项 (${shortcuts.addChild})`}
      onClick={(event) => {
        event.stopPropagation()
        selectTask()
        onAddChild(node)
      }}
    >
      <Plus size={iconSize} />
    </button>
  )

  const priorityButton = (
    <button
      className={`task-icon-btn priority-action ${node.priority}`}
      title={`切换优先级（当前：${priorityText(node.priority)}，点击后切换为${priorityText(nextPriority)}）`}
      onClick={(event) => {
        event.stopPropagation()
        selectTask()
        onPriority(node, nextPriority)
      }}
    >
      <Flag size={iconSize} />
    </button>
  )

  const longTermButton = (
    <button
      className={`task-icon-btn ${node.isLongTerm ? 'active' : ''}`}
      title={node.isLongTerm ? '取消长期工作' : '标记为长期工作'}
      onClick={(event) => {
        event.stopPropagation()
        selectTask()
        onLongTerm(node, !node.isLongTerm)
      }}
    >
      <Hourglass size={iconSize} />
    </button>
  )

  const deleteButton = (
    <button
      className="task-icon-btn danger"
      title={`${isRoot ? '删除任务' : '删除子项'} (${shortcuts.delete})`}
      onClick={(event) => {
        event.stopPropagation()
        selectTask()
        onDelete(node)
      }}
    >
      <Trash2 size={iconSize} />
    </button>
  )

  const actions = (
    <div className={isRoot ? 'task-actions task-quick-actions' : 'subtask-actions task-quick-actions'}>
      {pinButton}
      {addChildButton}
      {priorityButton}
      {longTermButton}
      {isRoot ? (
        <button
          className={`task-icon-btn ${notDone ? 'active' : ''}`}
          title={`${notDone ? '恢复不做' : '标记不做'} (${shortcuts.notDone})`}
          onClick={(event) => {
            event.stopPropagation()
            selectTask()
            onStatus(node, notDone ? 'restore_not_done' : 'not_done')
          }}
        >
          {notDone ? <Undo2 size={iconSize} /> : <Ban size={iconSize} />}
        </button>
      ) : null}
      {isRoot && !done && !notDone ? (
        <button
          className="task-icon-btn"
          title="提醒设置"
          onClick={(event) => {
            event.stopPropagation()
            selectTask()
            onReminder(node)
          }}
        >
          <Bell size={iconSize} />
        </button>
      ) : null}
      {deleteButton}
    </div>
  )

  const row = (
    <div
      className={
        isRoot
          ? 'task-row'
          : `subtask-row ${viewMode === 'note' ? 'note-subtask' : 'subtask-card'} ${selected ? 'is-selected' : ''}`
      }
      title="单击选中；双击编辑；右键打开更多操作"
      tabIndex={0}
      onClick={handleRowClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onFocus={() => selectTask()}
    >
      {checkbox}
      <div className="task-main">
        {titleRow}
        {meta}
      </div>
      {actions}
    </div>
  )

  return (
    <div
      data-todo-id={node.id}
      className={
        isRoot
          ? `task-card ${noteMode ? 'note-card' : ''} ${done ? 'is-completed' : ''} ${
              node.pinnedAt ? 'is-pinned' : ''
            } ${selected ? 'is-selected' : ''}`
          : 'subtask-node'
      }
    >
      {row}
      {hasChildren && !collapsed ? (
        <div className={isRoot ? `subtask-list ${noteMode ? 'note-subtask-list' : ''}` : 'subtask-children'}>
          {node.children.map((child) => (
            <TaskItem
              key={child.id}
              node={child}
              level={level + 1}
              viewMode={viewMode}
              selectedId={selectedId}
              shortcuts={shortcuts}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onOpenMenu={onOpenMenu}
              onToggleCollapse={onToggleCollapse}
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
      ) : null}
    </div>
  )
}
