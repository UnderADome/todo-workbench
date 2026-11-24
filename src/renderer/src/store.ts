import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BootstrapData,
  type CreateTaskInput,
  type DateGroupingConfig,
  type DeleteResult,
  type HistoryItem,
  type HistoryScope,
  type Project,
  type ProjectData,
  type ReminderInput,
  type TaskStatusAction,
  type TaskStatusOptions,
  type TaskViewMode,
  type Todo,
  type UpdateTaskInput
} from '@shared/types'
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface ToastState {
  id: number
  message: string
  actionLabel?: string
  action?: () => void | Promise<void>
}

interface AppStore {
  ready: boolean
  error: string | null
  today: string
  appVersion: string
  projects: Project[]
  archivedCount: number
  recycleCount: number
  settings: AppSettings
  selectedProjectId: string | null
  selectedDate: string | null
  projectData: ProjectData | null
  history: HistoryItem[]
  activeArea: 'projects' | 'health'
  toast: ToastState | null
  reminderAction: Todo | null

  init: () => Promise<void>
  refreshBootstrap: () => Promise<BootstrapData | null>
  loadProject: (projectId: string, date?: string) => Promise<void>
  refreshAll: () => Promise<void>
  refreshHistory: () => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  selectDate: (date: string) => void
  setActiveArea: (area: 'projects' | 'health') => void
  setHistoryScope: (scope: HistoryScope) => Promise<void>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>

  createTask: (input: CreateTaskInput) => Promise<Todo | null>
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>
  setStatus: (id: string, action: TaskStatusAction, options?: TaskStatusOptions) => Promise<DeleteResult | null>
  setTaskLongTerm: (id: string, longTerm: boolean) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  restoreTask: (id: string) => Promise<void>
  pinTask: (id: string, pinned: boolean) => Promise<void>
  setReminder: (input: ReminderInput) => Promise<void>
  clearReminder: (todoId: string) => Promise<void>
  snoozeReminder: (todoId: string, minutes: number) => Promise<void>

  createProject: (name: string) => Promise<Project | null>
  renameProject: (id: string, name: string) => Promise<void>
  archiveProject: (id: string) => Promise<void>
  unarchiveProject: (id: string) => Promise<void>
  pinProject: (id: string, pinned: boolean) => Promise<void>
  saveProjectDateGrouping: (projectId: string, config: DateGroupingConfig) => Promise<void>
  saveGlobalDateGrouping: (config: DateGroupingConfig) => Promise<void>
  setProjectTaskView: (projectId: string, mode: TaskViewMode) => Promise<void>
  purgeTasks: (ids: string[]) => Promise<number>

  showToast: (message: string, actionLabel?: string, action?: () => void | Promise<void>) => void
  clearToast: () => void
  showReminderAction: (todo: Todo) => void
  hideReminderAction: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
let toastSequence = 0

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function ensureSelectedDate(_data: ProjectData, today: string, _settings: AppSettings, current: string | null): string {
  return current && DATE_KEY_PATTERN.test(current) ? current : today
}

export const useAppStore = create<AppStore>()((set, get) => {
  const fail = (error: unknown): void => {
    get().showToast(cleanError(error))
  }

  return {
    ready: false,
    error: null,
    today: '',
    appVersion: '0.6.0',
    projects: [],
    archivedCount: 0,
    recycleCount: 0,
    settings: DEFAULT_SETTINGS,
    selectedProjectId: null,
    selectedDate: null,
    projectData: null,
    history: [],
    activeArea: 'projects',
    toast: null,
    reminderAction: null,

    init: async () => {
      try {
        const boot = await window.api.bootstrap()
        const first = boot.projects[0] ?? null
        set({
          ready: true,
          today: boot.today,
          appVersion: boot.appVersion,
          projects: boot.projects,
          archivedCount: boot.archivedCount,
          recycleCount: boot.recycleCount,
          settings: boot.settings,
          selectedProjectId: first?.id ?? null,
          selectedDate: boot.today
        })
        if (first) {
          const data = await window.api.getProjectData(first.id)
          set({
            projectData: data,
            selectedDate: ensureSelectedDate(data, boot.today, boot.settings, boot.today)
          })
        }
        await get().refreshHistory()
      } catch (error) {
        set({ ready: true, error: cleanError(error) })
        fail(error)
      }
    },

    refreshBootstrap: async () => {
      try {
        const boot = await window.api.bootstrap()
        set({
          today: boot.today,
          appVersion: boot.appVersion,
          projects: boot.projects,
          archivedCount: boot.archivedCount,
          recycleCount: boot.recycleCount,
          settings: boot.settings
        })
        return boot
      } catch (error) {
        fail(error)
        return null
      }
    },

    loadProject: async (projectId, date) => {
      try {
        const data = await window.api.getProjectData(projectId)
        const { today, settings } = get()
        set({
          projectData: data,
          selectedProjectId: projectId,
          selectedDate: ensureSelectedDate(data, today, settings, date ?? today)
        })
      } catch (error) {
        fail(error)
      }
    },

    refreshAll: async () => {
      try {
        const boot = await window.api.bootstrap()
        const currentId = get().selectedProjectId
        const projectExists = boot.projects.some((project) => project.id === currentId)
        const projectId = projectExists ? currentId : (boot.projects[0]?.id ?? null)
        set({
          today: boot.today,
          projects: boot.projects,
          archivedCount: boot.archivedCount,
          recycleCount: boot.recycleCount,
          settings: boot.settings,
          selectedProjectId: projectId
        })
        if (projectId) {
          const data = await window.api.getProjectData(projectId)
          set({
            projectData: data,
            selectedDate: ensureSelectedDate(data, boot.today, boot.settings, get().selectedDate)
          })
        } else {
          set({ projectData: null, selectedDate: boot.today })
        }
        await get().refreshHistory()
      } catch (error) {
        fail(error)
      }
    },

    refreshHistory: async () => {
      try {
        const { settings, selectedProjectId } = get()
        if (settings.historyScope === 'project' && !selectedProjectId) {
          set({ history: [] })
          return
        }
        const history = await window.api.getHistory(settings.historyScope, selectedProjectId)
        set({ history })
      } catch (error) {
        fail(error)
      }
    },

    selectProject: async (projectId) => {
      try {
        await window.api.openProject(projectId)
        const boot = await get().refreshBootstrap()
        const today = boot?.today ?? get().today
        await get().loadProject(projectId, today)
        await get().refreshHistory()
      } catch (error) {
        fail(error)
      }
    },

    selectDate: (date) => set({ selectedDate: date }),

    setActiveArea: (area) => set({ activeArea: area }),

    setHistoryScope: async (scope) => {
      try {
        const settings = await window.api.updateSettings({ historyScope: scope })
        set({ settings })
        await get().refreshHistory()
      } catch (error) {
        fail(error)
      }
    },

    saveSettings: async (patch) => {
      try {
        const settings = await window.api.updateSettings(patch)
        set({ settings })
        if (patch.historyScope) await get().refreshHistory()
      } catch (error) {
        fail(error)
      }
    },

    createTask: async (input) => {
      try {
        const task = await window.api.createTask(input)
        set({ selectedDate: input.todoDate })
        await get().refreshAll()
        return task
      } catch (error) {
        fail(error)
        return null
      }
    },

    updateTask: async (id, input) => {
      try {
        await window.api.updateTask(id, input)
        await get().refreshAll()
      } catch (error) {
        fail(error)
      }
    },

    setStatus: async (id, action, options) => {
      try {
        const result = await window.api.setTaskStatus(id, action, options)
        await get().refreshAll()
        return result
      } catch (error) {
        fail(error)
        return null
      }
    },

    setTaskLongTerm: async (id, longTerm) => {
      try {
        await window.api.setTaskLongTerm(id, longTerm)
        await get().refreshAll()
      } catch (error) {
        fail(error)
      }
    },

    deleteTask: async (id) => {
      try {
        const result = await window.api.setTaskStatus(id, 'delete')
        await get().refreshAll()
        if (result?.mode === 'soft') {
          get().showToast('已移入回收站', '撤销', async () => {
            await get().restoreTask(id)
          })
        } else if (result?.mode === 'hard') {
          get().showToast('子项已删除')
        }
      } catch (error) {
        fail(error)
      }
    },

    restoreTask: async (id) => {
      try {
        await window.api.restoreTask(id)
        await get().refreshAll()
        get().showToast('任务已恢复')
      } catch (error) {
        fail(error)
      }
    },

    pinTask: async (id, pinned) => {
      try {
        await window.api.pinTask(id, pinned)
        await get().refreshAll()
      } catch (error) {
        fail(error)
      }
    },

    setReminder: async (input) => {
      try {
        await window.api.setReminder(input)
        await get().refreshAll()
        get().showToast('提醒已保存')
      } catch (error) {
        fail(error)
      }
    },

    clearReminder: async (todoId) => {
      try {
        await window.api.clearReminder(todoId)
        await get().refreshAll()
        get().showToast('提醒已移除')
      } catch (error) {
        fail(error)
      }
    },

    snoozeReminder: async (todoId, minutes) => {
      try {
        await window.api.snoozeReminder(todoId, minutes)
        await get().refreshAll()
        get().showToast(`已稍后 ${minutes} 分钟提醒`)
      } catch (error) {
        fail(error)
      }
    },

    createProject: async (name) => {
      try {
        const project = await window.api.createProject(name)
        await get().refreshBootstrap()
        await get().loadProject(project.id, get().today)
        await get().refreshHistory()
        return project
      } catch (error) {
        fail(error)
        return null
      }
    },

    renameProject: async (id, name) => {
      try {
        await window.api.renameProject(id, name)
        await get().refreshBootstrap()
        if (get().selectedProjectId === id) {
          await get().loadProject(id, get().selectedDate ?? get().today)
        }
      } catch (error) {
        fail(error)
      }
    },

    archiveProject: async (id) => {
      try {
        await window.api.archiveProject(id)
        const boot = await get().refreshBootstrap()
        if (get().selectedProjectId === id) {
          const next = boot?.projects[0]
          if (next) await get().loadProject(next.id, boot?.today ?? get().today)
          else set({ projectData: null, selectedProjectId: null })
        }
        await get().refreshHistory()
      } catch (error) {
        fail(error)
      }
    },

    unarchiveProject: async (id) => {
      try {
        await window.api.unarchiveProject(id)
        await get().refreshBootstrap()
        get().showToast('项目已取消归档')
      } catch (error) {
        fail(error)
      }
    },

    pinProject: async (id, pinned) => {
      try {
        await window.api.pinProject(id, pinned)
        await get().refreshBootstrap()
      } catch (error) {
        fail(error)
      }
    },

    saveProjectDateGrouping: async (projectId, config) => {
      try {
        await window.api.updateProjectDateGrouping(projectId, config)
        await get().refreshAll()
      } catch (error) {
        fail(error)
        throw error
      }
    },

    saveGlobalDateGrouping: async (config) => {
      try {
        const settings = await window.api.updateSettings({ dateGrouping: config })
        set({ settings })
      } catch (error) {
        fail(error)
        throw error
      }
    },

    setProjectTaskView: async (projectId, mode) => {
      try {
        const project = await window.api.updateProjectTaskView(projectId, mode)
        set((state) => ({
          projects: state.projects.map((item) => (item.id === projectId ? project : item)),
          projectData:
            state.projectData && state.projectData.project.id === projectId
              ? { ...state.projectData, project }
              : state.projectData
        }))
      } catch (error) {
        fail(error)
      }
    },

    purgeTasks: async (ids) => {
      try {
        const count = await window.api.purgeTasks(ids)
        await get().refreshAll()
        return count
      } catch (error) {
        fail(error)
        throw error
      }
    },

    showToast: (message, actionLabel, action) => {
      const id = ++toastSequence
      if (toastTimer) clearTimeout(toastTimer)
      set({ toast: { id, message, actionLabel, action } })
      toastTimer = setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null })
      }, 5000)
    },

    clearToast: () => {
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = null
      set({ toast: null })
    },

    showReminderAction: (todo) => set({ reminderAction: todo }),
    hideReminderAction: () => set({ reminderAction: null })
  }
})
