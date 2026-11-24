import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import type { ToastState } from '../store'

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  icon?: ReactNode
  width?: number
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, title, subtitle, icon, width = 540, onClose, children, footer }: ModalProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // 多层弹窗时只关闭最上层，避免 Escape 同时关闭回收站和删除确认框。
      const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay')
      if (overlays.length > 0 && overlays[overlays.length - 1] !== overlayRef.current) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-card" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="modal-head-main">
            {icon ? <div className="modal-icon">{icon}</div> : null}
            <div>
              <div className="modal-title">{title}</div>
              {subtitle ? <div className="modal-subtitle">{subtitle}</div> : null}
            </div>
          </div>
          <button className="icon-button modal-close" onClick={onClose} title="关闭">
            <X size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {hint ? <span className="form-hint">{hint}</span> : null}
    </label>
  )
}

export function ShortcutKeys({ value, className = '' }: { value: string; className?: string }): React.JSX.Element {
  const parts = value.split('+').filter(Boolean)
  if (parts.length === 0) return <span className={`shortcut-keys ${className}`.trim()}>未设置</span>
  return (
    <span className={`shortcut-keys ${className}`.trim()}>
      {parts.map((part, index) => (
        <span className="shortcut-part" key={`${part}-${index}`}>
          <kbd>{part}</kbd>
          {index < parts.length - 1 ? <span className="shortcut-plus">+</span> : null}
        </span>
      ))}
    </span>
  )
}

interface PromptDialogProps {
  open: boolean
  title: string
  label: string
  initialValue?: string
  placeholder?: string
  submitLabel?: string
  multiline?: boolean
  onClose: () => void
  onSubmit: (value: string) => void | Promise<void>
}

export function PromptDialog({
  open,
  title,
  label,
  initialValue = '',
  placeholder,
  submitLabel = '保存',
  multiline = false,
  onClose,
  onSubmit
}: PromptDialogProps): React.JSX.Element | null {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setBusy(false)
    }
  }, [open, initialValue])

  const submit = async (): Promise<void> => {
    const trimmed = value.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!value.trim() || busy} onClick={() => void submit()}>
            {submitLabel}
          </button>
        </>
      }
    >
      <FormField label={label} hint={multiline ? 'Enter 保存，Shift+Enter 换行' : undefined}>
        {multiline ? (
          <textarea
            className="text-input textarea"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void submit()
              }
            }}
          />
        ) : (
          <input
            className="text-input"
            value={value}
            placeholder={placeholder}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
          />
        )}
      </FormField>
    </Modal>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onCancel,
  onConfirm
}: ConfirmDialogProps): React.JSX.Element | null {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setBusy(false)
  }, [open])

  return (
    <Modal
      open={open}
      title={title}
      icon={<AlertTriangle size={18} />}
      width={430}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onCancel()
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
    </Modal>
  )
}

export function EmptyState({
  icon,
  title,
  description
}: {
  icon: ReactNode
  title: string
  description?: string
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-description">{description}</div> : null}
    </div>
  )
}

export function ToastHost({
  toast,
  onAction,
  onClose
}: {
  toast: ToastState | null
  onAction: () => void
  onClose: () => void
}): React.JSX.Element | null {
  if (!toast) return null
  return createPortal(
    <div className="toast">
      <span className="toast-text">{toast.message}</span>
      {toast.actionLabel ? (
        <button className="toast-action" onClick={onAction}>
          {toast.actionLabel}
        </button>
      ) : null}
      <button className="toast-close" onClick={onClose} title="关闭">
        <X size={13} />
      </button>
    </div>,
    document.body
  )
}
