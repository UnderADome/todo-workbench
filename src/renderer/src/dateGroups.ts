import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { DateGroupingConfig, HistoryItem, ManualDateRange, Todo } from '@shared/types'
import { dateLabel, getLongTermRootInfos, shortDateLabel, weekdayLabel } from './utils'

export type DateGroupKind = 'day' | 'week' | 'interval' | 'manual'

export interface DateGroup {
  key: string
  kind: DateGroupKind
  start: string
  end: string
  label: string
  subLabel: string
  rangeLabel: string
  manualId?: string
}

export interface HistoryGroup {
  group: DateGroup
  items: HistoryItem[]
}

function toKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function fromKey(date: string): Date {
  return parseISO(date)
}

function normalizeRange(range: ManualDateRange): { start: string; end: string } {
  return range.start <= range.end
    ? { start: range.start, end: range.end }
    : { start: range.end, end: range.start }
}

export function formatRangeLabel(start: string, end: string): string {
  if (start === end) return format(fromKey(start), 'M.d')
  const startDate = fromKey(start)
  const endDate = fromKey(end)
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${format(startDate, 'M.d')}-${format(endDate, 'M.d')}`
  }
  return `${format(startDate, 'yyyy.M.d')}-${format(endDate, 'yyyy.M.d')}`
}

function manualRangeForDate(date: string, ranges: ManualDateRange[]): ManualDateRange | undefined {
  return [...ranges]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .find((range) => {
      const normalized = normalizeRange(range)
      return normalized.start <= date && date <= normalized.end
    })
}

function makeManualGroup(range: ManualDateRange): DateGroup {
  const normalized = normalizeRange(range)
  const rangeLabel = formatRangeLabel(normalized.start, normalized.end)
  const customLabel = range.label?.trim()
  return {
    key: `manual:${range.id}`,
    kind: 'manual',
    start: normalized.start,
    end: normalized.end,
    label: customLabel || rangeLabel,
    subLabel: `${rangeLabel} · 自定义区间`,
    rangeLabel,
    manualId: range.id
  }
}

interface AutoBucket {
  kind: 'day' | 'week' | 'interval'
  start: string
  end: string
}

function autoBucketForDate(date: string, config: DateGroupingConfig): AutoBucket {
  if (config.mode === 'day') {
    return { kind: 'day', start: date, end: date }
  }
  if (config.mode === 'week') {
    const start = startOfWeek(fromKey(date), { weekStartsOn: 1 })
    return { kind: 'week', start: toKey(start), end: toKey(addDays(start, 6)) }
  }
  const parsed = fromKey(date)
  const interval = Math.min(31, Math.max(1, Math.floor(config.intervalDays) || 10))
  const monthStart = startOfMonth(parsed)
  const offset = Math.floor((parsed.getDate() - 1) / interval) * interval
  const start = addDays(monthStart, offset)
  const monthEnd = endOfMonth(parsed)
  const proposedEnd = addDays(start, interval - 1)
  return {
    kind: 'interval',
    start: toKey(start),
    end: toKey(proposedEnd > monthEnd ? monthEnd : proposedEnd)
  }
}

function subtractManualRanges(
  bucketStart: string,
  bucketEnd: string,
  ranges: ManualDateRange[]
): { start: string; end: string }[] {
  const overlaps = ranges
    .map(normalizeRange)
    .filter((range) => range.start <= bucketEnd && range.end >= bucketStart)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
  const segments: { start: string; end: string }[] = []
  let cursor = bucketStart
  for (const range of overlaps) {
    if (range.start > cursor) {
      const end = toKey(addDays(fromKey(range.start), -1))
      if (cursor <= end) segments.push({ start: cursor, end })
    }
    const afterRange = toKey(addDays(fromKey(range.end), 1))
    if (afterRange > cursor) cursor = afterRange
    if (cursor > bucketEnd) break
  }
  if (cursor <= bucketEnd) segments.push({ start: cursor, end: bucketEnd })
  return segments
}

function weekRelativeLabel(bucketStart: string, today: string): string | null {
  const currentStart = toKey(startOfWeek(fromKey(today), { weekStartsOn: 1 }))
  if (bucketStart === currentStart) return '本周'
  if (bucketStart === toKey(addDays(fromKey(currentStart), -7))) return '上周'
  if (bucketStart === toKey(addDays(fromKey(currentStart), 7))) return '下周'
  return null
}

function makeAutoGroup(
  bucket: AutoBucket,
  start: string,
  end: string,
  today: string,
  config: DateGroupingConfig
): DateGroup {
  const fullBucket = bucket.start === start && bucket.end === end
  const rangeLabel = formatRangeLabel(start, end)
  let label = rangeLabel
  if (bucket.kind === 'day') {
    label = dateLabel(start, today)
  } else if (bucket.kind === 'week' && fullBucket) {
    label = weekRelativeLabel(bucket.start, today) ?? rangeLabel
  }

  let subLabel: string
  if (bucket.kind === 'day') {
    subLabel = `${shortDateLabel(start)} · ${weekdayLabel(start)}`
  } else if (bucket.kind === 'week') {
    subLabel = fullBucket ? `周一至周日 · ${rangeLabel}` : `${rangeLabel} · 自动分组`
  } else {
    subLabel = fullBucket
      ? `${rangeLabel} · 每 ${Math.min(31, Math.max(1, config.intervalDays || 10))} 天`
      : `${rangeLabel} · 自动分组`
  }

  return {
    key: `auto:${bucket.kind}:${start}:${end}`,
    kind: bucket.kind,
    start,
    end,
    label,
    subLabel,
    rangeLabel
  }
}

export function groupForDate(date: string, today: string, config: DateGroupingConfig): DateGroup {
  const manual = manualRangeForDate(date, config.manualRanges)
  if (manual) return makeManualGroup(manual)

  const bucket = autoBucketForDate(date, config)
  const segments = subtractManualRanges(bucket.start, bucket.end, config.manualRanges)
  const segment = segments.find((item) => item.start <= date && date <= item.end)
  if (!segment) {
    // 理论上仅在数据异常/重叠区间时出现；回退到原始桶，避免界面崩溃。
    return makeAutoGroup(bucket, bucket.start, bucket.end, today, config)
  }
  return makeAutoGroup(bucket, segment.start, segment.end, today, config)
}

function addBucketSegments(
  groups: Map<string, DateGroup>,
  bucket: AutoBucket,
  today: string,
  config: DateGroupingConfig
): void {
  for (const segment of subtractManualRanges(bucket.start, bucket.end, config.manualRanges)) {
    const group = makeAutoGroup(bucket, segment.start, segment.end, today, config)
    groups.set(group.key, group)
  }
}

export function buildDateGroups(
  todos: Todo[],
  today: string,
  selectedDate: string | null,
  config: DateGroupingConfig,
  todayPinned: boolean
): DateGroup[] {
  const groups = new Map<string, DateGroup>()
  for (const range of config.manualRanges) {
    const group = makeManualGroup(range)
    groups.set(group.key, group)
  }

  const addDate = (date: string | null | undefined): void => {
    if (!date) return
    if (manualRangeForDate(date, config.manualRanges)) return
    addBucketSegments(groups, autoBucketForDate(date, config), today, config)
  }

  for (const todo of todos) addDate(todo.todoDate)
  addDate(today)
  addDate(selectedDate)

  if (config.mode === 'week') {
    const current = autoBucketForDate(today, config)
    addBucketSegments(groups, autoBucketForDate(toKey(addDays(fromKey(current.start), -7)), config), today, config)
    addBucketSegments(groups, autoBucketForDate(toKey(addDays(fromKey(current.start), 7)), config), today, config)
  } else if (config.mode === 'interval') {
    const current = autoBucketForDate(today, config)
    addBucketSegments(groups, autoBucketForDate(toKey(addDays(fromKey(current.start), -1)), config), today, config)
    addBucketSegments(groups, autoBucketForDate(toKey(addDays(fromKey(current.end), 1)), config), today, config)
  }

  const list = Array.from(groups.values())
  const current = list.find((group) => group.start <= today && today <= group.end)
  const future = list
    .filter((group) => group.start > today)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
  const past = list
    .filter((group) => group.end < today)
    .sort((a, b) => (a.start > b.start ? -1 : 1))
  if (!current) return [...future, ...past]
  return todayPinned ? [current, ...future, ...past] : [...future, current, ...past]
}

export function groupPendingCount(
  todos: Todo[],
  group: DateGroup,
  repeatLongTerm = false
): number {
  const longTermRoots = repeatLongTerm ? getLongTermRootInfos(todos) : null
  const ids = new Set<string>()
  for (const todo of todos) {
    if (todo.parentId !== null || todo.status !== 'todo') continue
    if (todo.todoDate >= group.start && todo.todoDate <= group.end) {
      ids.add(todo.id)
      continue
    }
    const info = longTermRoots?.get(todo.id)
    if (info?.active && info.start <= group.end) ids.add(todo.id)
  }
  return ids.size
}

export function groupTaskCount(
  todos: Todo[],
  group: DateGroup,
  repeatLongTerm = false
): number {
  const longTermRoots = repeatLongTerm ? getLongTermRootInfos(todos) : null
  const ids = new Set<string>()
  for (const todo of todos) {
    if (todo.parentId !== null) continue
    if (todo.todoDate >= group.start && todo.todoDate <= group.end) {
      ids.add(todo.id)
      continue
    }
    const info = longTermRoots?.get(todo.id)
    if (info?.active && info.start <= group.end) ids.add(todo.id)
  }
  return ids.size
}

export function buildHistoryGroups(
  history: HistoryItem[],
  today: string,
  config: DateGroupingConfig
): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>()
  for (const item of history) {
    const group = groupForDate(item.todoDate, today, config)
    const existing = map.get(group.key)
    if (existing) existing.items.push(item)
    else map.set(group.key, { group, items: [item] })
  }
  const groups = Array.from(map.values())
  groups.sort((a, b) => (a.group.start > b.group.start ? -1 : 1))
  for (const group of groups) {
    group.items.sort((a, b) => {
      if (a.todoDate !== b.todoDate) return a.todoDate > b.todoDate ? -1 : 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }
  return groups
}

export function groupContainsDate(group: DateGroup, date: string): boolean {
  return group.start <= date && date <= group.end
}
