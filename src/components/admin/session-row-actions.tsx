'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Eye, MoreVertical, Trash2, XCircle } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { api } from '@/lib/client-api'
import { formatDate, formatTime } from '@/lib/date'
import { cx } from '@/lib/format'

export type SessionRow = {
  id: string
  date: string
  startTime: string
  groupName: string
  location: string
  status: 'planned' | 'completed' | 'cancelled'
  markedCount: number
  rosterCount: number
  presentCount: number
  /** Устгахад audit-д хуулагдах ирцийн түүхийн тоо */
  historyCount: number
}

/**
 * Бэлтгэлийн жагсаалтын мөр бүрийн үйлдэл.
 * Ирцгүй бэлтгэлийг устгана, ирцтэйг нь цуцалж эрхийг буцаана.
 */
/** Нэг зэрэг зөвхөн нэг мөрийн цэс нээлттэй байхыг хангана (хулгана ба гарын товчлуур хоёуланд). */
const MENU_OPEN_EVENT = 'vt:session-menu-open'

export function SessionRowActions({ session }: { session: SessionRow }) {
  const router = useRouter()
  const menuId = useId()
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  /** Товчны байрлалаас цэсний байрлалыг тооцно (дэлгэцийн хүрээнд багтаана). */
  function positionFor(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect()
    const menuHeight = 230
    const openUp = rect.bottom + menuHeight > window.innerHeight
    const wanted = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4
    return {
      top: Math.min(Math.max(wanted, 8), Math.max(8, window.innerHeight - menuHeight - 8)),
      left: Math.min(Math.max(rect.right, 240), window.innerWidth - 16),
    }
  }

  const cancelled = session.status === 'cancelled'
  const hasAttendance = session.markedCount > 0
  const deleteBlockedReason = hasAttendance
    ? 'Ирц бүртгэсэн тул устгах боломжгүй — “Цуцлах”-ыг ашиглана уу.'
    : null

  // Өөр мөрийн цэс нээгдэхэд энэ цэс хаагдана
  useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) setMenu(null)
    }
    document.addEventListener(MENU_OPEN_EVENT, onOther)
    return () => document.removeEventListener(MENU_OPEN_EVENT, onOther)
  }, [menuId])

  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    // Гүйлгэхэд цэсийг хаахгүй — мөрөө дагаж байрлана.
    // (Хаах нь click-ийн үеийн автомат гүйлтэд ч цэсийг алга болгодог байсан.)
    const reposition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      // Товч харагдахаа больсон бол л хаана
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setMenu(null)
        return
      }
      setMenu(positionFor(trigger))
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu !== null])

  const label = `${formatDate(session.date)} · ${session.groupName}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label} — үйлдэл`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          if (menu) return setMenu(null)
          document.dispatchEvent(new CustomEvent(MENU_OPEN_EVENT, { detail: menuId }))
          setMenu(positionFor(event.currentTarget))
        }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-[var(--color-muted)] transition-colors hover:bg-slate-100 hover:text-[var(--color-ink)]"
      >
        <MoreVertical size={18} />
      </button>

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} — үйлдэл`}
          style={{ top: menu.top, left: menu.left }}
          className="fixed z-50 w-60 -translate-x-full rounded-[10px] border border-[var(--color-line)] bg-white py-1 text-left shadow-lg"
        >
          <p className="border-b border-[var(--color-line)] px-3 py-1.5 text-[12px] text-[var(--color-muted)]">
            {formatDate(session.date)} · {formatTime(session.startTime)} · {session.groupName}
          </p>

          <MenuItem
            icon={<Eye size={16} aria-hidden />}
            onClick={() => {
              setMenu(null)
              router.push(`/admin/training/${session.id}`)
            }}
          >
            Дэлгэрэнгүй
          </MenuItem>

          {!cancelled && (
            <MenuItem
              icon={<ClipboardCheck size={16} aria-hidden />}
              onClick={() => {
                setMenu(null)
                router.push(`/admin/training/${session.id}`)
              }}
            >
              Ирц бүртгэх
            </MenuItem>
          )}

          {!cancelled && (
            <>
              <div className="my-1 border-t border-[var(--color-line)]" />
              <MenuItem
                icon={<XCircle size={16} aria-hidden />}
                tone="danger"
                onClick={() => {
                  setMenu(null)
                  setCancelOpen(true)
                }}
              >
                Цуцлах
              </MenuItem>
              <MenuItem
                icon={<Trash2 size={16} aria-hidden />}
                tone="danger"
                disabled={deleteBlockedReason !== null}
                hint={deleteBlockedReason ?? undefined}
                onClick={() => {
                  setMenu(null)
                  setDeleteOpen(true)
                }}
              >
                Устгах
              </MenuItem>
            </>
          )}

          {cancelled && (
            <p className="px-3 py-2 text-[13px] text-[var(--color-muted)]">
              Энэ бэлтгэл цуцлагдсан.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Бэлтгэл цуцлах"
        danger
        confirmLabel="Бэлтгэлийг цуцлах"
        reasonLabel="Цуцлах шалтгаан"
        reasonRequired
        message={
          <>
            <strong>{formatDate(session.date)}</strong> · {session.groupName} ·{' '}
            {formatTime(session.startTime)} — энэ бэлтгэл цуцлагдана.{' '}
            {hasAttendance ? (
              <>
                Бүртгэсэн <strong>{session.markedCount}</strong> ирцээс{' '}
                <strong>{session.presentCount}</strong> сурагчийн оролтын эрх буцаагдана. Ирцийн
                түүх хадгалагдана.
              </>
            ) : (
              <>Ирц бүртгэгдээгүй тул оролтын эрхэд өөрчлөлт орохгүй.</>
            )}{' '}
            Цуцалсны дараа энэ бэлтгэлд ирц бүртгэх боломжгүй болно.
          </>
        }
        onConfirm={async (reason) => {
          await api.post(`/api/admin/sessions/${session.id}/cancel`, { reason })
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Бэлтгэл устгах"
        danger
        confirmLabel="Бэлтгэлийг устгах"
        message={
          <>
            <strong>{formatDate(session.date)}</strong> · {session.groupName} ·{' '}
            {formatTime(session.startTime)} — энэ бэлтгэл бүрмөсөн устана.
            Ирц бүртгэгдээгүй тул хэн нэгний оролтын эрхэд нөлөөлөхгүй. Энэ үйлдлийг буцаах
            боломжгүй.
            {session.historyCount > 0 && (
              <>
                {' '}Өмнө бүртгэж байгаад буцаасан <strong>{session.historyCount}</strong>{' '}
                тэмдэглэл audit бүртгэлд хуулагдана.
              </>
            )}
          </>
        }
        onConfirm={async () => {
          await api.del(`/api/admin/sessions/${session.id}`)
          router.refresh()
        }}
      />
    </>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  tone,
  disabled,
  hint,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  tone?: 'danger'
  disabled?: boolean
  hint?: string
}) {
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        title={hint}
        onClick={onClick}
        className={cx(
          'flex min-h-11 w-full items-center gap-2.5 px-3 text-sm transition-colors',
          disabled
            ? 'cursor-not-allowed text-[var(--color-faint)]'
            : tone === 'danger'
              ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]'
              : 'text-[var(--color-body)] hover:bg-slate-50',
        )}
      >
        <span className="shrink-0">{icon}</span>
        {children}
      </button>
      {hint && (
        <p className="px-3 pb-1.5 text-[12px] leading-snug text-[var(--color-muted)]">{hint}</p>
      )}
    </div>
  )
}
