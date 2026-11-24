import type { ShortcutAction, ShortcutMap } from '@shared/types'

export interface ShortcutDefinition {
  action: ShortcutAction
  label: string
  description: string
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { action: 'edit', label: '编辑任务', description: '打开当前选中任务的编辑框' },
  { action: 'addChild', label: '添加子项', description: '为当前任务创建下一级子项' },
  { action: 'pin', label: '置顶 / 取消置顶', description: '切换任务的置顶状态' },
  { action: 'priorityHigh', label: '设为高优先级', description: '把任务优先级改为高' },
  { action: 'priorityMedium', label: '设为中优先级', description: '把任务优先级改为中' },
  { action: 'priorityLow', label: '设为低优先级', description: '把任务优先级改为低' },
  { action: 'notDone', label: '标记不做 / 恢复', description: '根任务标记为不做，或恢复为待办' },
  { action: 'delete', label: '删除任务', description: '删除当前任务；根任务进入回收站' }
]

const RESERVED_SHORTCUTS = new Set([
  'Ctrl+R',
  'Ctrl+Shift+R',
  'Ctrl+W',
  'Ctrl+Q',
  'F5',
  'F12',
  'Ctrl+Shift+I',
  'Ctrl+Shift+J',
  'Ctrl+Shift+C'
])

function isModifierKey(key: string): boolean {
  return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta'
}

function normalizeKey(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (event.key === ' ') return 'Space'
  if (event.key.length === 1) return event.key.toUpperCase()
  return event.key
}

export function keyboardEventToShortcut(event: KeyboardEvent): string | null {
  if (isModifierKey(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  parts.push(normalizeKey(event))
  return parts.join('+')
}

export function shortcutParts(value: string): string[] {
  return value.split('+').filter(Boolean)
}

export function isReservedShortcut(value: string): boolean {
  return RESERVED_SHORTCUTS.has(value)
}

export function findShortcutAction(shortcuts: ShortcutMap, pressed: string): ShortcutAction | null {
  for (const [action, value] of Object.entries(shortcuts) as [ShortcutAction, string][]) {
    if (value === pressed) return action
  }
  return null
}
