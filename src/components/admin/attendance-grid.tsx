'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'
import { formatDayShort, formatDate, todayInUb } from '@/lib/date'
import { cx } from '@/lib/format'
import { ATTENDANCE_LABEL, ATTENDANCE_MARK } from '@/lib/labels'
import type { AttendanceStatus } from '@/db/schema'

type Cell = AttendanceStatus | 'unmarked' | 'na'

export type GridSession = {
  id: string
  date: string
  startTime: string
  location: string
  groupName: string
}

export type GridRow = {
  studentId: string
  fullName: string
  studentStatus: 'active' | 'inactive'
  paid: boolean
  paidAt: string | null
  cells: Cell[]
  monthPresent: number
  credits: { granted: number; used: number; remaining: number }
}

const OPTIONS: { value: AttendanceStatus | null; label: string }[] = [
  { value: 'present', label: 'Ирсэн' },
  { value: 'absent', label: 'Тасалсан' },
  { value: 'excused', label: 'Чөлөөтэй' },
  { value: null, label: 'Бүртгээгүй' },
]

function cellClass(cell: Cell) {
  switch (cell) {
    case 'present':
      return 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
    case 'absent':
      return 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
    case 'excused':
      return 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
    case 'na':
      return 'bg-slate-50 text-[var(--color-faint)]'
    default:
      return 'bg-white text-[var(--color-faint)]'
  }
}

export function AttendanceGrid({
  sessions,
  rows: initialRows,
}: {
  sessions: GridSession[]
  rows: GridRow[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [editing, setEditing] = useState<{
    studentId: string
    index: number
    top: number
    left: number
  } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const today = todayInUb()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setRows(initialRows), [initialRows])

  useEffect(() => {
    if (!editing) return
    function onClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setEditing(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setEditing(null)
    }
    // Хүснэгт гүйлгэхэд цэс байрлалаасаа салахгүйн тулд хаана
    const close = () => setEditing(null)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [editing])

  async function setStatus(
    row: GridRow,
    index: number,
    next: AttendanceStatus | null,
  ) {
    const session = sessions[index]
    const key = `${row.studentId}:${index}`
    const previousCells = [...row.cells]
    const previousCredits = { ...row.credits }
    const previousPresent = row.monthPresent

    setEditing(null)
    setError(null)
    setSaving(key)

    setRows((prev) =>
      prev.map((item) =>
        item.studentId === row.studentId
          ? {
              ...item,
              cells: item.cells.map((c, i) => (i === index ? (next ?? 'unmarked') : c)),
            }
          : item,
      ),
    )

    try {
      const result = await api.post<{
        status: AttendanceStatus | null
        summary: { granted: number; used: number; remaining: number }
      }>('/api/admin/attendance', {
        sessionId: session.id,
        studentId: row.studentId,
        status: next,
      })

      setRows((prev) =>
        prev.map((item) => {
          if (item.studentId !== row.studentId) return item
          const cells = item.cells.map((c, i) =>
            i === index ? ((result.status ?? 'unmarked') as Cell) : c,
          )
          return {
            ...item,
            cells,
            credits: result.summary,
            monthPresent: cells.filter((c) => c === 'present').length,
          }
        }),
      )
      router.refresh()
    } catch (err) {
      // Алдаа гарвал өмнөх зөв төлөв рүүгээ буцна
      setRows((prev) =>
        prev.map((item) =>
          item.studentId === row.studentId
            ? {
                ...item,
                cells: previousCells,
                credits: previousCredits,
                monthPresent: previousPresent,
              }
            : item,
        ),
      )
      setError({
        key,
        message: err instanceof RequestError ? err.message : 'Хадгалж чадсангүй.',
      })
    } finally {
      setSaving(null)
    }
  }

  const editingRow = editing ? rows.find((r) => r.studentId === editing.studentId) : null
  const editingSession = editing ? sessions[editing.index] : null

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="border-b border-[var(--color-line)] bg-[var(--color-danger-soft)] px-4 py-2.5 text-sm text-[var(--color-danger)]"
        >
          {error.message}
        </div>
      )}

      <div className="vt-scroll-x relative max-h-[70vh] overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50">
              <th
                scope="col"
                className="sticky left-0 z-30 min-w-[52px] border-b border-r border-[var(--color-line)] bg-slate-50 px-2 py-2 text-left font-medium text-[var(--color-muted)]"
              >
                №
              </th>
              <th
                scope="col"
                className="sticky left-[52px] z-30 min-w-[168px] border-b border-r border-[var(--color-line)] bg-slate-50 px-3 py-2 text-left font-medium text-[var(--color-muted)]"
              >
                Сурагчийн нэр
              </th>
              <th
                scope="col"
                className="border-b border-[var(--color-line)] px-3 py-2 text-left font-medium text-[var(--color-muted)]"
              >
                Төлбөр
              </th>
              <th
                scope="col"
                className="whitespace-nowrap border-b border-r border-[var(--color-line)] px-3 py-2 text-left font-medium text-[var(--color-muted)]"
              >
                Төлсөн огноо
              </th>
              {sessions.map((session, index) => (
                <th
                  key={session.id}
                  scope="col"
                  title={`${formatDate(session.date)} · ${session.groupName} · ${session.location}`}
                  className={cx(
                    'min-w-[52px] border-b border-[var(--color-line)] px-1 py-1.5 text-center font-medium',
                    session.date === today
                      ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                      : 'text-[var(--color-muted)]',
                  )}
                >
                  <span className="block text-[13px] font-semibold">{index + 1}</span>
                  <span className="block text-[12px] font-normal tabular-nums">
                    {formatDayShort(session.date)}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className="min-w-[80px] border-b border-l border-[var(--color-line)] bg-slate-50 px-2 py-2 text-center font-medium text-[var(--color-muted)]"
              >
                Сарын ирсэн
              </th>
              <th
                scope="col"
                className="min-w-[80px] border-b border-[var(--color-line)] bg-slate-50 px-2 py-2 text-center font-medium text-[var(--color-muted)]"
              >
                Үлдсэн эрх
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.studentId} className="hover:bg-slate-50/60">
                <td className="sticky left-0 z-10 border-b border-r border-[var(--color-line)] bg-white px-2 py-2 tabular-nums text-[var(--color-muted)]">
                  {rowIndex + 1}
                </td>
                <th
                  scope="row"
                  className="sticky left-[52px] z-10 border-b border-r border-[var(--color-line)] bg-white px-3 py-2 text-left font-medium"
                >
                  <span className="block truncate text-[var(--color-ink)]">{row.fullName}</span>
                  {row.studentStatus === 'inactive' && (
                    <span className="text-[12px] font-normal text-[var(--color-muted)]">
                      идэвхгүй
                    </span>
                  )}
                </th>
                <td className="border-b border-[var(--color-line)] px-3 py-2">
                  {row.paid ? (
                    <Badge tone="success">✓ Төлсөн</Badge>
                  ) : (
                    <Badge tone="danger">× Төлөөгүй</Badge>
                  )}
                </td>
                <td className="border-b border-r border-[var(--color-line)] px-3 py-2 tabular-nums text-[var(--color-muted)]">
                  {row.paidAt ? formatDate(row.paidAt) : '—'}
                </td>

                {row.cells.map((cell, index) => {
                  const key = `${row.studentId}:${index}`
                  const isEditing =
                    editing?.studentId === row.studentId && editing.index === index
                  const session = sessions[index]
                  return (
                    <td
                      key={session.id}
                      className={cx(
                        'relative border-b border-[var(--color-line)] p-0 text-center',
                        session.date === today && 'bg-[var(--color-primary-soft)]/40',
                      )}
                    >
                      <button
                        type="button"
                        disabled={cell === 'na' || saving === key}
                        aria-label={`${row.fullName} · ${formatDate(session.date)} · ${ATTENDANCE_LABEL[cell]}`}
                        onClick={(event) => {
                          if (isEditing) return setEditing(null)
                          const rect = event.currentTarget.getBoundingClientRect()
                          // Доор багтахгүй бол дээшээ нээнэ
                          const menuHeight = 224
                          const openUp = rect.bottom + menuHeight > window.innerHeight
                          const wanted = openUp ? rect.top - menuHeight - 4 : rect.bottom + 4
                          setEditing({
                            studentId: row.studentId,
                            index,
                            top: Math.min(
                              Math.max(wanted, 8),
                              Math.max(8, window.innerHeight - menuHeight - 8),
                            ),
                            left: Math.min(
                              Math.max(rect.left + rect.width / 2, 96),
                              window.innerWidth - 96,
                            ),
                          })
                        }}
                        className={cx(
                          'flex h-11 w-full min-w-[52px] items-center justify-center text-[15px] font-semibold transition-colors',
                          cellClass(cell),
                          cell !== 'na' && 'hover:ring-2 hover:ring-inset hover:ring-[var(--color-primary)]',
                          cell === 'na' && 'cursor-not-allowed',
                        )}
                      >
                        {saving === key ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          <span aria-hidden>{ATTENDANCE_MARK[cell]}</span>
                        )}
                      </button>

                    </td>
                  )
                })}

                <td className="border-b border-l border-[var(--color-line)] px-2 py-2 text-center font-semibold tabular-nums">
                  {row.monthPresent}
                </td>
                <td
                  className={cx(
                    'border-b border-[var(--color-line)] px-2 py-2 text-center font-semibold tabular-nums',
                    row.credits.remaining <= 0
                      ? 'text-[var(--color-danger)]'
                      : row.credits.remaining <= 2
                        ? 'text-[var(--color-warning)]'
                        : 'text-[var(--color-ink)]',
                  )}
                >
                  {row.credits.remaining}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Цэс нь хүснэгтийн scroll хэсэгт таслагдахгүйн тулд fixed байрлалтай */}
      {editingRow && editingSession && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${editingRow.fullName} · ${formatDate(editingSession.date)}`}
          style={{ top: editing!.top, left: editing!.left }}
          className="fixed z-50 w-44 -translate-x-1/2 rounded-[10px] border border-[var(--color-line)] bg-white py-1 text-left shadow-lg"
        >
          <p className="border-b border-[var(--color-line)] px-3 py-1.5 text-[12px] text-[var(--color-muted)]">
            {editingRow.fullName} · {formatDate(editingSession.date)}
          </p>
          {OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              onClick={() => setStatus(editingRow, editing!.index, option.value)}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-sm hover:bg-slate-50"
            >
              <span aria-hidden className="w-4 text-center">
                {ATTENDANCE_MARK[option.value ?? 'unmarked']}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-line)] px-4 py-3 text-[13px] text-[var(--color-muted)]">
        <span>
          <span className="font-semibold text-[var(--color-success)]">✓</span> Ирсэн
        </span>
        <span>
          <span className="font-semibold text-[var(--color-danger)]">×</span> Тасалсан
        </span>
        <span>
          <span className="font-semibold text-[var(--color-warning)]">Ч</span> Чөлөөтэй
        </span>
        <span>
          <span className="font-semibold">—</span> Бүртгээгүй
        </span>
        <span>
          <span className="font-semibold">·</span> Хамаарахгүй (жагсаалтад байгаагүй)
        </span>
      </div>
    </div>
  )
}
