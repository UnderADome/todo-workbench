import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppApi,
  AppSettings,
  CreateTaskInput,
  DateGroupingConfig,
  HistoryScope,
  ReminderInput,
  ReminderNotificationPayload,
  TaskStatusAction,
  TaskStatusOptions,
  TaskViewMode,
  UpdateTaskInput
} from '../shared/types'

let reminderClickListener: ((payload: ReminderNotificationPayload) => void) | null = null
const pendingReminderClicks: ReminderNotificationPayload[] = []

ipcRenderer.on('reminder:clicked', (_event, payload: ReminderNotificationPayload) => {
  if (reminderClickListener) reminderClickListener(payload)
  else pendingReminderClicks.push(payload)
})

const api: AppApi = {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  getProjectData: (projectId: string) => ipcRenderer.invoke('project:data', projectId),
  getHistory: (scope: HistoryScope, projectId: string | null) =>
    ipcRenderer.invoke('history:list', scope, projectId),
  getRecycleBin: () => ipcRenderer.invoke('recycle:list'),
  getArchivedProjects: () => ipcRenderer.invoke('archive:list'),

  createProject: (name: string) => ipcRenderer.invoke('project:create', name),
  renameProject: (id: string, name: string) => ipcRenderer.invoke('project:rename', id, name),
  archiveProject: (id: string) => ipcRenderer.invoke('project:archive', id),
  unarchiveProject: (id: string) => ipcRenderer.invoke('project:unarchive', id),
  openProject: (id: string) => ipcRenderer.invoke('project:open', id),
  pinProject: (id: string, pinned: boolean) => ipcRenderer.invoke('project:pin', id, pinned),
  updateProjectDateGrouping: (projectId: string, config: DateGroupingConfig) =>
    ipcRenderer.invoke('project:dateGrouping', projectId, config),
  updateProjectTaskView: (projectId: string, mode: TaskViewMode) =>
    ipcRenderer.invoke('project:taskView', projectId, mode),

  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('task:create', input),
  updateTask: (id: string, input: UpdateTaskInput) => ipcRenderer.invoke('task:update', id, input),
  setTaskStatus: (id: string, action: TaskStatusAction, options?: TaskStatusOptions) =>
    ipcRenderer.invoke('task:status', id, action, options),
  setTaskLongTerm: (id: string, longTerm: boolean) => ipcRenderer.invoke('task:longTerm', id, longTerm),
  restoreTask: (id: string) => ipcRenderer.invoke('task:restore', id),
  purgeExpired: () => ipcRenderer.invoke('task:purge'),
  purgeTasks: (ids: string[]) => ipcRenderer.invoke('task:purgeTasks', ids),
  pinTask: (id: string, pinned: boolean) => ipcRenderer.invoke('task:pin', id, pinned),

  setReminder: (input: ReminderInput) => ipcRenderer.invoke('reminder:set', input),
  clearReminder: (todoId: string) => ipcRenderer.invoke('reminder:clear', todoId),
  snoozeReminder: (todoId: string, minutes: number) => ipcRenderer.invoke('reminder:snooze', todoId, minutes),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  backupNow: () => ipcRenderer.invoke('data:backup'),
  openDataDir: () => ipcRenderer.invoke('data:openDir'),
  testNotification: () => ipcRenderer.invoke('notification:test'),

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  onReminderClicked: (listener: (payload: ReminderNotificationPayload) => void) => {
    reminderClickListener = listener
    if (pendingReminderClicks.length > 0) {
      for (const payload of pendingReminderClicks.splice(0)) listener(payload)
    }
    return () => {
      if (reminderClickListener === listener) reminderClickListener = null
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
