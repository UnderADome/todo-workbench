import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  archiveProject,
  backupDatabaseTo,
  clearReminder,
  createProject,
  createTask,
  getArchivedProjects,
  getBootstrap,
  getHistory,
  getProjectData,
  getRecycleBin,
  getSettings,
  getDbPath,
  openProject,
  pinProject,
  pinTask,
  purgeExpiredTasks,
  purgeTasks,
  renameProject,
  restoreTask,
  setReminder,
  setTaskLongTerm,
  setTaskStatus,
  snoozeReminder,
  unarchiveProject,
  updateProjectDateGrouping,
  updateProjectTaskView,
  updateSettings,
  updateTask
} from './db'
import { sendTestNotification } from './reminders'
import type {
  AppSettings,
  CreateTaskInput,
  DateGroupingConfig,
  HistoryScope,
  ReminderInput,
  TaskStatusAction,
  TaskStatusOptions,
  TaskViewMode,
  UpdateTaskInput
} from '../shared/types'

type WindowAccessor = () => BrowserWindow | null

export function applyAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch (error) {
    console.error('设置开机自启失败', error)
  }
}

export function registerIpc(getWindow: WindowAccessor): void {
  ipcMain.handle('bootstrap', () => getBootstrap(app.getVersion()))

  ipcMain.handle('project:data', (_event, projectId: string) => getProjectData(projectId))
  ipcMain.handle('history:list', (_event, scope: HistoryScope, projectId: string | null) => getHistory(scope, projectId))
  ipcMain.handle('recycle:list', () => getRecycleBin())
  ipcMain.handle('archive:list', () => getArchivedProjects())

  ipcMain.handle('project:create', (_event, name: string) => createProject(name))
  ipcMain.handle('project:rename', (_event, id: string, name: string) => renameProject(id, name))
  ipcMain.handle('project:archive', (_event, id: string) => archiveProject(id))
  ipcMain.handle('project:unarchive', (_event, id: string) => unarchiveProject(id))
  ipcMain.handle('project:open', (_event, id: string) => openProject(id))
  ipcMain.handle('project:pin', (_event, id: string, pinned: boolean) => pinProject(id, pinned))
  ipcMain.handle('project:dateGrouping', (_event, id: string, config: DateGroupingConfig) =>
    updateProjectDateGrouping(id, config)
  )
  ipcMain.handle('project:taskView', (_event, id: string, mode: TaskViewMode) =>
    updateProjectTaskView(id, mode)
  )

  ipcMain.handle('task:create', (_event, input: CreateTaskInput) => createTask(input))
  ipcMain.handle('task:update', (_event, id: string, input: UpdateTaskInput) => updateTask(id, input))
  ipcMain.handle('task:status', (_event, id: string, action: TaskStatusAction, options?: TaskStatusOptions) =>
    setTaskStatus(id, action, options)
  )
  ipcMain.handle('task:longTerm', (_event, id: string, longTerm: boolean) => setTaskLongTerm(id, longTerm))
  ipcMain.handle('task:restore', (_event, id: string) => restoreTask(id))
  ipcMain.handle('task:purge', () => purgeExpiredTasks())
  ipcMain.handle('task:purgeTasks', (_event, ids: string[]) => purgeTasks(ids))
  ipcMain.handle('task:pin', (_event, id: string, pinned: boolean) => pinTask(id, pinned))

  ipcMain.handle('reminder:set', (_event, input: ReminderInput) => setReminder(input))
  ipcMain.handle('reminder:clear', (_event, todoId: string) => clearReminder(todoId))
  ipcMain.handle('reminder:snooze', (_event, todoId: string, minutes: number) => snoozeReminder(todoId, minutes))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle(
    'settings:update',
    (_event, patch: Partial<AppSettings>) => {
      const before = getSettings()
      const next = updateSettings(patch)
      if (before.autoLaunch !== next.autoLaunch) applyAutoLaunch(next.autoLaunch)
      return next
    }
  )

  ipcMain.handle('data:backup', async () => {
    const dir = path.join(app.getPath('userData'), 'backups')
    return backupDatabaseTo(dir)
  })
  ipcMain.handle('data:openDir', async () => {
    await shell.openPath(app.getPath('userData'))
  })
  ipcMain.handle('data:path', () => getDbPath())
  ipcMain.handle('notification:test', () => sendTestNotification())

  ipcMain.on('window:minimize', () => getWindow()?.minimize())
  ipcMain.on('window:toggleMaximize', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getWindow()?.close())
}
