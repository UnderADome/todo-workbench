import { app, BrowserWindow, Notification } from 'electron'
import { getReminderTodos, getTodoById, markReminderFired } from './db'
import type { ReminderNotificationPayload, Todo } from '../shared/types'

type WindowAccessor = () => BrowserWindow | null
type ShowWindow = () => void

let intervalHandle: NodeJS.Timeout | null = null
let getWindow: WindowAccessor = () => null
let showWindow: ShowWindow = () => undefined
// 持有通知对象，避免 Toast 还在操作中心时被 GC 导致 click 回调失效。
const activeNotifications = new Set<Notification>()

let lastFocusTodoId = ''
let lastFocusAt = 0

function sendReminderClick(payload: ReminderNotificationPayload): void {
  const now = Date.now()
  if (payload.todo.id === lastFocusTodoId && now - lastFocusAt < 1500) return
  lastFocusTodoId = payload.todo.id
  lastFocusAt = now
  showWindow()
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  const send = (): void => {
    if (!win.isDestroyed()) win.webContents.send('reminder:clicked', payload)
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      // 给 React 挂载监听器留出时间；窗口刚创建时 did-finish-load 可能早于监听注册。
      setTimeout(send, 300)
    })
    return
  }
  send()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function reminderToastXml(todo: Todo): string {
  return `<toast activationType="protocol" launch="todolist://reminder/${encodeURIComponent(todo.id)}">
    <visual>
      <binding template="ToastGeneric">
        <text>待办提醒</text>
        <text>${escapeXml(todo.content)}</text>
      </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
  </toast>`
}

export function registerReminderProtocol(): void {
  try {
    if (app.isPackaged) app.setAsDefaultProtocolClient('todolist')
    else app.setAsDefaultProtocolClient('todolist', process.execPath, [app.getAppPath()])
  } catch (error) {
    console.error('注册提醒协议失败', error)
  }
}

export function focusReminderById(todoId: string): void {
  const todo = getTodoById(todoId)
  if (!todo) {
    showWindow()
    return
  }
  sendReminderClick({ todo })
}

export function handleReminderProtocolArgv(argv: string[]): boolean {
  const urlArg = argv.find((arg) => arg.startsWith('todolist://'))
  if (!urlArg) return false
  try {
    const url = new URL(urlArg)
    if (url.hostname !== 'reminder') return false
    const todoId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    if (!todoId) return false
    focusReminderById(todoId)
    return true
  } catch {
    return false
  }
}

function retainNotification(notification: Notification, onClick?: () => void): void {
  activeNotifications.add(notification)
  const release = (): void => {
    activeNotifications.delete(notification)
  }
  notification.on('close', (details) => {
    // timedOut 的通知可能仍留在 Action Center，继续持有对象以支持稍后点击。
    if (details.reason !== 'timedOut') release()
  })
  notification.once('failed', (_event, error) => {
    console.error('系统通知显示失败', error)
    release()
  })
  notification.on('click', () => {
    release()
    onClick?.()
  })
}

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function addMonthsClamped(date: Date, months: number): Date {
  const next = new Date(date)
  const day = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, daysInMonth))
  return next
}

function nextOccurrence(todo: Todo, now: Date): string | null {
  const base = parseDate(todo.remindAt)
  if (!base || !todo.repeatRule || todo.repeatRule === 'none') return null
  // 分钟级循环的“稍后”会顺延整个节奏；日/周/月循环只顺延当前一次，下一次仍按日历计划。
  const anchor = todo.snoozeUntil && todo.repeatRule === 'interval' ? now : base
  const interval = todo.repeatIntervalMinutes ?? 10
  let next = new Date(anchor)
  let guard = 0
  do {
    if (todo.repeatRule === 'interval') {
      next = new Date(next.getTime() + interval * 60 * 1000)
    } else if (todo.repeatRule === 'daily') {
      next = new Date(next.getTime() + 24 * 60 * 60 * 1000)
    } else if (todo.repeatRule === 'weekly') {
      next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (todo.repeatRule === 'monthly') {
      next = addMonthsClamped(next, 1)
    } else {
      return null
    }
    guard += 1
  } while (next.getTime() <= now.getTime() && guard < 10000)
  return formatLocalStamp(next)
}

function formatLocalStamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`
}

function dueTime(todo: Todo): Date | null {
  const remind = parseDate(todo.remindAt)
  if (!remind) return null
  return new Date(remind.getTime() - todo.advanceMinutes * 60 * 1000)
}

function shouldFire(todo: Todo, now: Date): boolean {
  if (!todo.remindAt) return false
  const snooze = parseDate(todo.snoozeUntil)
  if (snooze) {
    return snooze.getTime() <= now.getTime()
  }
  const due = dueTime(todo)
  if (!due || due.getTime() > now.getTime()) return false
  const fired = parseDate(todo.reminderFiredAt)
  return !fired || fired.getTime() < due.getTime()
}

function deliver(todo: Todo): void {
  const payload: ReminderNotificationPayload = { todo }
  if (!Notification.isSupported()) {
    sendReminderClick(payload)
    return
  }
  try {
    const notification = new Notification({
      toastXml: reminderToastXml(todo)
    })
    retainNotification(notification, () => sendReminderClick(payload))
    notification.on('failed', () => {
      // 系统 Toast 失败时至少把应用带到任务上，避免提醒完全不可见。
      sendReminderClick(payload)
    })
    notification.show()
  } catch (error) {
    console.error('发送系统通知失败', error)
    sendReminderClick(payload)
  }
}

export function checkReminders(): void {
  const now = new Date()
  const todos = getReminderTodos()
  for (const todo of todos) {
    if (!shouldFire(todo, now)) continue
    const next = nextOccurrence(todo, now)
    deliver(todo)
    markReminderFired(todo.id, next, now.toISOString())
  }
}

export function startReminderScheduler(windowAccessor: WindowAccessor, show: ShowWindow): void {
  getWindow = windowAccessor
  showWindow = show
  if (intervalHandle) clearInterval(intervalHandle)
  setTimeout(checkReminders, 1500)
  intervalHandle = setInterval(checkReminders, 30_000)
}

export function stopReminderScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

export function sendTestNotification(): { ok: boolean; message: string } {
  if (!Notification.isSupported()) {
    return { ok: false, message: '当前系统不支持桌面通知，或通知权限不可用。' }
  }
  try {
    const notification = new Notification({
      title: '待办工作台',
      body: '通知测试成功。到达提醒时间时，将在这里看到任务提醒。'
    })
    retainNotification(notification, () => showWindow())
    notification.show()
    return { ok: true, message: '测试通知已发送。' }
  } catch (error) {
    return { ok: false, message: `通知发送失败：${String(error)}` }
  }
}
