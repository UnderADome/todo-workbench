export type TaskStatus = 'todo' | 'done' | 'not_done' | 'deleted'
export type ActiveTaskStatus = Exclude<TaskStatus, 'deleted'>
export type Priority = 'low' | 'medium' | 'high'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'interval'
export type CompletedDisplay = 'bottom' | 'inline' | 'hidden'
export type HistoryScope = 'project' | 'all'
export type SortMode = 'created_desc' | 'created_asc' | 'priority'
export type TaskViewMode = 'list' | 'note'
export type DateGroupingMode = 'day' | 'week' | 'interval'

export interface ManualDateRange {
  id: string
  start: string
  end: string
  label?: string
}

export interface DateGroupingConfig {
  mode: DateGroupingMode
  intervalDays: number
  manualRanges: ManualDateRange[]
}

export interface ColumnWidths {
  function: number
  projects: number
  dates: number
  history: number
}

export interface CollapsedState {
  function: boolean
  projects: boolean
  dates: boolean
  history: boolean
}

export type FontRegionKey =
  | 'titlebar'
  | 'sidebar'
  | 'projects'
  | 'dates'
  | 'tasks'
  | 'history'
  | 'dialogs'

export const FONT_REGION_KEYS: FontRegionKey[] = [
  'titlebar',
  'sidebar',
  'projects',
  'dates',
  'tasks',
  'history',
  'dialogs'
]

export type FontFamilyPreset =
  | 'system'
  | 'yahei'
  | 'dengxian'
  | 'simsun'
  | 'simhei'
  | 'kaiti'
  | 'consolas'
  | 'custom'

export interface FontRegionConfig {
  scale: number
  family: FontFamilyPreset
  customFamily?: string
}

export interface FontSettings {
  regions: Record<FontRegionKey, FontRegionConfig>
}

export type ShortcutAction =
  | 'edit'
  | 'addChild'
  | 'pin'
  | 'priorityHigh'
  | 'priorityMedium'
  | 'priorityLow'
  | 'notDone'
  | 'delete'

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  'edit',
  'addChild',
  'pin',
  'priorityHigh',
  'priorityMedium',
  'priorityLow',
  'notDone',
  'delete'
]

export type ShortcutMap = Record<ShortcutAction, string>

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  edit: 'F2',
  addChild: 'Ctrl+Shift+N',
  pin: 'Ctrl+Shift+P',
  priorityHigh: 'Ctrl+Shift+1',
  priorityMedium: 'Ctrl+Shift+2',
  priorityLow: 'Ctrl+Shift+3',
  notDone: 'Ctrl+Shift+X',
  delete: 'Delete'
}

export interface AppSettings {
  todayPinned: boolean
  completedDisplay: CompletedDisplay
  defaultSort: SortMode
  taskViewDefault: TaskViewMode
  longTermRepeatInDateGroups: boolean
  moveSelectedProjectToTop: boolean
  historyScope: HistoryScope
  autoLaunch: boolean
  columnWidths: ColumnWidths
  collapsed: CollapsedState
  dateGrouping: DateGroupingConfig
  fonts: FontSettings
  shortcuts: ShortcutMap
  theme: 'light'
}

function defaultFontRegion(): FontRegionConfig {
  return { scale: 100, family: 'system', customFamily: '' }
}

export const DEFAULT_FONTS: FontSettings = {
  regions: {
    titlebar: defaultFontRegion(),
    sidebar: defaultFontRegion(),
    projects: defaultFontRegion(),
    dates: defaultFontRegion(),
    tasks: defaultFontRegion(),
    history: defaultFontRegion(),
    dialogs: defaultFontRegion()
  }
}

export const DEFAULT_SETTINGS: AppSettings = {
  todayPinned: true,
  completedDisplay: 'bottom',
  defaultSort: 'created_desc',
  taskViewDefault: 'list',
  longTermRepeatInDateGroups: true,
  moveSelectedProjectToTop: false,
  historyScope: 'project',
  autoLaunch: false,
  columnWidths: {
    function: 208,
    projects: 216,
    dates: 184,
    history: 336
  },
  collapsed: {
    function: false,
    projects: false,
    dates: false,
    history: false
  },
  dateGrouping: {
    mode: 'day',
    intervalDays: 10,
    manualRanges: []
  },
  fonts: DEFAULT_FONTS,
  shortcuts: DEFAULT_SHORTCUTS,
  theme: 'light'
}

export interface Project {
  id: string
  name: string
  createdAt: string
  lastEditedAt: string
  archivedAt: string | null
  pinnedAt: string | null
  dateGrouping: DateGroupingConfig
  taskView: TaskViewMode
  todayPendingCount?: number
}

export interface Todo {
  id: string
  projectId: string
  parentId: string | null
  rootId: string
  depth: number
  path: string
  todoDate: string
  content: string
  status: TaskStatus
  priority: Priority
  createdAt: string
  completedAt: string | null
  lastCompletedAt: string | null
  notDoneAt: string | null
  deletedAt: string | null
  previousStatus: string | null
  remindAt: string | null
  repeatRule: RepeatRule | null
  repeatIntervalMinutes: number | null
  advanceMinutes: number
  snoozeUntil: string | null
  reminderFiredAt: string | null
  updatedAt: string
  sortOrder: number
  pinnedAt: string | null
  isLongTerm: boolean
  projectName?: string
}

export interface ProjectData {
  project: Project
  todos: Todo[]
}

export interface BootstrapData {
  today: string
  appVersion: string
  projects: Project[]
  archivedCount: number
  recycleCount: number
  settings: AppSettings
}

export interface HistoryItem extends Todo {
  projectName: string
  hasLongTerm?: boolean
}

export interface RecycleItem extends Todo {
  projectName: string
}

export interface CreateTaskInput {
  projectId: string
  parentId?: string | null
  todoDate: string
  content: string
  priority?: Priority
}

export interface UpdateTaskInput {
  content?: string
  priority?: Priority
}

export interface ReminderInput {
  todoId: string
  remindAt: string
  repeatRule: RepeatRule
  repeatIntervalMinutes: number | null
  advanceMinutes: number
}

export interface DeleteResult {
  id: string
  mode: 'soft' | 'hard'
  content: string
}

export type TaskStatusAction =
  | 'complete'
  | 'uncomplete'
  | 'not_done'
  | 'restore_not_done'
  | 'delete'

export interface TaskStatusOptions {
  preserveCompletedAt?: boolean
}

export interface ReminderNotificationPayload {
  todo: Todo
}

export interface AppApi {
  bootstrap(): Promise<BootstrapData>
  getProjectData(projectId: string): Promise<ProjectData>
  getHistory(scope: HistoryScope, projectId: string | null): Promise<HistoryItem[]>
  getRecycleBin(): Promise<RecycleItem[]>
  getArchivedProjects(): Promise<Project[]>

  createProject(name: string): Promise<Project>
  renameProject(id: string, name: string): Promise<void>
  archiveProject(id: string): Promise<void>
  unarchiveProject(id: string): Promise<void>
  openProject(id: string): Promise<void>
  pinProject(id: string, pinned: boolean): Promise<void>
  updateProjectDateGrouping(projectId: string, config: DateGroupingConfig): Promise<Project>
  updateProjectTaskView(projectId: string, mode: TaskViewMode): Promise<Project>

  createTask(input: CreateTaskInput): Promise<Todo>
  updateTask(id: string, input: UpdateTaskInput): Promise<void>
  setTaskStatus(
    id: string,
    action: TaskStatusAction,
    options?: TaskStatusOptions
  ): Promise<DeleteResult | null>
  setTaskLongTerm(id: string, longTerm: boolean): Promise<void>
  restoreTask(id: string): Promise<void>
  purgeExpired(): Promise<number>
  purgeTasks(ids: string[]): Promise<number>
  pinTask(id: string, pinned: boolean): Promise<void>

  setReminder(input: ReminderInput): Promise<void>
  clearReminder(todoId: string): Promise<void>
  snoozeReminder(todoId: string, minutes: number): Promise<void>

  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  backupNow(): Promise<string>
  openDataDir(): Promise<void>
  testNotification(): Promise<{ ok: boolean; message: string }>

  windowMinimize(): void
  windowToggleMaximize(): void
  windowClose(): void

  onReminderClicked(listener: (payload: ReminderNotificationPayload) => void): () => void
}
