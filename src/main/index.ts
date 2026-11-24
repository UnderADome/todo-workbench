import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  backupDatabaseTo,
  getRawSetting,
  getSettings,
  initDatabase,
  purgeExpiredTasks,
  setRawSetting
} from './db'
import { applyAutoLaunch, registerIpc } from './ipc'
import {
  handleReminderProtocolArgv,
  registerReminderProtocol,
  startReminderScheduler,
  stopReminderScheduler
} from './reminders'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let saveTimer: NodeJS.Timeout | null = null

app.setAppUserModelId('com.todolist.workspace')

if (process.env.TODOLIST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.TODOLIST_USER_DATA))
}

function resourcePath(name: string): string {
  if (app.isPackaged) return path.join(process.resourcesPath, name)
  return path.join(app.getAppPath(), 'resources', name)
}

function readWindowState(): { width: number; height: number; x?: number; y?: number; maximized: boolean } {
  const defaults = { width: 1600, height: 970, maximized: false }
  const raw = getRawSetting('window.bounds')
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as { x?: number; y?: number; width?: number; height?: number }
    return {
      width: Math.max(800, Number(parsed.width) || defaults.width),
      height: Math.max(600, Number(parsed.height) || defaults.height),
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      maximized: getRawSetting('window.maximized') === '1'
    }
  } catch {
    return defaults
  }
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const maximized = mainWindow.isMaximized()
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  setRawSetting('window.bounds', JSON.stringify(bounds))
  setRawSetting('window.maximized', maximized ? '1' : '0')
}

function scheduleWindowStateSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveWindowState(), 300)
}

function createWindow(): void {
  const state = readWindowState()
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#eef2fb',
    icon: resourcePath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (state.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
    saveWindowState()
  })
  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('maximize', scheduleWindowStateSave)
  mainWindow.on('unmaximize', scheduleWindowStateSave)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(image)
  tray.setToolTip('待办工作台')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开待办工作台', click: showMainWindow },
      { label: '最小化', click: () => mainWindow?.minimize() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showMainWindow)
}

async function runStartupBackup(): Promise<void> {
  try {
    const dir = path.join(app.getPath('userData'), 'backups')
    backupDatabaseTo(dir)
  } catch (error) {
    console.error('自动备份失败', error)
  }
}

function startup(): void {
  initDatabase(path.join(app.getPath('userData'), 'todolist.db'))
  const settings = getSettings()
  applyAutoLaunch(settings.autoLaunch)
  registerReminderProtocol()
  purgeExpiredTasks()
  registerIpc(() => mainWindow)
  createWindow()
  createTray()
  startReminderScheduler(
    () => mainWindow,
    () => showMainWindow()
  )
  void runStartupBackup()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!handleReminderProtocolArgv(argv)) showMainWindow()
  })

  app.whenReady().then(() => {
    startup()
    // 冷启动时 process.argv 可能带有通知协议 URL；窗口可能仍在加载，发送函数会等待。
    handleReminderProtocolArgv(process.argv)
    app.on('activate', () => {
      showMainWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
    saveWindowState()
    stopReminderScheduler()
  })

  app.on('window-all-closed', () => {
    // 关闭窗口时保留托盘进程
  })
}

// 确保资源目录存在（开发环境首次运行时）
if (!app.isPackaged) {
  const resources = path.join(app.getAppPath(), 'resources')
  if (!fs.existsSync(resources)) {
    fs.mkdirSync(resources, { recursive: true })
  }
}
