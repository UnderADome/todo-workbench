import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Bell,
  BellRing,
  CheckCircle2,
  Clock3,
  Download,
  FolderOpen,
  History,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import {
  DEFAULT_SHORTCUTS,
  FONT_REGION_KEYS,
  type AppSettings,
  type CompletedDisplay,
  type FontFamilyPreset,
  type FontRegionConfig,
  type FontRegionKey,
  type HistoryScope,
  type Priority,
  type Project,
  type RecycleItem,
  type RepeatRule,
  type ShortcutAction,
  type SortMode,
  type TaskViewMode,
  type Todo
} from '@shared/types'
import { useAppStore } from '../store'
import { FONT_PRESETS, FONT_REGION_LABELS, resolveFontFamily } from '../fonts'
import { SHORTCUT_DEFINITIONS, isReservedShortcut, keyboardEventToShortcut } from '../shortcuts'
import { dateTimeLabel, shortDateLabel } from '../utils'
import { ConfirmDialog, EmptyState, FormField, Modal, ShortcutKeys } from './common'

interface ProjectDialogProps {
  open: boolean
  mode: 'create' | 'rename'
  project: Project | null
  onClose: () => void
}

export function ProjectDialog({ open, mode, project, onClose }: ProjectDialogProps): React.JSX.Element | null {
  const createProject = useAppStore((state) => state.createProject)
  const renameProject = useAppStore((state) => state.renameProject)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(mode === 'rename' ? (project?.name ?? '') : '')
      setBusy(false)
    }
  }, [open, mode, project])

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      if (mode === 'create') await createProject(trimmed)
      else if (project) await renameProject(project.id, trimmed)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? '新建项目' : '重命名项目'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => void submit()}>
            {mode === 'create' ? '创建项目' : '保存名称'}
          </button>
        </>
      }
    >
      <FormField label="项目名称">
        <input
          className="text-input"
          value={name}
          autoFocus
          placeholder="例如：301 / 手机银行 / 官网改版"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
        />
      </FormField>
      <div className="dialog-hint">项目按置顶状态和最后编辑时间排序；本期不做物理删除，只支持归档。</div>
    </Modal>
  )
}

interface CompletionTimeDialogProps {
  open: boolean
  todo: Todo | null
  onCancel: () => void
  onKeepPrevious: () => void
  onUseNow: () => void
}

export function CompletionTimeDialog({
  open,
  todo,
  onCancel,
  onKeepPrevious,
  onUseNow
}: CompletionTimeDialogProps): React.JSX.Element | null {
  return (
    <Modal
      open={open}
      title="再次完成"
      subtitle="该任务之前已经完成过"
      icon={<Clock3 size={18} />}
      width={470}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-soft" onClick={onKeepPrevious}>
            保留原完成时间
          </button>
          <button className="btn btn-primary" onClick={onUseNow}>
            使用当前时间
          </button>
        </>
      }
    >
      <div className="completion-again-time">
        <span>上次完成时间</span>
        <strong>{dateTimeLabel(todo?.lastCompletedAt ?? null) || '—'}</strong>
      </div>
      <div className="confirm-message">
        是否将当前时间作为最终完成时间？选择“保留原完成时间”会沿用上次记录，不覆盖最终完成时间。
      </div>
    </Modal>
  )
}

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps): React.JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const showToast = useAppStore((state) => state.showToast)
  const appVersion = useAppStore((state) => state.appVersion)
  const [form, setForm] = useState<AppSettings>(settings)
  const [busy, setBusy] = useState(false)
  const [fontRegion, setFontRegion] = useState<FontRegionKey>('tasks')
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutAction | null>(null)
  const [shortcutError, setShortcutError] = useState('')

  useEffect(() => {
    if (open) {
      setForm(settings)
      setFontRegion('tasks')
      setRecordingShortcut(null)
      setShortcutError('')
    }
  }, [open, settings])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const currentFont = form.fonts.regions[fontRegion]

  const updateFont = (patch: Partial<FontRegionConfig>): void => {
    setForm((current) => ({
      ...current,
      fonts: {
        regions: {
          ...current.fonts.regions,
          [fontRegion]: {
            ...current.fonts.regions[fontRegion],
            ...patch
          }
        }
      }
    }))
  }

  const applyFontToAll = (): void => {
    setForm((current) => ({
      ...current,
      fonts: {
        regions: Object.fromEntries(
          FONT_REGION_KEYS.map((key) => [key, { ...current.fonts.regions[fontRegion] }])
        ) as AppSettings['fonts']['regions']
      }
    }))
  }

  const resetFonts = (): void => {
    setForm((current) => ({
      ...current,
      fonts: {
        regions: Object.fromEntries(
          FONT_REGION_KEYS.map((key) => [key, { scale: 100, family: 'system', customFamily: '' }])
        ) as AppSettings['fonts']['regions']
      }
    }))
  }

  const updateShortcut = (action: ShortcutAction, value: string): void => {
    setForm((current) => ({
      ...current,
      shortcuts: {
        ...current.shortcuts,
        [action]: value
      }
    }))
  }

  const recordShortcut = (action: ShortcutAction, event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (recordingShortcut !== action) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setRecordingShortcut(null)
      return
    }
    const value = keyboardEventToShortcut(event.nativeEvent)
    if (!value) return
    if (isReservedShortcut(value)) {
      setShortcutError(`“${value}”被系统或开发者工具占用，请换一个组合键`)
      return
    }
    updateShortcut(action, value)
    setShortcutError('')
    setRecordingShortcut(null)
  }

  const resetShortcuts = (): void => {
    setForm((current) => ({ ...current, shortcuts: { ...DEFAULT_SHORTCUTS } }))
    setShortcutError('')
    setRecordingShortcut(null)
  }

  const save = async (): Promise<void> => {
    if (busy) return
    const values = SHORTCUT_DEFINITIONS.map((item) => form.shortcuts[item.action])
    const duplicate = values.find((value, index) => values.indexOf(value) !== index)
    if (duplicate) {
      setShortcutError(`快捷键“${duplicate}”被多个操作占用，请调整后再保存`)
      return
    }
    setBusy(true)
    try {
      await saveSettings({
        todayPinned: form.todayPinned,
        completedDisplay: form.completedDisplay,
        defaultSort: form.defaultSort,
        taskViewDefault: form.taskViewDefault,
        longTermRepeatInDateGroups: form.longTermRepeatInDateGroups,
        moveSelectedProjectToTop: form.moveSelectedProjectToTop,
        historyScope: form.historyScope,
        autoLaunch: form.autoLaunch,
        fonts: form.fonts,
        shortcuts: form.shortcuts
      })
      showToast('设置已保存')
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const backup = async (): Promise<void> => {
    try {
      const path = await window.api.backupNow()
      showToast(`备份完成：${path}`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }

  const testNotification = async (): Promise<void> => {
    const result = await window.api.testNotification()
    showToast(result.message)
  }

  return (
    <Modal
      open={open}
      title="设置"
      subtitle="界面偏好、提醒与数据管理"
      icon={<Settings size={18} />}
      width={580}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            保存设置
          </button>
        </>
      }
    >
      <div className="settings-section">
        <div className="settings-section-title">视图与排序</div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.todayPinned}
            onChange={(event) => update('todayPinned', event.target.checked)}
          />
          <span>今天始终置顶</span>
        </label>
        <FormField label="已完成任务展示">
          <select
            className="select-input"
            value={form.completedDisplay}
            onChange={(event) => update('completedDisplay', event.target.value as CompletedDisplay)}
          >
            <option value="bottom">显示在列表底部（默认）</option>
            <option value="inline">显示在列表原位</option>
            <option value="hidden">隐藏已完成</option>
          </select>
        </FormField>
        <FormField label="默认任务排序">
          <select
            className="select-input"
            value={form.defaultSort}
            onChange={(event) => update('defaultSort', event.target.value as SortMode)}
          >
            <option value="created_desc">创建时间（新→旧）</option>
            <option value="created_asc">创建时间（旧→新）</option>
            <option value="priority">重要程度</option>
          </select>
        </FormField>
        <FormField
          label="新建项目默认任务视图"
          hint="只影响之后新建的项目；已有项目可在任务列表右上角切换。"
        >
          <select
            className="select-input"
            value={form.taskViewDefault}
            onChange={(event) => update('taskViewDefault', event.target.value as TaskViewMode)}
          >
            <option value="list">列表式（当前样式）</option>
            <option value="note">便签式（根任务便签）</option>
          </select>
        </FormField>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.longTermRepeatInDateGroups}
            onChange={(event) => update('longTermRepeatInDateGroups', event.target.checked)}
          />
          <span>长期任务在日期列的所有分组中重复显示</span>
        </label>
        <div className="settings-note" style={{ margin: '-6px 0 12px' }}>
          关闭后长期任务只在所属日期分组显示；历史遗留项始终按实际日期只出现一次。
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.moveSelectedProjectToTop}
            onChange={(event) => update('moveSelectedProjectToTop', event.target.checked)}
          />
          <span>选择项目后跳到项目列表最上方</span>
        </label>
        <div className="settings-note" style={{ margin: '-6px 0 12px' }}>
          关闭时选择项目不会改变项目排序；编辑任务和手动置顶仍会更新顺序（默认关闭）。
        </div>
        <FormField label="历史遗留默认范围">
          <select
            className="select-input"
            value={form.historyScope}
            onChange={(event) => update('historyScope', event.target.value as HistoryScope)}
          >
            <option value="project">当前项目</option>
            <option value="all">全部项目</option>
          </select>
        </FormField>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">字体</div>
        <div className="settings-note" style={{ marginBottom: 10 }}>
          按区域独立设置；字号只缩放字体，不改变列宽和间距。保存后立即生效并持久化。
        </div>
        <div className="font-region-tabs">
          {FONT_REGION_KEYS.map((key) => (
            <button
              key={key}
              className={`font-region-tab ${fontRegion === key ? 'active' : ''}`}
              onClick={() => setFontRegion(key)}
            >
              {FONT_REGION_LABELS[key]}
            </button>
          ))}
        </div>
        <div
          className="font-preview"
          style={{
            fontFamily: resolveFontFamily(currentFont),
            fontSize: `${Math.round(14 * (currentFont.scale / 100))}px`
          }}
        >
          字体预览：待办工作台 · 本周任务 · 10.1-10.7
        </div>
        <div className="font-control-row">
          <span className="font-control-label">字号</span>
          <input
            className="font-range"
            type="range"
            min={90}
            max={150}
            step={5}
            value={currentFont.scale}
            onChange={(event) => updateFont({ scale: Number(event.target.value) })}
          />
          <span className="font-scale-value">{currentFont.scale}%</span>
        </div>
        <div className="font-control-row">
          <span className="font-control-label">字体</span>
          <select
            className="select-input font-family-select"
            value={currentFont.family}
            onChange={(event) => updateFont({ family: event.target.value as FontFamilyPreset })}
          >
            {FONT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        {currentFont.family === 'custom' ? (
          <input
            className="text-input font-custom-input"
            value={currentFont.customFamily ?? ''}
            placeholder="输入系统已安装的字体名称，例如：霞鹜文楷"
            onChange={(event) => updateFont({ customFamily: event.target.value })}
          />
        ) : null}
        <div className="font-actions">
          <button className="btn btn-soft" onClick={applyFontToAll}>
            应用到全部区域
          </button>
          <button className="btn btn-ghost" onClick={resetFonts}>
            恢复全部默认
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">快捷键</div>
        <div className="settings-note" style={{ marginBottom: 10 }}>
          快捷键作用于当前选中的待办项。单击右侧快捷键后按下新的组合键，按 Esc 取消录入。
        </div>
        <div className="shortcut-list">
          {SHORTCUT_DEFINITIONS.map((item) => (
            <div className="shortcut-row" key={item.action}>
              <div className="shortcut-info">
                <span className="shortcut-name">{item.label}</span>
                <span className="shortcut-desc">{item.description}</span>
              </div>
              <button
                className={`shortcut-recorder ${recordingShortcut === item.action ? 'recording' : ''}`}
                title="点击后按下新的快捷键"
                onClick={() =>
                  setRecordingShortcut((current) => (current === item.action ? null : item.action))
                }
                onBlur={() =>
                  setRecordingShortcut((current) => (current === item.action ? null : current))
                }
                onKeyDown={(event) => recordShortcut(item.action, event)}
              >
                {recordingShortcut === item.action ? (
                  <span className="shortcut-recording-text">按下快捷键…</span>
                ) : (
                  <ShortcutKeys value={form.shortcuts[item.action]} />
                )}
              </button>
            </div>
          ))}
        </div>
        {shortcutError ? <div className="form-error">{shortcutError}</div> : null}
        <div className="font-actions">
          <button className="btn btn-ghost" onClick={resetShortcuts}>
            恢复默认快捷键
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">系统</div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.autoLaunch}
            onChange={(event) => update('autoLaunch', event.target.checked)}
          />
          <span>开机自动启动（默认关闭）</span>
        </label>
        <div className="settings-action-row">
          <button className="btn btn-soft" onClick={() => void testNotification()}>
            <BellRing size={14} />
            测试系统通知
          </button>
          <div className="settings-note">关闭到托盘仍会提醒；完全退出后不保证提醒。</div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">数据</div>
        <div className="settings-action-row">
          <button className="btn btn-soft" onClick={() => void backup()}>
            <Download size={14} />
            立即备份
          </button>
          <button className="btn btn-soft" onClick={() => void window.api.openDataDir()}>
            <FolderOpen size={14} />
            打开数据目录
          </button>
        </div>
        <div className="settings-note">数据保存在本机 SQLite，每日启动自动备份并保留最近 7 份。</div>
      </div>

      <div className="settings-about">
        <ShieldCheck size={14} />
        <span>待办工作台 v{appVersion || '0.6.0'} · 本地优先 · 无云同步</span>
      </div>
    </Modal>
  )
}

interface RecycleDialogProps {
  open: boolean
  onClose: () => void
}

export function RecycleDialog({ open, onClose }: RecycleDialogProps): React.JSX.Element | null {
  const refreshAll = useAppStore((state) => state.refreshAll)
  const purgeTasks = useAppStore((state) => state.purgeTasks)
  const showToast = useAppStore((state) => state.showToast)
  const [items, setItems] = useState<RecycleItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<RecycleItem[] | null>(null)
  const [expiredOpen, setExpiredOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const next = await window.api.getRecycleBin()
      setItems(next)
      setSelectedIds((current) => new Set([...current].filter((id) => next.some((item) => item.id === id))))
    } catch (loadError) {
      console.error('读取回收站失败', loadError)
      setError('读取回收站失败，请稍后重试；如持续失败请检查数据目录。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set())
      setPendingDelete(null)
      setExpiredOpen(false)
      setError('')
      void load()
    }
  }, [open])

  const restore = async (id: string): Promise<void> => {
    try {
      await window.api.restoreTask(id)
      await refreshAll()
      await load()
      showToast('任务已恢复')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error))
    }
  }

  const purgeExpired = async (): Promise<void> => {
    try {
      const count = await window.api.purgeExpired()
      await refreshAll()
      await load()
      showToast(count > 0 ? `已清理 ${count} 个过期任务及其子项` : '没有超过 30 天的任务')
      setExpiredOpen(false)
    } catch (purgeError) {
      showToast(purgeError instanceof Error ? purgeError.message : String(purgeError))
      setExpiredOpen(false)
    }
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length
  const expiredCount = items.filter(
    (item) => item.deletedAt && Date.now() - new Date(item.deletedAt).getTime() >= 30 * 24 * 60 * 60 * 1000
  ).length
  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => item.id)))
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete || pendingDelete.length === 0) return
    try {
      const count = await purgeTasks(pendingDelete.map((item) => item.id))
      await load()
      setPendingDelete(null)
      if (count > 0) showToast(`已永久删除 ${count} 个任务及其子项`)
    } catch {
      // store 已显示具体错误；保留确认框，让用户可以取消或重试。
    }
  }

  return (
    <>
      <Modal
        open={open}
        title="回收站"
        subtitle="已删除的根任务保留 30 天"
        icon={<Trash2 size={18} />}
        width={620}
        onClose={onClose}
        footer={
          <>
            <button
              className="btn btn-ghost"
              disabled={expiredCount === 0}
              title={expiredCount === 0 ? '没有超过 30 天的任务' : `清理 ${expiredCount} 个过期任务`}
              onClick={() => setExpiredOpen(true)}
            >
              清理过期项
            </button>
            {items.length > 0 ? (
              <button
                className="btn btn-danger recycle-batch-delete"
                disabled={selectedIds.size === 0}
                onClick={() => setPendingDelete(items.filter((item) => selectedIds.has(item.id)))}
              >
                <Trash2 size={13} />
                删除选中 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={onClose}>
              关闭
            </button>
          </>
        }
      >
        {error ? (
          <div className="recycle-error">
            <div>读取回收站失败：{error}</div>
            <button className="btn btn-soft" onClick={() => void load()}>
              重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Trash2 size={26} />} title={loading ? '正在加载…' : '回收站是空的'} />
        ) : (
          <>
            <div className="recycle-toolbar">
              <label className="recycle-select-all">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                <span>全选</span>
              </label>
              <span className="recycle-selected-count">已选 {selectedIds.size} 项</span>
            </div>
            <div className="recycle-list">
              {items.map((item) => (
                <div className="recycle-item" key={item.id}>
                  <label className="recycle-check" title="选择此任务">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </label>
                  <div className="recycle-main">
                    <div className="recycle-title">{item.content}</div>
                    <div className="recycle-meta">
                      {item.projectName} · 删除于 {item.deletedAt ? new Date(item.deletedAt).toLocaleString('zh-CN') : '—'}
                    </div>
                  </div>
                  <div className="recycle-actions">
                    <button className="btn btn-soft" onClick={() => void restore(item.id)}>
                      <RotateCcw size={13} />
                      恢复
                    </button>
                    <button
                      className="icon-button recycle-delete"
                      title="永久删除"
                      onClick={() => setPendingDelete([item])}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="永久删除任务"
        message={
          pendingDelete?.length === 1
            ? `确定永久删除「${pendingDelete[0].content}」及其全部子项吗？删除后无法恢复。`
            : `确定永久删除选中的 ${pendingDelete?.length ?? 0} 个任务及其全部子项吗？删除后无法恢复。`
        }
        confirmLabel="永久删除"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={expiredOpen}
        title="清理过期任务"
        message={`将永久删除回收站中 ${expiredCount} 个超过 30 天的任务及其全部子项，删除后无法恢复。`}
        confirmLabel="清理过期项"
        danger
        onCancel={() => setExpiredOpen(false)}
        onConfirm={purgeExpired}
      />
    </>
  )
}

interface ArchivedDialogProps {
  open: boolean
  onClose: () => void
}

export function ArchivedDialog({ open, onClose }: ArchivedDialogProps): React.JSX.Element | null {
  const unarchiveProject = useAppStore((state) => state.unarchiveProject)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setProjects(await window.api.getArchivedProjects())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  return (
    <Modal
      open={open}
      title="已归档项目"
      subtitle="归档项目不参与历史、搜索与提醒"
      icon={<Archive size={18} />}
      width={520}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      {projects.length === 0 ? (
        <EmptyState icon={<Archive size={26} />} title={loading ? '正在加载…' : '没有已归档项目'} />
      ) : (
        <div className="archive-list">
          {projects.map((project) => (
            <div className="archive-item" key={project.id}>
              <div>
                <div className="recycle-title">{project.name}</div>
                <div className="recycle-meta">
                  {project.archivedAt ? `归档于 ${new Date(project.archivedAt).toLocaleString('zh-CN')}` : ''}
                </div>
              </div>
              <button
                className="btn btn-soft"
                onClick={async () => {
                  await unarchiveProject(project.id)
                  await load()
                }}
              >
                <RotateCcw size={13} />
                取消归档
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function toDateInput(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toTimeInput(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface ReminderDialogProps {
  open: boolean
  todo: Todo | null
  onClose: () => void
}

export function ReminderDialog({ open, todo, onClose }: ReminderDialogProps): React.JSX.Element | null {
  const setReminder = useAppStore((state) => state.setReminder)
  const clearReminder = useAppStore((state) => state.clearReminder)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [advance, setAdvance] = useState(15)
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('none')
  const [interval, setIntervalValue] = useState(10)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !todo) return
    setDate(toDateInput(todo.remindAt))
    setTime(toTimeInput(todo.remindAt))
    setAdvance(todo.advanceMinutes ?? 15)
    setRepeatRule(todo.repeatRule ?? 'none')
    setIntervalValue(todo.repeatIntervalMinutes ?? 10)
    setError('')
  }, [open, todo])

  const advanceOptions = useMemo(() => {
    const values = [0, 5, 15, 30, 60]
    return values.map((value) => ({
      value,
      disabled: repeatRule === 'interval' && value >= interval
    }))
  }, [repeatRule, interval])

  useEffect(() => {
    if (repeatRule === 'interval' && advance >= interval) setAdvance(0)
  }, [repeatRule, interval, advance])

  const save = async (): Promise<void> => {
    if (!todo || busy) return
    const remindAt = `${date}T${time}`
    const when = new Date(remindAt)
    if (Number.isNaN(when.getTime())) {
      setError('请选择有效的提醒时间')
      return
    }
    if (when.getTime() <= Date.now()) {
      setError('提醒时间必须晚于当前时间')
      return
    }
    if (repeatRule === 'interval' && (interval < 1 || interval > 1440)) {
      setError('循环间隔需为 1–1440 分钟')
      return
    }
    if (repeatRule === 'interval' && advance >= interval) {
      setError('提前提醒必须小于循环间隔')
      return
    }
    setBusy(true)
    try {
      await setReminder({
        todoId: todo.id,
        remindAt,
        repeatRule,
        repeatIntervalMinutes: repeatRule === 'interval' ? interval : null,
        advanceMinutes: advance
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="提醒设置"
      subtitle={todo ? `为「${todo.content}」设置提醒` : ''}
      icon={<Bell size={18} />}
      width={560}
      onClose={onClose}
      footer={
        <>
          {todo?.remindAt ? (
            <button
              className="btn btn-ghost danger-text"
              disabled={busy}
              onClick={async () => {
                if (!todo) return
                setBusy(true)
                try {
                  await clearReminder(todo.id)
                  onClose()
                } finally {
                  setBusy(false)
                }
              }}
            >
              移除提醒
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            保存提醒
          </button>
        </>
      }
    >
      <div className="reminder-form">
        <div className="reminder-datetime">
          <FormField label="提醒日期">
            <input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormField>
          <FormField label="提醒时间">
            <input className="text-input" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </FormField>
        </div>
        <FormField label="提前提醒" hint="分钟级循环时，提前提醒必须小于循环间隔">
          <select
            className="select-input"
            value={advance}
            onChange={(event) => setAdvance(Number(event.target.value))}
          >
            {advanceOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.value === 0 ? '准时' : `${option.value} 分钟`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="重复规则">
          <select
            className="select-input"
            value={repeatRule}
            onChange={(event) => setRepeatRule(event.target.value as RepeatRule)}
          >
            <option value="none">不重复</option>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="monthly">每月</option>
            <option value="interval">自定义间隔（分钟）</option>
          </select>
        </FormField>
        {repeatRule === 'interval' ? (
          <FormField label="循环间隔" hint="范围 1–1440 分钟">
            <div className="interval-input-row">
              <span>每隔</span>
              <input
                className="text-input interval-number"
                type="number"
                min={1}
                max={1440}
                value={interval}
                onChange={(event) => setIntervalValue(Number(event.target.value))}
              />
              <span>分钟提醒一次</span>
            </div>
          </FormField>
        ) : null}
        {error ? <div className="form-error">{error}</div> : null}
        <div className="notice-box">
          <ShieldCheck size={14} />
          <span>关闭到托盘仍会提醒；完全退出后不保证提醒。错过提醒时间后，下次启动将补提醒。</span>
        </div>
      </div>
    </Modal>
  )
}

interface ReminderActionDialogProps {
  open: boolean
  todo: Todo | null
  onClose: () => void
}

export function ReminderActionDialog({ open, todo, onClose }: ReminderActionDialogProps): React.JSX.Element | null {
  const snoozeReminder = useAppStore((state) => state.snoozeReminder)
  const setStatus = useAppStore((state) => state.setStatus)

  if (!todo) return null
  return (
    <Modal
      open={open}
      title="任务提醒"
      subtitle="系统通知的点击落地页"
      icon={<Clock3 size={18} />}
      width={460}
      onClose={onClose}
      footer={
        <button className="btn btn-ghost" onClick={onClose}>
          稍后处理
        </button>
      }
    >
      <div className="reminder-action-title">{todo.content}</div>
      <div className="reminder-action-sub">
        待办日期 {shortDateLabel(todo.todoDate)} · 优先级 {todo.priority === 'high' ? '高' : todo.priority === 'medium' ? '中' : '低'}
      </div>
      <div className="reminder-action-buttons">
        {[5, 10, 30].map((minutes) => (
          <button
            key={minutes}
            className="btn btn-soft"
            onClick={async () => {
              await snoozeReminder(todo.id, minutes)
              onClose()
            }}
          >
            稍后 {minutes} 分钟
          </button>
        ))}
        <button
          className="btn btn-primary"
          onClick={async () => {
            await setStatus(todo.id, 'complete')
            onClose()
          }}
        >
          <CheckCircle2 size={14} />
          完成
        </button>
      </div>
      <div className="notice-box">
        <Bell size={14} />
        <span>Windows 通知上的操作按钮支持有限，因此在应用内提供同样的「稍后 / 完成」操作。</span>
      </div>
    </Modal>
  )
}

export function ArchivedProjectIcon(): React.JSX.Element {
  return <History size={18} />
}
