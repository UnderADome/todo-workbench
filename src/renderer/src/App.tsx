import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { History, LoaderCircle } from 'lucide-react'
import { ChangelogDialog } from './components/ChangelogDialog'
import { UsageGuideDialog } from './components/UsageGuideDialog'
import { FONT_REGION_KEYS, type ColumnWidths, type HistoryItem, type Priority, type Project, type Todo } from '@shared/types'
import { resolveFontFamily } from './fonts'
import { useAppStore } from './store'
import { dateTaskCount, localTodayString } from './utils'
import {
  buildDateGroups,
  buildHistoryGroups,
  groupContainsDate,
  groupPendingCount,
  type DateGroup
} from './dateGroups'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ProjectColumn } from './components/ProjectColumn'
import { DateColumn } from './components/DateColumn'
import { TaskColumn } from './components/TaskColumn'
import { HistoryPanel } from './components/HistoryPanel'
import { HealthView } from './components/HealthView'
import { ConfirmDialog, PromptDialog, ToastHost } from './components/common'
import {
  ArchivedDialog,
  CompletionTimeDialog,
  ProjectDialog,
  RecycleDialog,
  ReminderActionDialog,
  ReminderDialog,
  SettingsDialog
} from './components/Dialogs'
import { DateGroupingDialog } from './components/DateGroupingDialog'

const WIDTH_LIMITS: Record<keyof ColumnWidths, { min: number; max: number }> = {
  function: { min: 180, max: 280 },
  projects: { min: 180, max: 320 },
  dates: { min: 160, max: 260 },
  history: { min: 280, max: 460 }
}

function compressLayoutWidths(
  widths: ColumnWidths,
  open: Record<keyof ColumnWidths, boolean>,
  available: number
): ColumnWidths {
  const next = { ...widths }
  const handleCount = Object.values(open).filter(Boolean).length * 5
  const total = Object.values(next).reduce((sum, value) => sum + value, 0)
  let mainWidth = available - total - handleCount
  const order: (keyof ColumnWidths)[] = ['history', 'dates', 'projects', 'function']
  for (const key of order) {
    if (mainWidth >= 420) break
    if (!open[key]) continue
    const reducible = next[key] - WIDTH_LIMITS[key].min
    if (reducible <= 0) continue
    const cut = Math.min(reducible, 420 - mainWidth)
    next[key] -= cut
    mainWidth += cut
  }
  return next
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  action: () => void | Promise<void>
}

interface PromptState {
  title: string
  label: string
  initialValue?: string
  submitLabel?: string
  multiline?: boolean
  action: (value: string) => void | Promise<void>
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void }): React.JSX.Element {
  return <div className="resize-handle" onMouseDown={onMouseDown} title="拖拽调整列宽" />
}

export default function App(): React.JSX.Element {
  const store = useAppStore()
  const {
    ready,
    today,
    projects,
    archivedCount,
    recycleCount,
    settings,
    selectedProjectId,
    selectedDate,
    projectData,
    history,
    activeArea,
    toast,
    reminderAction,
    init,
    refreshAll,
    selectProject,
    selectDate,
    setActiveArea,
    setHistoryScope,
    saveSettings,
    createTask,
    updateTask,
    setStatus,
    setTaskLongTerm,
    deleteTask,
    pinTask,
    setReminder: _setReminder,
    createProject: _createProject,
    renameProject: _renameProject,
    archiveProject,
    unarchiveProject: _unarchiveProject,
    pinProject,
    setProjectTaskView,
    showToast,
    clearToast,
    hideReminderAction
  } = store

  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [widths, setWidths] = useState<ColumnWidths>(settings.columnWidths)
  const widthsRef = useRef(widths)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recycleOpen, setRecycleOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [groupingScope, setGroupingScope] = useState<'project' | 'global' | null>(null)
  const [usageOpen, setUsageOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [focusTodoId, setFocusTodoId] = useState<string | null>(null)
  const [projectDialog, setProjectDialog] = useState<{ mode: 'create' | 'rename'; project: Project | null } | null>(null)
  const [reminderTodo, setReminderTodo] = useState<Todo | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [completeAgainTodo, setCompleteAgainTodo] = useState<Todo | null>(null)
  const pendingReminderRef = useRef<Todo | null>(null)

  const focusTodoFromReminder = useCallback(
    async (todo: Todo): Promise<void> => {
      setSettingsOpen(false)
      setRecycleOpen(false)
      setArchivedOpen(false)
      setGroupingScope(null)
      setProjectDialog(null)
      setReminderTodo(null)
      setUsageOpen(false)
      setChangelogOpen(false)
      setConfirmState(null)
      setPromptState(null)
      setActiveArea('projects')
      await selectProject(todo.projectId)
      selectDate(todo.todoDate)
      setFocusTodoId(todo.id)
    },
    [selectProject, selectDate, setActiveArea]
  )
  const clearFocusTodo = useCallback(() => setFocusTodoId(null), [])

  useEffect(() => {
    void init()
    const off = window.api.onReminderClicked((payload) => {
      if (!useAppStore.getState().ready) {
        pendingReminderRef.current = payload.todo
        return
      }
      void focusTodoFromReminder(payload.todo)
    })
    return off
  }, [init, focusTodoFromReminder])

  useEffect(() => {
    if (!ready) return
    const pending = pendingReminderRef.current
    if (!pending) return
    pendingReminderRef.current = null
    void focusTodoFromReminder(pending)
  }, [ready, focusTodoFromReminder])

  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    setWidths(settings.columnWidths)
    widthsRef.current = settings.columnWidths
  }, [settings.columnWidths])

  useEffect(() => {
    widthsRef.current = widths
  }, [widths])

  useEffect(() => {
    const root = document.documentElement
    for (const region of FONT_REGION_KEYS) {
      const config = settings.fonts.regions[region]
      root.style.setProperty(`--fs-${region}`, String((config.scale || 100) / 100))
      root.style.setProperty(`--ff-${region}`, resolveFontFamily(config))
    }
  }, [settings.fonts])

  useEffect(() => {
    const timer = setInterval(() => {
      const current = localTodayString()
      if (current !== today) {
        void refreshAll()
        selectDate(current)
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [today, refreshAll, selectDate])

  const autoFunction = windowWidth < 1280
  const autoProjects = windowWidth < 1100
  const autoDates = windowWidth < 980
  const autoHistory = windowWidth < 860
  const health = activeArea === 'health'
  const collapsedFunction = settings.collapsed.function || autoFunction
  const collapsedProjects = settings.collapsed.projects || autoProjects || health
  const collapsedDates = settings.collapsed.dates || autoDates || health
  const collapsedHistory = settings.collapsed.history || autoHistory || health
  const showHistoryTab = settings.collapsed.history && !autoHistory && !health

  const updateCollapse = (key: keyof ColumnWidths): void => {
    void saveSettings({
      collapsed: {
        ...settings.collapsed,
        [key === 'function' ? 'function' : key]: !settings.collapsed[key === 'function' ? 'function' : key]
      }
    })
  }

  const beginResize = (kind: keyof ColumnWidths) => (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = widthsRef.current[kind]
    const limits = WIDTH_LIMITS[kind]
    const direction = kind === 'history' ? -1 : 1

    const onMove = (moveEvent: MouseEvent): void => {
      const delta = (moveEvent.clientX - startX) * direction
      const next = Math.min(limits.max, Math.max(limits.min, Math.round(startWidth + delta)))
      setWidths((current) => {
        const updated = { ...current, [kind]: next }
        widthsRef.current = updated
        return updated
      })
    }

    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      void saveSettings({ columnWidths: widthsRef.current })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const projectTodos = projectData?.todos ?? []
  const taskViewMode = projectData?.project.taskView ?? settings.taskViewDefault
  const projectGrouping = projectData?.project.dateGrouping ?? settings.dateGrouping
  const historyGrouping = settings.historyScope === 'all' ? settings.dateGrouping : projectGrouping
  const dateGroups = useMemo(
    () =>
      buildDateGroups(
        projectTodos,
        today,
        selectedDate,
        projectGrouping,
        settings.todayPinned
      ),
    [projectTodos, today, selectedDate, projectGrouping, settings.todayPinned]
  )
  const selectedGroup = useMemo<DateGroup>(() => {
    const bySelectedDate = selectedDate
      ? dateGroups.find((group) => groupContainsDate(group, selectedDate))
      : undefined
    const current = dateGroups.find((group) => groupContainsDate(group, today))
    return (
      bySelectedDate ??
      current ??
      dateGroups[0] ?? {
        key: `auto:day:${today}:${today}`,
        kind: 'day',
        start: today,
        end: today,
        label: '今日',
        subLabel: today,
        rangeLabel: today
      }
    )
  }, [dateGroups, selectedDate, today])
  const addDate = groupContainsDate(selectedGroup, today) ? today : selectedGroup.start
  const dateCounts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const group of dateGroups) {
      result[group.key] = groupPendingCount(projectTodos, group, settings.longTermRepeatInDateGroups)
    }
    return result
  }, [dateGroups, projectTodos, settings.longTermRepeatInDateGroups])
  const pendingToday = dateTaskCount(projectTodos, today, settings.longTermRepeatInDateGroups)
  const pendingTodayForHistory =
    settings.historyScope === 'all'
      ? projects.reduce((sum, project) => sum + (project.todayPendingCount ?? 0), 0)
      : pendingToday
  const historyGroups = useMemo(
    () => buildHistoryGroups(history, today, historyGrouping),
    [history, today, historyGrouping]
  )

  const handleSelectGroup = (group: DateGroup): void => {
    selectDate(groupContainsDate(group, today) ? today : group.start)
  }

  const handleCreateTask = async (content: string, priority: Priority): Promise<void> => {
    if (!selectedProjectId) return
    await createTask({
      projectId: selectedProjectId,
      todoDate: addDate,
      content,
      priority
    })
  }

  const handleEdit = (todo: Todo): void => {
    setPromptState({
      title: '修改任务',
      label: '任务内容',
      initialValue: todo.content,
      submitLabel: '保存',
      multiline: true,
      action: async (value) => {
        if (value.trim() === todo.content) return
        await updateTask(todo.id, { content: value })
      }
    })
  }

  const handleDelete = (todo: Todo): void => {
    if (todo.parentId) {
      setConfirmState({
        title: '删除子项',
        message: `将删除「${todo.content}」及其全部子项。非根节点删除不进入回收站。`,
        confirmLabel: '删除',
        danger: true,
        action: async () => {
          await deleteTask(todo.id)
        }
      })
      return
    }
    void deleteTask(todo.id)
  }

  const handleStatus = (
    todo: Todo,
    action: 'complete' | 'uncomplete' | 'not_done' | 'restore_not_done'
  ): void => {
    if (action === 'complete' && todo.lastCompletedAt) {
      setCompleteAgainTodo(todo)
      return
    }
    void setStatus(todo.id, action)
  }

  const completeAgain = async (preserveCompletedAt: boolean): Promise<void> => {
    const todo = completeAgainTodo
    setCompleteAgainTodo(null)
    if (!todo) return
    await setStatus(todo.id, 'complete', { preserveCompletedAt })
  }

  const handleAddChild = (todo: Todo): void => {
    setPromptState({
      title: '添加子项',
      label: '子项内容',
      submitLabel: '添加',
      multiline: true,
      action: async (value) => {
        await createTask({
          projectId: todo.projectId,
          parentId: todo.id,
          todoDate: todo.todoDate,
          content: value,
          priority: todo.priority
        })
      }
    })
  }

  const handleProjectArchive = (project: Project): void => {
    setConfirmState({
      title: '归档项目',
      message: `归档「${project.name}」后，它将从主项目列表隐藏，且不参与历史、搜索与提醒调度。可以随时取消归档。`,
      confirmLabel: '归档项目',
      action: async () => {
        await archiveProject(project.id)
      }
    })
  }

  const handleHistoryNavigate = async (item: HistoryItem): Promise<void> => {
    if (settings.historyScope === 'all' && item.projectId !== selectedProjectId) {
      await selectProject(item.projectId)
    }
    selectDate(item.todoDate)
  }

  const effectiveWidths: ColumnWidths = {
    function: collapsedFunction ? 48 : widths.function,
    projects: collapsedProjects ? 48 : widths.projects,
    dates: collapsedDates ? 48 : widths.dates,
    history: collapsedHistory ? 0 : widths.history
  }
  const openColumns: Record<keyof ColumnWidths, boolean> = {
    function: !collapsedFunction,
    projects: !collapsedProjects && !health,
    dates: !collapsedDates && !health,
    history: !collapsedHistory && !health
  }
  const displayWidths = health
    ? effectiveWidths
    : compressLayoutWidths(effectiveWidths, openColumns, windowWidth)

  const layoutStyle = {
    '--w-function': `${displayWidths.function}px`,
    '--w-projects': `${displayWidths.projects}px`,
    '--w-dates': `${displayWidths.dates}px`,
    '--w-history': `${displayWidths.history}px`
  } as CSSProperties

  if (!ready) {
    return (
      <div className="app-shell">
        <TitleBar activeArea={activeArea} />
        <div className="boot-screen">
          <LoaderCircle className="spin" size={24} />
          <span>正在加载本地数据…</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`app-shell ${health ? 'health-mode' : ''}`}>
      <TitleBar activeArea={activeArea} />
      <div className="app-content" style={layoutStyle}>
        <Sidebar
          collapsed={collapsedFunction}
          activeArea={activeArea}
          pendingToday={pendingToday}
          historyCount={history.length}
          recycleCount={recycleCount}
          onToggleCollapse={() => updateCollapse('function')}
          onSelectArea={(area) => setActiveArea(area)}
          onOpenRecycle={() => setRecycleOpen(true)}
          onOpenUsage={() => setUsageOpen(true)}
          onOpenChangelog={() => setChangelogOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {!collapsedFunction ? <ResizeHandle onMouseDown={beginResize('function')} /> : null}

        <ProjectColumn
          projects={projects}
          selectedProjectId={selectedProjectId}
          archivedCount={archivedCount}
          collapsed={collapsedProjects}
          locked={health}
          onSelect={(id) => void selectProject(id)}
          onNew={() => setProjectDialog({ mode: 'create', project: null })}
          onRename={(project) => setProjectDialog({ mode: 'rename', project })}
          onArchive={handleProjectArchive}
          onPin={(project) => void pinProject(project.id, !project.pinnedAt)}
          onOpenArchived={() => setArchivedOpen(true)}
          onToggleCollapse={() => updateCollapse('projects')}
        />
        {!collapsedProjects && !health ? <ResizeHandle onMouseDown={beginResize('projects')} /> : null}

        <DateColumn
          groups={dateGroups}
          selectedDate={selectedDate}
          selectedGroupKey={selectedGroup.key}
          today={today}
          todayPinned={settings.todayPinned}
          counts={dateCounts}
          collapsed={collapsedDates}
          locked={health}
          onSelectGroup={handleSelectGroup}
          onJumpDate={selectDate}
          onOpenGrouping={() => setGroupingScope('project')}
          onToggleCollapse={() => updateCollapse('dates')}
        />
        {!collapsedDates && !health ? <ResizeHandle onMouseDown={beginResize('dates')} /> : null}

        {health ? (
          <HealthView onBack={() => setActiveArea('projects')} />
        ) : (
          <>
            <TaskColumn
              projectData={projectData}
              dateGroup={selectedGroup}
              today={today}
              settings={settings}
              viewMode={taskViewMode}
              repeatLongTerm={settings.longTermRepeatInDateGroups}
              onViewModeChange={(mode) => {
                if (selectedProjectId) void setProjectTaskView(selectedProjectId, mode)
              }}
              onCreateTask={handleCreateTask}
              onSelectDate={selectDate}
              onStatus={handleStatus}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPin={(todo, pinned) => void pinTask(todo.id, pinned)}
              onReminder={(todo) => setReminderTodo(todo)}
              onAddChild={handleAddChild}
              onPriority={(todo, priority) => void updateTask(todo.id, { priority })}
              onLongTerm={(todo, longTerm) => void setTaskLongTerm(todo.id, longTerm)}
              onNotify={showToast}
              focusTodoId={focusTodoId}
              onFocusHandled={clearFocusTodo}
            />
            {!collapsedHistory ? <ResizeHandle onMouseDown={beginResize('history')} /> : null}
            {!collapsedHistory ? (
              <HistoryPanel
                groups={historyGroups}
                scope={settings.historyScope}
                todayPending={pendingTodayForHistory}
                onScopeChange={(scope) => void setHistoryScope(scope)}
                onOpenGrouping={() => setGroupingScope('global')}
                onClose={() => updateCollapse('history')}
                onStatus={handleStatus}
                onNavigate={(item) => void handleHistoryNavigate(item)}
              />
            ) : null}
          </>
        )}

        {showHistoryTab ? (
          <button
            className="history-reopen"
            title="展开历史遗留项"
            onClick={() => updateCollapse('history')}
          >
            <History size={14} />
            <span>历史遗留项</span>
          </button>
        ) : null}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CompletionTimeDialog
        open={completeAgainTodo !== null}
        todo={completeAgainTodo}
        onCancel={() => setCompleteAgainTodo(null)}
        onKeepPrevious={() => void completeAgain(true)}
        onUseNow={() => void completeAgain(false)}
      />
      <UsageGuideDialog open={usageOpen} onClose={() => setUsageOpen(false)} />
      <ChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <DateGroupingDialog
        open={groupingScope !== null}
        scope={groupingScope ?? 'project'}
        onClose={() => setGroupingScope(null)}
      />
      <RecycleDialog open={recycleOpen} onClose={() => setRecycleOpen(false)} />
      <ArchivedDialog open={archivedOpen} onClose={() => setArchivedOpen(false)} />
      <ProjectDialog
        open={projectDialog !== null}
        mode={projectDialog?.mode ?? 'create'}
        project={projectDialog?.project ?? null}
        onClose={() => setProjectDialog(null)}
      />
      <ReminderDialog open={reminderTodo !== null} todo={reminderTodo} onClose={() => setReminderTodo(null)} />
      <ReminderActionDialog
        open={reminderAction !== null}
        todo={reminderAction}
        onClose={hideReminderAction}
      />
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          await confirmState?.action()
        }}
      />
      <PromptDialog
        open={promptState !== null}
        title={promptState?.title ?? ''}
        label={promptState?.label ?? ''}
        initialValue={promptState?.initialValue ?? ''}
        submitLabel={promptState?.submitLabel}
        multiline={promptState?.multiline}
        onClose={() => setPromptState(null)}
        onSubmit={async (value) => {
          await promptState?.action(value)
        }}
      />
      <ToastHost
        toast={toast}
        onClose={clearToast}
        onAction={() => {
          if (toast?.action) void toast.action()
          clearToast()
        }}
      />
    </div>
  )
}
