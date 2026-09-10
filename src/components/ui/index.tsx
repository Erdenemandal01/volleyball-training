'use client'

import * as React from 'react'
import { Loader2, X } from 'lucide-react'
import { cx } from '@/lib/format'

/* ------------------------------- Button -------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  loading?: boolean
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap'

const buttonVariants: Record<string, string> = {
  primary: 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]',
  secondary:
    'bg-white text-[var(--color-ink)] border border-[var(--color-line-strong)] hover:bg-slate-50',
  ghost: 'bg-transparent text-[var(--color-ink)] hover:bg-slate-100',
  danger: 'bg-[var(--color-danger)] text-white hover:bg-red-800',
}

const buttonSizes: Record<string, string> = {
  md: 'min-h-11 px-4 text-[15px]',
  sm: 'min-h-9 px-3 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/* -------------------------------- Field -------------------------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="vt-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="vt-hint">{hint}</p>}
      {error && (
        <p className="vt-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx('vt-input', className)} {...props} />
  },
)

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx('vt-input', className)} {...props}>
      {children}
    </select>
  )
})

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx('vt-input min-h-24 resize-y', className)} {...props} />
})

/* -------------------------------- Badge -------------------------------- */

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const badgeTones: Record<BadgeTone, string> = {
  success: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
  warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-medium',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* --------------------------------- Card -------------------------------- */

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('vt-card', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3 sm:px-5 sm:py-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------- Feedback ------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-[var(--color-faint)]">{icon}</div>}
      <p className="font-medium text-[var(--color-ink)]">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-[var(--color-muted)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Ачаалж байна…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-10 text-[var(--color-muted)]">
      <Loader2 size={18} className="animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
    >
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Дахин оролдох
        </Button>
      )}
    </div>
  )
}

export function SuccessNote({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-[10px] border border-[var(--color-success)]/25 bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]"
    >
      {message}
    </div>
  )
}

/* -------------------------------- Modal -------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'md' | 'lg'
  /** false үед Escape болон дэвсгэр дээр дарахад хаагдахгүй (жишээ нь хадгалж байх үед) */
  dismissable?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  // onClose/dismissable-ийг ref-ээр уншина — эдгээрийн identity өөрчлөгдөхөд
  // фокусын эффект дахин ажиллаж, бичиж буй талбараас фокус булаахгүй.
  const closeRef = React.useRef(onClose)
  const dismissableRef = React.useRef(dismissable)
  closeRef.current = onClose
  dismissableRef.current = dismissable

  // 1) Нээгдэх/хаагдах бүрд НЭГ удаа: фокус оруулах, буцаах, scroll түгжих
  React.useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (ref.current && !ref.current.contains(document.activeElement)) {
      ref.current.focus()
    }
    return () => {
      document.body.style.overflow = previous
      opener?.focus?.()
    }
  }, [open])

  // 2) Гарын товчлуурын боловсруулалт (Escape ба focus trap)
  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dismissableRef.current) closeRef.current()
        return
      }
      // Focus trap — Tab нь цонхны гадна гарахгүй
      if (event.key !== 'Tab' || !ref.current) return
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !ref.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <button
        aria-label="Хаах"
        aria-hidden
        disabled={!dismissable}
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[16px] bg-white shadow-xl sm:rounded-[14px]',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && (
              <div className="mt-1 text-sm text-[var(--color-muted)]">{description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="-m-2 rounded-[10px] p-2 text-[var(--color-muted)] hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--color-line)] bg-slate-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------- Drawer ------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <button
        aria-label="Хаах"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Дэлгэрэнгүй'}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-5 py-4">
          <div className="min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="-m-2 rounded-[10px] p-2 text-[var(--color-muted)] hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-line)] bg-slate-50 px-5 py-3">
            {footer}
          </div>
        )}
      </aside>
    </div>
  )
}

/* ------------------------------ Progress bar --------------------------- */

export function CreditBar({
  used,
  granted,
  className,
}: {
  used: number
  granted: number
  className?: string
}) {
  const pct = granted > 0 ? Math.min(100, Math.round((used / granted) * 100)) : 0
  const remaining = granted - used
  const tone =
    remaining <= 0
      ? 'bg-[var(--color-danger)]'
      : remaining <= 2
        ? 'bg-[var(--color-warning)]'
        : 'bg-[var(--color-success)]'

  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={granted}
        aria-label={`Нийт ${granted} эрхээс ${used} ашигласан`}
      >
        <div className={cx('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[13px] text-[var(--color-muted)]">
        {granted > 0 ? `${used} / ${granted} эрх ашигласан` : 'Эрх олгогдоогүй'}
      </p>
    </div>
  )
}

/* --------------------------------- Tabs -------------------------------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; badge?: number }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" className="vt-scroll-x flex gap-1 border-b border-[var(--color-line)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'relative min-h-11 whitespace-nowrap px-4 text-sm font-medium transition-colors',
            active === tab.id
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
          )}
        >
          {tab.label}
          {tab.badge ? (
            <span className="ml-1.5 rounded-full bg-[var(--color-danger)] px-1.5 py-0.5 text-[11px] text-white">
              {tab.badge}
            </span>
          ) : null}
          {active === tab.id && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--color-primary)]" />
          )}
        </button>
      ))}
    </div>
  )
}
