import { useEffect, useState } from 'react'
import { Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { DateGroupingConfig, DateGroupingMode, ManualDateRange } from '@shared/types'
import { useAppStore } from '../store'
import { FormField, Modal } from './common'

interface DateGroupingDialogProps {
  open: boolean
  scope: 'project' | 'global'
  onClose: () => void
}

const MODE_OPTIONS: { value: DateGroupingMode; label: string; description: string }[] = [
  { value: 'day', label: '按天', description: '每天一条记录，保持现有习惯' },
  { value: 'week', label: '按周', description: '本周 / 上周 / 下周，周一为一周起点' },
  { value: 'interval', label: '每 N 天', description: '以每月 1 日为锚点连续切分' }
]

function cloneConfig(config: DateGroupingConfig): DateGroupingConfig {
  return {
    mode: config.mode,
    intervalDays: config.intervalDays,
    manualRanges: config.manualRanges.map((range) => ({ ...range }))
  }
}

export function DateGroupingDialog({ open, scope, onClose }: DateGroupingDialogProps): React.JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  const saveGlobalDateGrouping = useAppStore((state) => state.saveGlobalDateGrouping)
  const saveProjectDateGrouping = useAppStore((state) => state.saveProjectDateGrouping)
  const showToast = useAppStore((state) => state.showToast)
  const today = useAppStore((state) => state.today)
  const selectedDate = useAppStore((state) => state.selectedDate)
  const selectedProjectId = useAppStore((state) => state.selectedProjectId)
  const projectData = useAppStore((state) => state.projectData)
  const sourceConfig =
    scope === 'project' ? (projectData?.project.dateGrouping ?? settings.dateGrouping) : settings.dateGrouping
  const [form, setForm] = useState<DateGroupingConfig>(cloneConfig(sourceConfig))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(cloneConfig(sourceConfig))
      setError('')
      setBusy(false)
    }
  }, [open, sourceConfig])

  const updateMode = (mode: DateGroupingMode): void => {
    setForm((current) => ({ ...current, mode }))
    setError('')
  }

  const updateRange = (id: string, patch: Partial<ManualDateRange>): void => {
    setForm((current) => ({
      ...current,
      manualRanges: current.manualRanges.map((range) => (range.id === id ? { ...range, ...patch } : range))
    }))
    setError('')
  }

  const addRange = (): void => {
    const anchor = selectedDate ?? today
    const range: ManualDateRange = {
      id: crypto.randomUUID(),
      start: anchor,
      end: anchor,
      label: ''
    }
    setForm((current) => ({ ...current, manualRanges: [...current.manualRanges, range] }))
    setError('')
  }

  const removeRange = (id: string): void => {
    setForm((current) => ({
      ...current,
      manualRanges: current.manualRanges.filter((range) => range.id !== id)
    }))
    setError('')
  }

  const validate = (): string => {
    const days = Math.floor(Number(form.intervalDays))
    if (form.mode === 'interval' && (!Number.isInteger(days) || days < 1 || days > 31)) {
      return 'N 天必须是 1–31 的整数'
    }
    const normalized = form.manualRanges.map((range) => {
      if (!range.start || !range.end) return { ...range, invalid: true }
      return {
        ...range,
        start: range.start <= range.end ? range.start : range.end,
        end: range.start <= range.end ? range.end : range.start,
        invalid: false
      }
    })
    if (normalized.some((range) => range.invalid)) return '手动区间的起止日期不能为空'
    const sorted = [...normalized].sort((a, b) => (a.start < b.start ? -1 : 1))
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].start <= sorted[index - 1].end) {
        return '手动区间不能相互重叠'
      }
    }
    return ''
  }

  const save = async (): Promise<void> => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setBusy(true)
    try {
      const manualRanges = form.manualRanges.map((range) => ({
        ...range,
        start: range.start <= range.end ? range.start : range.end,
        end: range.start <= range.end ? range.end : range.start,
        label: range.label?.trim() || undefined
      }))
      const config: DateGroupingConfig = {
        mode: form.mode,
        intervalDays: Math.min(31, Math.max(1, Math.floor(Number(form.intervalDays) || 10))),
        manualRanges
      }
      if (scope === 'project') {
        if (!selectedProjectId) {
          setError('请先选择一个项目')
          return
        }
        await saveProjectDateGrouping(selectedProjectId, config)
        showToast('当前项目日期规则已保存')
      } else {
        await saveGlobalDateGrouping(config)
        showToast('全部项目历史分组已保存')
      }
      onClose()
    } catch {
      setError('保存日期规则失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const reset = (): void => {
    setForm({ mode: 'day', intervalDays: 10, manualRanges: [] })
    setError('')
  }

  return (
    <Modal
      open={open}
      title="日期分组规则"
      subtitle={
        scope === 'project'
          ? '仅作用于当前项目；其他项目可以使用不同的分组规则'
          : '用于“全部项目”历史，并作为新建项目的默认规则；不改变已有项目的日期列'
      }
      icon={<SlidersHorizontal size={18} />}
      width={650}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost footer-left" onClick={reset}>
            恢复默认（按天）
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            保存规则
          </button>
        </>
      }
    >
      <div className="settings-section">
        <div className="settings-section-title">自动规则</div>
        <div className="grouping-mode-grid">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`grouping-mode-card ${form.mode === option.value ? 'active' : ''}`}
              onClick={() => updateMode(option.value)}
            >
              <span className="grouping-mode-name">{option.label}</span>
              <span className="grouping-mode-desc">{option.description}</span>
            </button>
          ))}
        </div>
        {form.mode === 'interval' ? (
          <div className="grouping-interval-row">
            <span>每</span>
            <input
              className="text-input interval-number"
              type="number"
              min={1}
              max={31}
              value={form.intervalDays}
              onChange={(event) => {
                setForm((current) => ({ ...current, intervalDays: Number(event.target.value) }))
                setError('')
              }}
            />
            <span>天为一组；以每月 1 日为锚点。</span>
          </div>
        ) : null}
        {form.mode === 'week' ? (
          <div className="settings-note">周一为一周起点；本周、上周、下周会始终显示。</div>
        ) : null}
      </div>

      <div className="settings-section">
        <div className="settings-section-title">
          手动区间 <span className="section-count">{form.manualRanges.length}</span>
        </div>
        <div className="settings-note" style={{ marginBottom: 10 }}>
          手动区间会覆盖自动分组，自动分组会扣除这些日期并拆分为剩余连续区间。单日区间直接填同一天即可。
          {scope === 'project' ? '这些区间只作用于当前项目。' : '这些区间只作用于全部项目历史。'}
        </div>
        {form.manualRanges.length === 0 ? (
          <div className="grouping-empty">还没有手动区间</div>
        ) : (
          <div className="manual-range-list">
            {form.manualRanges.map((range) => (
              <div className="manual-range-row" key={range.id}>
                <input
                  className="text-input"
                  type="date"
                  value={range.start}
                  onChange={(event) => updateRange(range.id, { start: event.target.value })}
                />
                <span className="range-dash">—</span>
                <input
                  className="text-input"
                  type="date"
                  value={range.end}
                  onChange={(event) => updateRange(range.id, { end: event.target.value })}
                />
                <input
                  className="text-input range-label-input"
                  value={range.label ?? ''}
                  placeholder="可选名称，如 国庆假期"
                  onChange={(event) => updateRange(range.id, { label: event.target.value })}
                />
                <button className="icon-button" title="删除区间" onClick={() => removeRange(range.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-soft grouping-add" onClick={addRange}>
          <Plus size={13} />
          添加手动区间
        </button>
      </div>

      <div className="notice-box">
        <SlidersHorizontal size={14} />
        <span>
          {scope === 'project'
            ? '当前项目的日期列和“本项目”历史使用这套规则；历史仍排除今天与未来，区间内的 todo 不会被复制到每一天。'
            : '“全部项目”历史使用这套规则；各项目日期列保持自己的项目规则。'}
        </span>
      </div>
      {error ? <div className="form-error" style={{ marginTop: 10 }}>{error}</div> : null}
    </Modal>
  )
}
