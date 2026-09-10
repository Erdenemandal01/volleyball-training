'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { PaymentFormModal } from './payment-form'
import { RequestError, api } from '@/lib/client-api'
import { cx } from '@/lib/format'
import { ATTENDANCE_LABEL } from '@/lib/labels'
import type { AttendanceStatus } from '@/db/schema'

export type RosterRow = {
  studentId: string
  fullName: string
  studentStatus: 'active' | 'inactive'
  status: AttendanceStatus | null
  credits: { granted: number; used: number; remaining: number }
}

type RowState = {
  status: AttendanceStatus | null
  remaining: number
  saving: boolean
  error: string | null
  savedAt: number | null
}

const OPTIONS: { value: AttendanceStatus | null; label: string; mark: string }[] = [
  { value: 'present', label: 'Ирсэн', mark: '✓' },
  { value: 'absent', label: 'Тасалсан', mark: '×' },
  { value: 'excused', label: 'Чөлөөтэй', mark: 'Ч' },
  { value: null, label: 'Бүртгээгүй', mark: '—' },
]

export function AttendanceMarker({
  sessionId,
  roster,
  disabled,
  disabledReason,
}: {
  sessionId: string
  roster: RosterRow[]
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      roster.map((row) => [
        row.studentId,
        {
          status: row.status,
          remaining: row.credits.remaining,
          saving: false,
          error: null,
          savedAt: null,
        },
      ]),
    ),
  )
  const [paymentFor, setPaymentFor] = useState<RosterRow | null>(null)

  // Серверээс шинэ өгөгдөл ирэхэд (жишээ нь бэлтгэл цуцлагдаж эрх буцаагдсаны дараа)
  // мөрүүдийг дахин тааруулна. Хадгалж байгаа мөрийг хөндөхгүй.
  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev }
      for (const row of roster) {
        const current = prev[row.studentId]
        if (current?.saving) continue
        next[row.studentId] = {
          status: row.status,
          remaining: row.credits.remaining,
          saving: false,
          error: current?.error ?? null,
          savedAt: current?.savedAt ?? null,
        }
      }
      return next
    })
  }, [roster])

  async function setStatus(row: RosterRow, next: AttendanceStatus | null) {
    const current = rows[row.studentId]
    if (current.saving || current.status === next) return

    // Optimistic: алдаа гарвал өмнөх зөв төлөвтөө буцна
    const previous = { ...current }
    setRows((prev) => ({
      ...prev,
      [row.studentId]: { ...current, status: next, saving: true, error: null },
    }))

    try {
      const result = await api.post<{
        status: AttendanceStatus | null
        summary: { granted: number; used: number; remaining: number }
      }>('/api/admin/attendance', {
        sessionId,
        studentId: row.studentId,
        status: next,
      })

      setRows((prev) => ({
        ...prev,
        [row.studentId]: {
          status: result.status,
          remaining: result.summary.remaining,
          saving: false,
          error: null,
          savedAt: Date.now(),
        },
      }))
      router.refresh()
    } catch (error) {
      setRows((prev) => ({
        ...prev,
        [row.studentId]: {
          ...previous,
          saving: false,
          error:
            error instanceof RequestError
              ? error.message
              : 'Хадгалж чадсангүй. Дахин оролдоно уу.',
        },
      }))
    }
  }

  return (
    <>
      {disabled && disabledReason && (
        <div className="border-b border-[var(--color-line)] bg-[var(--color-warning-soft)] px-4 py-3 text-sm text-[var(--color-warning)] sm:px-5">
          {disabledReason}
        </div>
      )}

      <ul className="divide-y divide-[var(--color-line)]">
        {roster.map((row) => {
          const state = rows[row.studentId]
          const noCredits = state.remaining <= 0 && state.status !== 'present'

          return (
            <li key={row.studentId} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-ink)]">
                    {row.fullName}
                    {row.studentStatus === 'inactive' && (
                      <span className="ml-2 text-[13px] font-normal text-[var(--color-muted)]">
                        (идэвхгүй)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                    Үлдсэн эрх:{' '}
                    <span
                      className={cx(
                        'font-medium tabular-nums',
                        state.remaining <= 0
                          ? 'text-[var(--color-danger)]'
                          : state.remaining <= 2
                            ? 'text-[var(--color-warning)]'
                            : 'text-[var(--color-success)]',
                      )}
                    >
                      {state.remaining}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {state.saving && (
                    <span className="flex items-center gap-1 text-[13px] text-[var(--color-muted)]">
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      Хадгалж байна…
                    </span>
                  )}
                  {!state.saving && state.savedAt && !state.error && (
                    <span className="flex items-center gap-1 text-[13px] text-[var(--color-success)]">
                      <Check size={14} aria-hidden />
                      Хадгалагдлаа
                    </span>
                  )}
                  <div
                    role="radiogroup"
                    aria-label={`${row.fullName}-ийн ирц`}
                    className="flex overflow-hidden rounded-[10px] border border-[var(--color-line-strong)]"
                  >
                    {OPTIONS.map((option) => {
                      const active = state.status === option.value
                      const blocked =
                        disabled || (option.value === 'present' && noCredits) || state.saving
                      return (
                        <button
                          key={option.label}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={option.label}
                          title={
                            option.value === 'present' && noCredits
                              ? 'Оролтын эрх дууссан тул “Ирсэн” гэж бүртгэх боломжгүй'
                              : option.label
                          }
                          disabled={blocked}
                          onClick={() => setStatus(row, option.value)}
                          className={cx(
                            'flex min-h-11 min-w-11 items-center justify-center gap-1 border-r border-[var(--color-line-strong)] px-2.5 text-sm last:border-r-0 transition-colors',
                            active
                              ? option.value === 'present'
                                ? 'bg-[var(--color-success)] text-white'
                                : option.value === 'absent'
                                  ? 'bg-[var(--color-danger)] text-white'
                                  : option.value === 'excused'
                                    ? 'bg-[var(--color-warning)] text-white'
                                    : 'bg-slate-200 text-[var(--color-ink)]'
                              : 'bg-white text-[var(--color-muted)] hover:bg-slate-50',
                            blocked && !active && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <span aria-hidden>{option.mark}</span>
                          <span className="hidden sm:inline">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {state.error && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
                  <AlertCircle size={15} aria-hidden />
                  <span>{state.error}</span>
                  {state.remaining <= 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setPaymentFor(row)}>
                      Төлбөр бүртгэх
                    </Button>
                  )}
                </div>
              )}

              {!state.error && noCredits && !disabled && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone="danger">Оролтын эрх дууссан</Badge>
                  <Button size="sm" variant="secondary" onClick={() => setPaymentFor(row)}>
                    Төлбөр бүртгэх
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {roster.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
          Энэ бэлтгэлийн жагсаалтад сурагч алга байна.
        </p>
      )}

      {paymentFor && (
        <PaymentFormModal
          open
          onClose={() => setPaymentFor(null)}
          students={[{ id: paymentFor.studentId, fullName: paymentFor.fullName }]}
          initialValues={{ studentId: paymentFor.studentId }}
          onSaved={() => router.refresh()}
        />
      )}

      <p className="border-t border-[var(--color-line)] px-4 py-3 text-[13px] text-[var(--color-muted)] sm:px-5">
        Тэмдэглэгээ: ✓ {ATTENDANCE_LABEL.present} · × {ATTENDANCE_LABEL.absent} · Ч{' '}
        {ATTENDANCE_LABEL.excused} · — {ATTENDANCE_LABEL.unmarked}. Зөвхөн “Ирсэн” нь 1 оролтын
        эрх ашиглана.
      </p>
    </>
  )
}
