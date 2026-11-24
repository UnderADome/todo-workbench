import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  FONT_REGION_KEYS,
  SHORTCUT_ACTIONS,
  type AppSettings,
  type BootstrapData,
  type FontRegionConfig,
  type CreateTaskInput,
  type DateGroupingConfig,
  type DeleteResult,
  type HistoryItem,
  type HistoryScope,
  type ManualDateRange,
  type Priority,
  type Project,
  type ProjectData,
  type RecycleItem,
  type ReminderInput,
  type ShortcutMap,
  type TaskStatusAction,
  type TaskStatusOptions,
  type TaskViewMode,
  type Todo,
  type UpdateTaskInput
} from '../shared/types'

let db: Database.Database | null = null
let databasePath = ''

type Row = Record<string, any>

export function initDatabase(filePath: string): Database.Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  databasePath = filePath
  const instance = new Database(filePath)
  instance.pragma('journal_mode = WAL')
  instance.pragma('foreign_keys = ON')
  instance.pragma('busy_timeout = 5000')
  migrate(instance)
  seed(instance)
  db = instance
  backfillProjectDefaults()
  return instance
}

export function getDb(): Database.Database {
  if (!db) throw new Error('数据库尚未初始化')
  return db
}

export function getDbPath(): string {
  return databasePath
}

function migrate(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      created_at     TEXT NOT NULL,
      last_edited_at TEXT NOT NULL,
      archived_at    TEXT,
      pinned_at      TEXT,
      date_grouping  TEXT,
      task_view      TEXT
    );

    CREATE TABLE IF NOT EXISTS todos (
      id                     TEXT PRIMARY KEY,
      project_id             TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id              TEXT REFERENCES todos(id) ON DELETE CASCADE,
      root_id                TEXT,
      depth                  INTEGER NOT NULL DEFAULT 0,
      path                   TEXT NOT NULL DEFAULT '',
      todo_date              TEXT NOT NULL,
      content                TEXT NOT NULL,
      status                 TEXT NOT NULL DEFAULT 'todo',
      priority               TEXT NOT NULL DEFAULT 'medium',
      created_at             TEXT NOT NULL,
      completed_at           TEXT,
      last_completed_at      TEXT,
      not_done_at            TEXT,
      deleted_at             TEXT,
      previous_status        TEXT,
      remind_at              TEXT,
      repeat_rule            TEXT,
      repeat_interval_minutes INTEGER,
      advance_minutes        INTEGER NOT NULL DEFAULT 0,
      snooze_until           TEXT,
      reminder_fired_at      TEXT,
      updated_at             TEXT NOT NULL,
      sort_order             INTEGER NOT NULL DEFAULT 0,
      pinned_at              TEXT,
      is_long_term           INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_todos_project_date ON todos(project_id, todo_date);
    CREATE INDEX IF NOT EXISTS idx_todos_status_date  ON todos(status, todo_date);
    CREATE INDEX IF NOT EXISTS idx_todos_parent       ON todos(parent_id);
    CREATE INDEX IF NOT EXISTS idx_todos_root         ON todos(root_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id                       TEXT PRIMARY KEY,
      todo_id                  TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      scheduled_at             TEXT NOT NULL,
      repeat_rule              TEXT,
      repeat_interval_minutes  INTEGER,
      advance_minutes          INTEGER NOT NULL DEFAULT 0,
      status                   TEXT NOT NULL DEFAULT 'pending',
      fired_at                 TEXT,
      created_at               TEXT NOT NULL,
      updated_at               TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // 旧版本数据库升级：项目级日期分组与项目置顶。
  const projectColumns = instance.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
  if (!projectColumns.some((column) => column.name === 'pinned_at')) {
    instance.exec('ALTER TABLE projects ADD COLUMN pinned_at TEXT')
  }
  if (!projectColumns.some((column) => column.name === 'date_grouping')) {
    instance.exec('ALTER TABLE projects ADD COLUMN date_grouping TEXT')
  }
  if (!projectColumns.some((column) => column.name === 'task_view')) {
    instance.exec('ALTER TABLE projects ADD COLUMN task_view TEXT')
  }

  const todoColumns = instance.prepare('PRAGMA table_info(todos)').all() as { name: string }[]
  if (!todoColumns.some((column) => column.name === 'last_completed_at')) {
    instance.exec('ALTER TABLE todos ADD COLUMN last_completed_at TEXT')
  }
  if (!todoColumns.some((column) => column.name === 'is_long_term')) {
    instance.exec('ALTER TABLE todos ADD COLUMN is_long_term INTEGER NOT NULL DEFAULT 0')
  }
  instance.pragma('user_version = 4')
}

function seed(instance: Database.Database): void {
  const now = nowIso()
  const projectCount = instance.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }
  if (projectCount.c === 0) {
    instance
      .prepare('INSERT INTO projects (id, name, created_at, last_edited_at, archived_at) VALUES (?, ?, ?, ?, NULL)')
      .run(randomUUID(), '默认项目', now, now)
  }
  const settingsRow = instance.prepare('SELECT value FROM settings WHERE key = ?').get('app.settings') as
    | { value: string }
    | undefined
  if (!settingsRow) {
    instance
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('app.settings', JSON.stringify(DEFAULT_SETTINGS), now)
  }
}

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

function cloneDateGrouping(config: DateGroupingConfig): DateGroupingConfig {
  return {
    mode: config.mode,
    intervalDays: config.intervalDays,
    manualRanges: config.manualRanges.map((range) => ({ ...range }))
  }
}

function normalizeDateGrouping(
  input: Partial<DateGroupingConfig> | undefined,
  fallback: DateGroupingConfig
): DateGroupingConfig {
  const mode =
    input?.mode === 'day' || input?.mode === 'week' || input?.mode === 'interval'
      ? input.mode
      : fallback.mode
  const rawDays = Number(input?.intervalDays)
  const intervalDays = Number.isFinite(rawDays)
    ? Math.min(31, Math.max(1, Math.floor(rawDays)))
    : fallback.intervalDays
  const manualRanges = Array.isArray(input?.manualRanges)
    ? input.manualRanges
        .filter(
          (range): range is ManualDateRange =>
            Boolean(range) && typeof range.id === 'string' && typeof range.start === 'string' && typeof range.end === 'string'
        )
        .map((range) => ({
          id: range.id,
          start: range.start,
          end: range.end,
          label: typeof range.label === 'string' ? range.label : undefined
        }))
    : fallback.manualRanges.map((range) => ({ ...range }))
  return { mode, intervalDays, manualRanges }
}

function parseProjectDateGrouping(raw: string | null, fallback: DateGroupingConfig): DateGroupingConfig {
  if (!raw) return cloneDateGrouping(fallback)
  try {
    return normalizeDateGrouping(JSON.parse(raw) as Partial<DateGroupingConfig>, fallback)
  } catch {
    return cloneDateGrouping(fallback)
  }
}

function backfillProjectDefaults(): void {
  const defaults = getSettings()
  getDb()
    .prepare(
      `UPDATE projects
       SET date_grouping = COALESCE(date_grouping, ?),
           task_view = COALESCE(task_view, ?)
       WHERE date_grouping IS NULL OR task_view IS NULL`
    )
    .run(JSON.stringify(defaults.dateGrouping), defaults.taskViewDefault)
}

function mapProject(
  row: Row,
  fallbackGrouping: DateGroupingConfig,
  fallbackTaskView: TaskViewMode
): Project {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastEditedAt: row.last_edited_at,
    archivedAt: row.archived_at ?? null,
    pinnedAt: row.pinned_at ?? null,
    dateGrouping: parseProjectDateGrouping(row.date_grouping ?? null, fallbackGrouping),
    taskView: row.task_view === 'note' ? 'note' : row.task_view === 'list' ? 'list' : fallbackTaskView,
    todayPendingCount: row.today_pending_count !== undefined ? Number(row.today_pending_count) : undefined
  }
}

function mapTodo(row: Row): Todo {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id ?? null,
    rootId: row.root_id ?? row.id,
    depth: Number(row.depth ?? 0),
    path: row.path ?? '',
    todoDate: row.todo_date,
    content: row.content,
    status: row.status,
    priority: row.priority ?? 'medium',
    createdAt: row.created_at,
    completedAt: row.completed_at ?? null,
    lastCompletedAt: row.last_completed_at ?? null,
    notDoneAt: row.not_done_at ?? null,
    deletedAt: row.deleted_at ?? null,
    previousStatus: row.previous_status ?? null,
    remindAt: row.remind_at ?? null,
    repeatRule: row.repeat_rule ?? null,
    repeatIntervalMinutes: row.repeat_interval_minutes ?? null,
    advanceMinutes: Number(row.advance_minutes ?? 0),
    snoozeUntil: row.snooze_until ?? null,
    reminderFiredAt: row.reminder_fired_at ?? null,
    updatedAt: row.updated_at,
    sortOrder: Number(row.sort_order ?? 0),
    pinnedAt: row.pinned_at ?? null,
    isLongTerm: Boolean(row.is_long_term),
    projectName: row.project_name
  }
}

function getTodoRow(id: string): Row | undefined {
  return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id) as Row | undefined
}

export function getTodoById(id: string): Todo | null {
  const row = getTodoRow(id)
  return row ? mapTodo(row) : null
}

function touchProject(projectId: string): void {
  getDb()
    .prepare('UPDATE projects SET last_edited_at = ? WHERE id = ?')
    .run(nowIso(), projectId)
}

export function getRawSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setRawSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, nowIso())
}

export function getSettings(): AppSettings {
  const raw = getRawSetting('app.settings')
  let parsed: Partial<AppSettings> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Partial<AppSettings>
    } catch {
      parsed = {}
    }
  }
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    columnWidths: {
      ...DEFAULT_SETTINGS.columnWidths,
      ...(parsed.columnWidths ?? {})
    },
    collapsed: {
      ...DEFAULT_SETTINGS.collapsed,
      ...(parsed.collapsed ?? {})
    },
    dateGrouping: {
      ...DEFAULT_SETTINGS.dateGrouping,
      ...(parsed.dateGrouping ?? {}),
      manualRanges: parsed.dateGrouping?.manualRanges ?? DEFAULT_SETTINGS.dateGrouping.manualRanges
    },
    fonts: {
      regions: Object.fromEntries(
        FONT_REGION_KEYS.map((key) => [
          key,
          {
            ...DEFAULT_SETTINGS.fonts.regions[key],
            ...(parsed.fonts?.regions?.[key] ?? {})
          }
        ])
      ) as Record<string, FontRegionConfig>
    } as AppSettings['fonts'],
    shortcuts: Object.fromEntries(
      SHORTCUT_ACTIONS.map((action) => [
        action,
        parsed.shortcuts?.[action] ?? DEFAULT_SETTINGS.shortcuts[action]
      ])
    ) as ShortcutMap,
    taskViewDefault: parsed.taskViewDefault === 'note' ? 'note' : 'list',
    longTermRepeatInDateGroups: parsed.longTermRepeatInDateGroups !== false,
    moveSelectedProjectToTop: parsed.moveSelectedProjectToTop === true,
    theme: 'light'
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    columnWidths: {
      ...current.columnWidths,
      ...(patch.columnWidths ?? {})
    },
    collapsed: {
      ...current.collapsed,
      ...(patch.collapsed ?? {})
    },
    dateGrouping: {
      ...current.dateGrouping,
      ...(patch.dateGrouping ?? {}),
      manualRanges: patch.dateGrouping?.manualRanges ?? current.dateGrouping.manualRanges
    },
    fonts: patch.fonts
      ? {
          regions: Object.fromEntries(
            FONT_REGION_KEYS.map((key) => [
              key,
              {
                ...current.fonts.regions[key],
                ...(patch.fonts?.regions?.[key] ?? {})
              }
            ])
          ) as Record<string, FontRegionConfig>
        }
      : current.fonts,
    shortcuts: patch.shortcuts
      ? (Object.fromEntries(
          SHORTCUT_ACTIONS.map((action) => [
            action,
            patch.shortcuts?.[action] ?? current.shortcuts[action]
          ])
        ) as ShortcutMap)
      : current.shortcuts,
    taskViewDefault:
      patch.taskViewDefault === 'note' || patch.taskViewDefault === 'list'
        ? patch.taskViewDefault
        : current.taskViewDefault,
    longTermRepeatInDateGroups:
      typeof patch.longTermRepeatInDateGroups === 'boolean'
        ? patch.longTermRepeatInDateGroups
        : current.longTermRepeatInDateGroups,
    moveSelectedProjectToTop:
      typeof patch.moveSelectedProjectToTop === 'boolean'
        ? patch.moveSelectedProjectToTop
        : current.moveSelectedProjectToTop,
    theme: 'light'
  }
  setRawSetting('app.settings', JSON.stringify(next))
  return next
}

export function getProjects(): Project[] {
  const today = localToday()
  const defaults = getSettings()
  const rows = getDb()
    .prepare(
      `SELECT p.*, (
         SELECT COUNT(*) FROM todos t
         WHERE t.project_id = p.id
           AND t.parent_id IS NULL
           AND t.status = 'todo'
           AND t.deleted_at IS NULL
           AND t.todo_date <= ?
           AND (
             t.todo_date = ?
             OR (
               ? = 1
               AND EXISTS (
                 SELECT 1 FROM todos lt
                 WHERE lt.root_id = COALESCE(t.root_id, t.id)
                   AND lt.deleted_at IS NULL
                   AND lt.is_long_term = 1
               )
             )
           )
       ) AS today_pending_count
       FROM projects p
       WHERE p.archived_at IS NULL
       ORDER BY p.pinned_at IS NULL, p.pinned_at DESC, p.last_edited_at DESC`
    )
    .all(today, today, defaults.longTermRepeatInDateGroups ? 1 : 0) as Row[]
  return rows.map((row) => mapProject(row, defaults.dateGrouping, defaults.taskViewDefault))
}

export function getArchivedProjects(): Project[] {
  const defaults = getSettings()
  const rows = getDb()
    .prepare('SELECT * FROM projects WHERE archived_at IS NOT NULL ORDER BY archived_at DESC')
    .all() as Row[]
  return rows.map((row) => mapProject(row, defaults.dateGrouping, defaults.taskViewDefault))
}

export function getProject(projectId: string): Project {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Row | undefined
  if (!row) throw new Error('项目不存在')
  const defaults = getSettings()
  return mapProject(row, defaults.dateGrouping, defaults.taskViewDefault)
}

export function createProject(name: string): Project {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('项目名称不能为空')
  const now = nowIso()
  const id = randomUUID()
  const defaults = getSettings()
  getDb()
    .prepare(
      `INSERT INTO projects
       (id, name, created_at, last_edited_at, archived_at, pinned_at, date_grouping, task_view)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`
    )
    .run(id, trimmed, now, now, JSON.stringify(defaults.dateGrouping), defaults.taskViewDefault)
  return getProject(id)
}

export function renameProject(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('项目名称不能为空')
  const now = nowIso()
  getDb()
    .prepare('UPDATE projects SET name = ?, last_edited_at = ? WHERE id = ?')
    .run(trimmed, now, id)
}

export function pinProject(id: string, pinned: boolean): void {
  const project = getProject(id)
  getDb()
    .prepare('UPDATE projects SET pinned_at = ? WHERE id = ?')
    .run(pinned ? nowIso() : null, project.id)
}

export function updateProjectDateGrouping(projectId: string, config: DateGroupingConfig): Project {
  const project = getProject(projectId)
  const normalized = normalizeDateGrouping(config, project.dateGrouping)
  getDb()
    .prepare('UPDATE projects SET date_grouping = ? WHERE id = ?')
    .run(JSON.stringify(normalized), projectId)
  return getProject(projectId)
}

export function updateProjectTaskView(projectId: string, mode: TaskViewMode): Project {
  getProject(projectId)
  if (mode !== 'list' && mode !== 'note') throw new Error('任务视图类型不支持')
  getDb().prepare('UPDATE projects SET task_view = ? WHERE id = ?').run(mode, projectId)
  return getProject(projectId)
}

export function touchProjectById(id: string): void {
  touchProject(id)
}

export function archiveProject(id: string): void {
  const now = nowIso()
  const database = getDb()
  const tx = database.transaction(() => {
    database.prepare('UPDATE projects SET archived_at = ?, last_edited_at = ? WHERE id = ?').run(now, now, id)
    database
      .prepare(
        `UPDATE todos
         SET remind_at = NULL, repeat_rule = NULL, repeat_interval_minutes = NULL,
             advance_minutes = 0, snooze_until = NULL, reminder_fired_at = NULL, updated_at = ?
         WHERE project_id = ?`
      )
      .run(now, id)
    cancelProjectReminderRecords(id, now)
  })
  tx()
}

export function unarchiveProject(id: string): void {
  getDb()
    .prepare('UPDATE projects SET archived_at = NULL, last_edited_at = ? WHERE id = ?')
    .run(nowIso(), id)
}

export function openProject(id: string): void {
  if (getSettings().moveSelectedProjectToTop) touchProject(id)
}

export function getProjectData(projectId: string): ProjectData {
  const project = getProject(projectId)
  const rows = getDb()
    .prepare(
      `SELECT * FROM todos
       WHERE project_id = ? AND deleted_at IS NULL
       ORDER BY pinned_at IS NULL, pinned_at DESC, created_at DESC`
    )
    .all(projectId) as Row[]
  return { project, todos: rows.map(mapTodo) }
}

export function getHistory(scope: HistoryScope, projectId: string | null): HistoryItem[] {
  const today = localToday()
  const database = getDb()
  const params: string[] = [today]
  let projectFilter = ''
  if (scope === 'project') {
    if (!projectId) return []
    projectFilter = ' AND t.project_id = ?'
    params.push(projectId)
  }
  const rows = database
    .prepare(
      `SELECT t.*, p.name AS project_name,
         EXISTS (
           SELECT 1 FROM todos lt
           WHERE lt.root_id = COALESCE(t.root_id, t.id)
             AND lt.deleted_at IS NULL
             AND lt.is_long_term = 1
         ) AS has_long_term
       FROM todos t
       JOIN projects p ON p.id = t.project_id
       WHERE t.parent_id IS NULL
         AND t.status = 'todo'
         AND t.deleted_at IS NULL
         AND t.todo_date < ?
         AND p.archived_at IS NULL
         ${projectFilter}
       ORDER BY t.todo_date DESC, t.pinned_at IS NULL, t.pinned_at DESC, t.created_at DESC`
    )
    .all(...params) as Row[]
  return rows.map((row) => ({
    ...mapTodo(row),
    projectName: row.project_name,
    hasLongTerm: Boolean(row.has_long_term)
  }))
}

export function getRecycleBin(): RecycleItem[] {
  const rows = getDb()
    .prepare(
      `SELECT t.*, p.name AS project_name
       FROM todos t
       JOIN projects p ON p.id = t.project_id
       WHERE t.parent_id IS NULL AND t.status = 'deleted'
       ORDER BY t.deleted_at DESC`
    )
    .all() as Row[]
  return rows.map((row) => ({ ...mapTodo(row), projectName: row.project_name }))
}

export function getBootstrap(appVersion: string): BootstrapData {
  const archived = getArchivedProjects()
  const recycle = getRecycleBin()
  return {
    today: localToday(),
    appVersion,
    projects: getProjects(),
    archivedCount: archived.length,
    recycleCount: recycle.length,
    settings: getSettings()
  }
}

function getDescendantIds(id: string): string[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM todos WHERE id = ?
         UNION ALL
         SELECT t.id FROM todos t JOIN subtree s ON t.parent_id = s.id
       )
       SELECT id FROM subtree`
    )
    .all(id) as { id: string }[]
  return rows.map((r) => r.id)
}

function getAncestorIds(id: string): string[] {
  const rows = getDb()
    .prepare(
      `WITH RECURSIVE ancestors(id, parent_id) AS (
         SELECT id, parent_id FROM todos WHERE id = ?
         UNION ALL
         SELECT t.id, t.parent_id FROM todos t JOIN ancestors a ON t.id = a.parent_id
       )
       SELECT id FROM ancestors WHERE id != ?`
    )
    .all(id, id) as { id: string }[]
  return rows.map((r) => r.id)
}

function allChildrenDone(parentId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM todos
       WHERE parent_id = ? AND deleted_at IS NULL AND status != 'done'`
    )
    .get(parentId) as { c: number }
  return row.c === 0
}

function openAncestorsForNewChild(parentId: string, now: string): void {
  const ids = [parentId, ...getAncestorIds(parentId)]
  const stmt = getDb().prepare(
    `UPDATE todos
     SET status = 'todo',
         last_completed_at = COALESCE(completed_at, last_completed_at),
         completed_at = NULL,
         not_done_at = NULL,
         updated_at = ?
     WHERE id = ?`
  )
  for (const id of ids) stmt.run(now, id)
}

export function createTask(input: CreateTaskInput): Todo {
  const content = input.content.trim()
  if (!content) throw new Error('待办内容不能为空')
  const project = getProject(input.projectId)
  if (project.archivedAt) throw new Error('归档项目不能新增任务')
  const database = getDb()
  const now = nowIso()
  const id = randomUUID()
  let parentId: string | null = null
  let rootId = id
  let depth = 0
  let taskPath = `/${id}`

  if (input.parentId) {
    const parent = getTodoRow(input.parentId)
    if (!parent) throw new Error('父任务不存在')
    if (parent.project_id !== input.projectId) throw new Error('父任务不属于当前项目')
    if (parent.deleted_at) throw new Error('父任务已删除')
    parentId = parent.id
    rootId = parent.root_id ?? parent.id
    depth = Number(parent.depth ?? 0) + 1
    taskPath = `${parent.path ?? `/${parent.id}`}/${id}`
  }

  const tx = database.transaction(() => {
    database
      .prepare(
        `INSERT INTO todos
         (id, project_id, parent_id, root_id, depth, path, todo_date, content, status, priority,
          created_at, completed_at, not_done_at, deleted_at, previous_status,
          remind_at, repeat_rule, repeat_interval_minutes, advance_minutes, snooze_until,
          reminder_fired_at, updated_at, sort_order, pinned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'todo', ?, ?, NULL, NULL, NULL, NULL,
                 NULL, NULL, NULL, 0, NULL, NULL, ?, 0, NULL)`
      )
      .run(
        id,
        input.projectId,
        parentId,
        rootId,
        depth,
        taskPath,
        input.todoDate,
        content,
        input.priority ?? 'medium',
        now,
        now
      )
    if (parentId) openAncestorsForNewChild(parentId, now)
    touchProject(input.projectId)
  })
  tx()
  return mapTodo(getTodoRow(id)!)
}

export function updateTask(id: string, input: UpdateTaskInput): void {
  const row = getTodoRow(id)
  if (!row) throw new Error('任务不存在')
  const content = input.content !== undefined ? input.content.trim() : row.content
  if (!content) throw new Error('待办内容不能为空')
  const priority = (input.priority ?? row.priority) as Priority
  // 内容与优先级都未变化时直接返回，避免空编辑写入更新时间或刷新项目排序。
  if (content === row.content && priority === row.priority) return
  const now = nowIso()
  getDb()
    .prepare('UPDATE todos SET content = ?, priority = ?, updated_at = ? WHERE id = ?')
    .run(content, priority, now, id)
  touchProject(row.project_id)
}

export function setTaskStatus(
  id: string,
  action: TaskStatusAction,
  options?: TaskStatusOptions
): DeleteResult | null {
  const row = getTodoRow(id)
  if (!row) throw new Error('任务不存在')
  if (row.status === 'deleted' && action !== 'delete') throw new Error('任务已删除')
  const database = getDb()
  const now = nowIso()
  let result: DeleteResult | null = null

  const tx = database.transaction(() => {
    if (action === 'complete') {
      const ids = getDescendantIds(id)
      const previousCompleted = row.last_completed_at ? String(row.last_completed_at) : null
      const directCompletedAt =
        options?.preserveCompletedAt === true && previousCompleted ? previousCompleted : now
      const stmt = database.prepare(
        `UPDATE todos
         SET status = 'done', completed_at = ?, last_completed_at = ?, not_done_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      for (const taskId of ids) {
        const stamp = taskId === id ? directCompletedAt : now
        stmt.run(stamp, stamp, now, taskId)
      }

      let parentId = row.parent_id as string | null
      while (parentId) {
        const parent = getTodoRow(parentId)
        if (!parent || parent.status === 'deleted' || parent.status === 'not_done') break
        if (!allChildrenDone(parentId)) break
        database
          .prepare(
            `UPDATE todos
             SET status = 'done', completed_at = ?, last_completed_at = ?, not_done_at = NULL, updated_at = ?
             WHERE id = ?`
          )
          .run(now, now, now, parentId)
        parentId = parent.parent_id
      }
      const root = getTodoRow(row.root_id ?? row.id)
      if (root?.status === 'done') cancelReminderRecords(root.id, now)
      return
    }

    if (action === 'uncomplete') {
      const ids = getDescendantIds(id)
      const ancestors = getAncestorIds(id)
      const stmt = database.prepare(
        `UPDATE todos
         SET status = 'todo',
             last_completed_at = COALESCE(completed_at, last_completed_at),
             completed_at = NULL,
             not_done_at = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      for (const taskId of [...ids, ...ancestors]) stmt.run(now, taskId)
      return
    }

    if (action === 'not_done') {
      if (row.parent_id) throw new Error('子项不支持“不做”')
      database
        .prepare(
          `UPDATE todos
           SET status = 'not_done',
               not_done_at = ?,
               last_completed_at = COALESCE(completed_at, last_completed_at),
               completed_at = NULL,
               updated_at = ?
           WHERE id = ?`
        )
        .run(now, now, id)
      cancelReminderRecords(id, now)
      return
    }

    if (action === 'restore_not_done') {
      database
        .prepare(
          `UPDATE todos SET status = 'todo', not_done_at = NULL, completed_at = NULL, updated_at = ? WHERE id = ?`
        )
        .run(now, id)
      return
    }

    if (action === 'delete') {
      if (!row.parent_id) {
        const ids = getDescendantIds(id)
        const stmt = database.prepare(
          `UPDATE todos
           SET previous_status = status, status = 'deleted', deleted_at = ?, updated_at = ?
           WHERE id = ? AND status != 'deleted'`
        )
        for (const taskId of ids) stmt.run(now, now, taskId)
        cancelReminderRecords(row.root_id ?? row.id, now)
        result = { id, mode: 'soft', content: row.content }
      } else {
        const ids = getDescendantIds(id)
        const placeholders = ids.map(() => '?').join(',')
        database.prepare(`DELETE FROM reminders WHERE todo_id IN (${placeholders})`).run(...ids)
        database.prepare('DELETE FROM todos WHERE id = ?').run(id)
        result = { id, mode: 'hard', content: row.content }
      }
      return
    }
  })
  tx()
  touchProject(row.project_id)
  return result
}

export function restoreTask(id: string): void {
  const row = getTodoRow(id)
  if (!row || row.status !== 'deleted') throw new Error('未找到可恢复的任务')
  if (row.parent_id) throw new Error('只能恢复根任务')
  const project = getProject(row.project_id)
  if (project.archivedAt) throw new Error('所属项目已归档，请先取消归档后再恢复任务')
  const database = getDb()
  const now = nowIso()
  const ids = getDescendantIds(id)
  const stmt = database.prepare(
    `UPDATE todos
     SET status = COALESCE(previous_status, 'todo'), deleted_at = NULL, previous_status = NULL, updated_at = ?
     WHERE id = ? AND status = 'deleted'`
  )
  const tx = database.transaction(() => {
    for (const taskId of ids) stmt.run(now, taskId)
  })
  tx()
  touchProject(row.project_id)
}

export function purgeExpiredTasks(): number {
  const database = getDb()
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const rows = database
    .prepare(`SELECT id FROM todos WHERE parent_id IS NULL AND status = 'deleted' AND deleted_at < ?`)
    .all(cutoff) as { id: string }[]
  const del = database.prepare('DELETE FROM todos WHERE id = ?')
  const tx = database.transaction(() => {
    for (const row of rows) del.run(row.id)
  })
  tx()
  return rows.length
}

export function purgeTasks(ids: string[]): number {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))]
  if (uniqueIds.length === 0) return 0
  const database = getDb()
  const placeholders = uniqueIds.map(() => '?').join(',')
  const rows = database
    .prepare(
      `SELECT id FROM todos
       WHERE parent_id IS NULL AND status = 'deleted' AND id IN (${placeholders})`
    )
    .all(...uniqueIds) as { id: string }[]
  const del = database.prepare('DELETE FROM todos WHERE id = ?')
  const tx = database.transaction(() => {
    for (const row of rows) del.run(row.id)
  })
  tx()
  return rows.length
}

export function pinTask(id: string, pinned: boolean): void {
  const row = getTodoRow(id)
  if (!row) throw new Error('任务不存在')
  const now = nowIso()
  getDb()
    .prepare('UPDATE todos SET pinned_at = ?, updated_at = ? WHERE id = ?')
    .run(pinned ? now : null, now, id)
  touchProject(row.project_id)
}

export function setTaskLongTerm(id: string, longTerm: boolean): void {
  const row = getTodoRow(id)
  if (!row) throw new Error('任务不存在')
  const next = longTerm ? 1 : 0
  if (Number(row.is_long_term ?? 0) === next) return
  const now = nowIso()
  getDb()
    .prepare('UPDATE todos SET is_long_term = ?, updated_at = ? WHERE id = ?')
    .run(next, now, id)
  touchProject(row.project_id)
}

export function setReminder(input: ReminderInput): void {
  const row = getTodoRow(input.todoId)
  if (!row) throw new Error('任务不存在')
  if (row.parent_id) throw new Error('子项不支持独立提醒')
  if (row.status !== 'todo') throw new Error('只有待办任务可以设置提醒')
  const when = new Date(input.remindAt)
  if (Number.isNaN(when.getTime())) throw new Error('提醒时间格式不正确')
  if (when.getTime() <= Date.now()) throw new Error('提醒时间必须晚于当前时间')

  const allowedAdvance = [0, 5, 15, 30, 60]
  if (!allowedAdvance.includes(input.advanceMinutes)) throw new Error('提前提醒分钟数不支持')
  if (input.repeatRule === 'interval') {
    const interval = input.repeatIntervalMinutes ?? 0
    if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
      throw new Error('循环间隔需为 1–1440 分钟')
    }
    if (input.advanceMinutes >= interval) throw new Error('提前提醒必须小于循环间隔')
  }

  const database = getDb()
  const now = nowIso()
  const repeatInterval = input.repeatRule === 'interval' ? input.repeatIntervalMinutes : null

  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE todos
         SET remind_at = ?, repeat_rule = ?, repeat_interval_minutes = ?, advance_minutes = ?,
             snooze_until = NULL, reminder_fired_at = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(input.remindAt, input.repeatRule, repeatInterval, input.advanceMinutes, now, input.todoId)
    database
      .prepare(`UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE todo_id = ? AND status IN ('pending','snoozed')`)
      .run(now, input.todoId)
    database
      .prepare(
        `INSERT INTO reminders
         (id, todo_id, scheduled_at, repeat_rule, repeat_interval_minutes, advance_minutes, status, fired_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
      )
      .run(randomUUID(), input.todoId, input.remindAt, input.repeatRule, repeatInterval, input.advanceMinutes, now, now)
    touchProject(row.project_id)
  })
  tx()
}

export function clearReminder(todoId: string): void {
  const row = getTodoRow(todoId)
  if (!row) throw new Error('任务不存在')
  const now = nowIso()
  const database = getDb()
  database
    .prepare(
      `UPDATE todos
       SET remind_at = NULL, repeat_rule = NULL, repeat_interval_minutes = NULL,
           advance_minutes = 0, snooze_until = NULL, reminder_fired_at = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(now, todoId)
  cancelReminderRecords(todoId, now)
  touchProject(row.project_id)
}

export function snoozeReminder(todoId: string, minutes: number): void {
  const row = getTodoRow(todoId)
  if (!row) throw new Error('任务不存在')
  if (![5, 10, 30].includes(minutes)) throw new Error('稍后提醒分钟数不支持')
  const nowDate = new Date()
  const until = new Date(nowDate.getTime() + minutes * 60 * 1000)
  const now = nowIso()
  const database = getDb()
  database
    .prepare('UPDATE todos SET snooze_until = ?, updated_at = ? WHERE id = ?')
    .run(until.toISOString(), now, todoId)
  database
    .prepare(`UPDATE reminders SET status = 'snoozed', updated_at = ? WHERE todo_id = ? AND status = 'pending'`)
    .run(now, todoId)
  database
    .prepare(
      `INSERT INTO reminders
       (id, todo_id, scheduled_at, repeat_rule, repeat_interval_minutes, advance_minutes, status, fired_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'snoozed', NULL, ?, ?)`
    )
    .run(
      randomUUID(),
      todoId,
      until.toISOString(),
      row.repeat_rule,
      row.repeat_interval_minutes,
      row.advance_minutes,
      now,
      now
    )
  touchProject(row.project_id)
}

function cancelReminderRecords(todoId: string, now: string): void {
  getDb()
    .prepare(`UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE todo_id = ? AND status IN ('pending','snoozed')`)
    .run(now, todoId)
}

function cancelProjectReminderRecords(projectId: string, now: string): void {
  getDb()
    .prepare(
      `UPDATE reminders SET status = 'cancelled', updated_at = ?
       WHERE todo_id IN (SELECT id FROM todos WHERE project_id = ?)
         AND status IN ('pending','snoozed')`
    )
    .run(now, projectId)
}

export function getReminderTodos(): Todo[] {
  const rows = getDb()
    .prepare(
      `SELECT t.*, p.name AS project_name
       FROM todos t
       JOIN projects p ON p.id = t.project_id
       WHERE t.remind_at IS NOT NULL
         AND t.status = 'todo'
         AND t.deleted_at IS NULL
         AND t.parent_id IS NULL
         AND p.archived_at IS NULL`
    )
    .all() as Row[]
  return rows.map(mapTodo)
}

export function markReminderFired(todoId: string, nextRemindAt: string | null, firedAt: string): void {
  const row = getTodoRow(todoId)
  if (!row) return
  const database = getDb()
  const tx = database.transaction(() => {
    database
      .prepare(
        `UPDATE todos
         SET reminder_fired_at = ?, snooze_until = NULL,
             remind_at = COALESCE(?, remind_at), updated_at = ?
         WHERE id = ?`
      )
      .run(firedAt, nextRemindAt, firedAt, todoId)
    database
      .prepare(`UPDATE reminders SET status = 'sent', fired_at = ?, updated_at = ? WHERE todo_id = ? AND status IN ('pending','snoozed')`)
      .run(firedAt, firedAt, todoId)
    if (nextRemindAt) {
      database
        .prepare(
          `INSERT INTO reminders
           (id, todo_id, scheduled_at, repeat_rule, repeat_interval_minutes, advance_minutes, status, fired_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)`
        )
        .run(
          randomUUID(),
          todoId,
          nextRemindAt,
          row.repeat_rule,
          row.repeat_interval_minutes,
          row.advance_minutes,
          firedAt,
          firedAt
        )
    }
  })
  tx()
}

export function backupDatabaseTo(directory: string): string {
  fs.mkdirSync(directory, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const destination = path.join(directory, `todolist-${stamp}.db`)
  getDb().pragma('wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(databasePath, destination)
  const files = fs
    .readdirSync(directory)
    .filter((file) => file.startsWith('todolist-') && file.endsWith('.db'))
    .sort()
  while (files.length > 7) {
    const oldest = files.shift()
    if (oldest) fs.unlinkSync(path.join(directory, oldest))
  }
  return destination
}
