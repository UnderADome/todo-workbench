import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import type { Priority, ProjectData, SortMode, Todo } from '@shared/types'

export interface TaskNode extends Todo {
  children: TaskNode[]
}

export function parseDate(value: string): Date {
  const date = parseISO(value)
  return isValid(date) ? date : new Date(value)
}

export function dateLabel(date: string, today: string): string {
  const diff = differenceInCalendarDays(parseDate(date), parseDate(today))
  if (diff === 0) return '今日'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  if (diff === 2) return '后天'
  if (diff < -1) return `${Math.abs(diff)} 天前`
  return format(parseDate(date), 'M月d日')
}

export function weekdayLabel(date: string): string {
  const names = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return names[parseDate(date).getDay()]
}

export function fullDateLabel(date: string): string {
  return `${format(parseDate(date), 'yyyy 年 M 月 d 日')} · ${weekdayLabel(date)}`
}

export function shortDateLabel(date: string): string {
  return format(parseDate(date), 'yyyy-MM-dd')
}

export function timeOnly(value: string | null): string {
  if (!value) return ''
  return format(new Date(value), 'HH:mm')
}

export function dateTimeLabel(value: string | null): string {
  if (!value) return ''
  return format(new Date(value), 'yyyy-MM-dd HH:mm')
}

export function priorityRank(priority: Priority): number {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

export function compareTasks(a: Todo, b: Todo, mode: SortMode): number {
  const aPinned = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0
  const bPinned = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0
  if (aPinned || bPinned) {
    if (aPinned !== bPinned) return bPinned - aPinned
  }
  if (mode === 'created_asc') {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }
  if (mode === 'priority') {
    const diff = priorityRank(b.priority) - priorityRank(a.priority)
    if (diff !== 0) return diff
  }
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export function buildTaskTree(todos: Todo[], mode: SortMode): TaskNode[] {
  const nodeMap = new Map<string, TaskNode>()
  for (const todo of todos) {
    nodeMap.set(todo.id, { ...todo, children: [] })
  }
  const roots: TaskNode[] = []
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortNodes = (nodes: TaskNode[]): void => {
    nodes.sort((a, b) => compareTasks(a, b, mode))
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}

export function sortRoots(todos: Todo[], mode: SortMode): Todo[] {
  return [...todos].sort((a, b) => compareTasks(a, b, mode))
}

export function collectMatchingIds(todos: Todo[], query: string): Set<string> {
  const normalized = query.trim().toLowerCase()
  const matches = new Set<string>()
  if (!normalized) return matches
  for (const todo of todos) {
    if (todo.content.toLowerCase().includes(normalized)) matches.add(todo.id)
  }
  return matches
}

export function rootOf(todos: Todo[], id: string): Todo | undefined {
  const byId = new Map(todos.map((todo) => [todo.id, todo]))
  let current = byId.get(id)
  while (current?.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current
}

export function breadcrumb(todos: Todo[], id: string): string {
  const byId = new Map(todos.map((todo) => [todo.id, todo]))
  const names: string[] = []
  let current = byId.get(id)
  while (current) {
    names.unshift(current.content)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return names.join(' / ')
}

export function dateListForProject(
  todos: Todo[],
  today: string,
  todayPinned: boolean,
  extraDate?: string | null
): string[] {
  const set = new Set(todos.map((todo) => todo.todoDate))
  set.add(today)
  if (extraDate) set.add(extraDate)
  const dates = Array.from(set)
  const future = dates.filter((date) => date > today).sort((a, b) => (a < b ? -1 : 1))
  const past = dates.filter((date) => date < today).sort((a, b) => (a > b ? -1 : 1))
  if (todayPinned) return [today, ...future, ...past]
  return [...future, today, ...past]
}

export interface LongTermRootInfo {
  start: string
  active: boolean
}

export function getLongTermRootInfos(todos: Todo[]): Map<string, LongTermRootInfo> {
  const roots = new Map<string, Todo>()
  for (const todo of todos) {
    if (todo.parentId === null) roots.set(todo.id, todo)
  }
  const infos = new Map<string, LongTermRootInfo>()
  for (const todo of todos) {
    if (!todo.isLongTerm || todo.deletedAt) continue
    const root = roots.get(todo.rootId) ?? (todo.parentId === null ? todo : undefined)
    if (!root || infos.has(root.id)) continue
    infos.set(root.id, { start: root.todoDate, active: root.status === 'todo' })
  }
  return infos
}

export function dateTaskCount(todos: Todo[], date: string, repeatLongTerm = false): number {
  const longTermRoots = repeatLongTerm ? getLongTermRootInfos(todos) : null
  const ids = new Set<string>()
  for (const todo of todos) {
    if (todo.parentId !== null || todo.status !== 'todo') continue
    if (todo.todoDate === date) {
      ids.add(todo.id)
      continue
    }
    const info = longTermRoots?.get(todo.id)
    if (info?.active && info.start <= date) ids.add(todo.id)
  }
  return ids.size
}

export function rootTasks(todos: Todo[]): Todo[] {
  return todos.filter((todo) => todo.parentId === null)
}

export function projectStats(projectData: ProjectData | null, date: string | null): { pending: number; completed: number } {
  if (!projectData || !date) return { pending: 0, completed: 0 }
  const roots = projectData.todos.filter((todo) => todo.parentId === null && todo.todoDate === date)
  return {
    pending: roots.filter((todo) => todo.status === 'todo').length,
    completed: roots.filter((todo) => todo.status === 'done').length
  }
}

export function isSameLocalDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}

export function localTodayString(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
