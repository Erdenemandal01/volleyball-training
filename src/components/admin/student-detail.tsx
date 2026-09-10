'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, MessageSquare, Pencil, Power, Wallet } from 'lucide-react'
import {
  Badge,
  Button,
  CreditBar,
  Drawer,
  ErrorNote,
  Spinner,
  SuccessNote,
  Tabs,
} from '@/components/ui'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { StudentFormModal, type GroupOption } from './student-form'
import { PaymentFormModal } from './payment-form'
import { RequestError, api } from '@/lib/client-api'
import { formatDate, formatMonthOf, formatTime, MONTH_NAMES } from '@/lib/date'
import { formatMoney } from '@/lib/format'
import { formatPhone } from '@/lib/phone'
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, STUDENT_STATUS_LABEL } from '@/lib/labels'
import type { AttendanceStatus, StudentStatus } from '@/db/schema'

type StudentDetailData = {
  student: {
    id: string
    fullName: string
    status: StudentStatus
    registeredAt: string
    adminNote: string | null
    groupId: string | null
    groupName: string | null
    parentUserId: string | null
    parentPhone: string | null
    parentName: string | null
    credits: { granted: number; used: number; remaining: number }
    totalPresent: number
  }
  attendanceHistory: {
    sessionId: string
    date: string
    startTime: string
    endTime: string
    location: string
    sessionStatus: string
    groupName: string
    status: AttendanceStatus | null
  }[]
  payments: {
    id: string
    paidAt: string
    coverageYear: number
    coverageMonth: number
    amount: number
    creditsGranted: number
    status: 'valid' | 'void'
    note: string | null
    voidReason: string | null
  }[]
}

export function StudentDetailDrawer({ groups }: { groups: GroupOption[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const studentId = searchParams.get('student')
  const monthKey = searchParams.get('month') ?? undefined

  const [data, setData] = useState<StudentDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.get<StudentDetailData>(`/api/admin/students/${studentId}`)
      setData(result)
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Мэдээлэл ачаалж чадсангүй.')
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    if (studentId) load()
    else setData(null)
  }, [studentId, load])

  function close() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('student')
    const query = params.toString()
    // Шүүлтүүр, хуудаслалт хадгалагдана
    router.push(query ? `/admin/students?${query}` : '/admin/students', { scroll: false })
  }

  if (!studentId) return null

  return (
    <Drawer
      open
      onClose={close}
      title={
        data ? (
          <div>
            <h2 className="truncate text-lg font-semibold text-[var(--color-ink)]">
              {data.student.fullName}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {STUDENT_STATUS_LABEL[data.student.status]} · {data.student.groupName ?? 'Бүлэггүй'}
            </p>
          </div>
        ) : (
          <h2 className="text-lg font-semibold">Сурагчийн мэдээлэл</h2>
        )
      }
    >
      {loading && !data && <Spinner />}
      {error && (
        <div className="p-5">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {data && (
        <StudentDetailContent
          data={data}
          groups={groups}
          monthKey={monthKey}
          onChanged={() => {
            load()
            router.refresh()
          }}
        />
      )}
    </Drawer>
  )
}

export function StudentDetailContent({
  data,
  groups,
  monthKey,
  onChanged,
}: {
  data: StudentDetailData
  groups: GroupOption[]
  monthKey?: string
  onChanged: () => void
}) {
  const [tab, setTab] = useState('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [newCode, setNewCode] = useState<string | null>(null)

  const { student } = data
  const [year, month] = (monthKey ?? '').split('-').map(Number)
  const targetYear = year || Number(new Date().toISOString().slice(0, 4))
  const targetMonth = month || Number(new Date().toISOString().slice(5, 7))

  const monthPayment = data.payments.find(
    (p) => p.status === 'valid' && p.coverageYear === targetYear && p.coverageMonth === targetMonth,
  )

  return (
    <div>
      <div className="border-b border-[var(--color-line)] px-5 py-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--color-muted)]">Бүртгүүлсэн</p>
            <p className="mt-0.5 font-medium tabular-nums">{formatDate(student.registeredAt)}</p>
          </div>
          <div>
            <p className="text-[var(--color-muted)]">Эцэг эхийн утас</p>
            <p className="mt-0.5 font-medium tabular-nums">{formatPhone(student.parentPhone)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-[12px] border border-[var(--color-line)] bg-slate-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--color-muted)]">
              Нийт олгосон эрх: <span className="font-semibold tabular-nums text-[var(--color-ink)]">{student.credits.granted}</span> удаа
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              Нийт ирсэн: <span className="font-semibold tabular-nums text-[var(--color-ink)]">{student.totalPresent}</span>
            </p>
          </div>
          <div className="mt-3 flex items-end gap-6">
            <div>
              <p className="text-[13px] text-[var(--color-muted)]">Ашигласан</p>
              <p className="text-2xl font-semibold tabular-nums">{student.credits.used}</p>
            </div>
            <div>
              <p className="text-[13px] text-[var(--color-muted)]">Үлдсэн</p>
              <p
                className={`text-2xl font-semibold tabular-nums ${
                  student.credits.remaining <= 0
                    ? 'text-[var(--color-danger)]'
                    : student.credits.remaining <= 2
                      ? 'text-[var(--color-warning)]'
                      : 'text-[var(--color-success)]'
                }`}
              >
                {student.credits.remaining}
              </p>
            </div>
          </div>
          <CreditBar used={student.credits.used} granted={student.credits.granted} className="mt-3" />
        </div>

        <div className="mt-3 rounded-[12px] border border-[var(--color-line)] p-4">
          <p className="text-sm text-[var(--color-muted)]">
            {formatMonthOf(targetYear, targetMonth)} төлбөр
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {monthPayment ? (
              <>
                <Badge tone="success">✓ ТӨЛСӨН</Badge>
                <span className="text-sm text-[var(--color-muted)]">
                  Төлсөн огноо: {formatDate(monthPayment.paidAt)} · {formatMoney(monthPayment.amount)}
                </span>
              </>
            ) : student.registeredAt.slice(0, 7) >
              `${targetYear}-${String(targetMonth).padStart(2, '0')}` ? (
              <Badge tone="neutral">— Хамаарахгүй (бүртгүүлэхээс өмнөх сар)</Badge>
            ) : (
              <Badge tone="danger">× ТӨЛӨӨГҮЙ</Badge>
            )}
          </div>
        </div>

        {student.adminNote && (
          <div className="mt-3 rounded-[12px] border border-[var(--color-warning)]/25 bg-[var(--color-warning-soft)] p-3">
            <p className="text-[13px] font-medium text-[var(--color-warning)]">
              Админы тайлбар (эцэг эхэд харагдахгүй)
            </p>
            <p className="mt-1 text-sm text-[var(--color-body)]">{student.adminNote}</p>
          </div>
        )}

        {newCode && (
          <div className="mt-3">
            <SuccessNote
              message={`Шинэ түр код: ${newCode} — эцэг эхэд дамжуулна уу. Хуучин нэвтрэлтүүд цуцлагдлаа.`}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
            <Pencil size={16} aria-hidden />
            Засах
          </Button>
          <Button size="sm" onClick={() => setPaymentOpen(true)}>
            <Wallet size={16} aria-hidden />
            Төлбөр бүртгэх
          </Button>
          <Link
            href={`/admin/communication?tab=messages&parent=${student.parentUserId ?? ''}`}
            className="inline-flex min-h-9 items-center gap-2 rounded-[10px] border border-[var(--color-line-strong)] bg-white px-3 text-sm hover:bg-slate-50"
          >
            <MessageSquare size={16} aria-hidden />
            Зурвас бичих
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setResetOpen(true)}>
            <KeyRound size={16} aria-hidden />
            Түр код олгох
          </Button>
          <Button
            size="sm"
            variant={student.status === 'active' ? 'danger' : 'secondary'}
            onClick={() => setStatusOpen(true)}
          >
            <Power size={16} aria-hidden />
            {student.status === 'active' ? 'Идэвхгүй болгох' : 'Дахин идэвхжүүлэх'}
          </Button>
        </div>
      </div>

      <div className="px-5 pt-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Тойм' },
            { id: 'attendance', label: 'Ирцийн түүх' },
            { id: 'payments', label: 'Төлбөрийн түүх' },
          ]}
        />
      </div>

      <div className="px-5 py-4">
        {tab === 'overview' && (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail label="Сурагчийн нэр" value={student.fullName} />
            <Detail label="Төлөв" value={STUDENT_STATUS_LABEL[student.status]} />
            <Detail label="Бүлэг" value={student.groupName ?? 'Бүлэггүй'} />
            <Detail label="Бүртгүүлсэн огноо" value={formatDate(student.registeredAt)} />
            <Detail label="Эцэг эх" value={student.parentName ?? '—'} />
            <Detail label="Эцэг эхийн утас" value={formatPhone(student.parentPhone)} />
            <Detail label="Нийт олгосон эрх" value={`${student.credits.granted} удаа`} />
            <Detail label="Нийт ирсэн" value={`${student.totalPresent} удаа`} />
          </dl>
        )}

        {tab === 'attendance' && (
          <div>
            {data.attendanceHistory.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                Ирцийн бүртгэл алга байна.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {data.attendanceHistory.map((row) => (
                  <li key={row.sessionId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums text-[var(--color-ink)]">
                        {formatDate(row.date)}
                      </p>
                      <p className="truncate text-[13px] text-[var(--color-muted)]">
                        {formatTime(row.startTime)}–{formatTime(row.endTime)} · {row.location}
                      </p>
                    </div>
                    {row.sessionStatus === 'cancelled' ? (
                      <Badge tone="neutral">Цуцлагдсан</Badge>
                    ) : (
                      <Badge tone={ATTENDANCE_TONE[row.status ?? 'unmarked']}>
                        {ATTENDANCE_LABEL[row.status ?? 'unmarked']}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div>
            {data.payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                Төлбөрийн бүртгэл алга байна.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {data.payments.map((payment) => (
                  <li key={payment.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {payment.coverageYear} оны {MONTH_NAMES[payment.coverageMonth - 1]}
                      </p>
                      {payment.status === 'void' ? (
                        <Badge tone="danger">Хүчингүй</Badge>
                      ) : (
                        <Badge tone="success">Хүчинтэй</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      Төлсөн: {formatDate(payment.paidAt)} · {formatMoney(payment.amount)} ·{' '}
                      {payment.creditsGranted} эрх
                    </p>
                    {payment.voidReason && (
                      <p className="mt-1 text-[13px] text-[var(--color-danger)]">
                        Хүчингүй болгосон шалтгаан: {payment.voidReason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <StudentFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          groups={groups}
          mode="edit"
          studentId={student.id}
          initialValues={{
            fullName: student.fullName,
            registeredAt: student.registeredAt,
            groupId: student.groupId ?? '',
            parentPhone: student.parentPhone ?? '',
            parentName: student.parentName ?? '',
            adminNote: student.adminNote ?? '',
          }}
          onSaved={onChanged}
        />
      )}

      {paymentOpen && (
        <PaymentFormModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          students={[{ id: student.id, fullName: student.fullName }]}
          initialValues={{ studentId: student.id }}
          onSaved={onChanged}
        />
      )}

      <ConfirmDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={student.status === 'active' ? 'Сурагчийг идэвхгүй болгох' : 'Дахин идэвхжүүлэх'}
        danger={student.status === 'active'}
        confirmLabel={student.status === 'active' ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
        reasonLabel="Шалтгаан (заавал биш)"
        message={
          student.status === 'active' ? (
            <>
              <strong>{student.fullName}</strong> идэвхгүй болно. Шинэ бэлтгэлийн жагсаалтад
              орохгүй. Ирц, төлбөр, харилцааны түүх бүрэн хадгалагдана. Эцэг эх нь өмнөх түүхээ
              харах боломжтой хэвээр байна.
            </>
          ) : (
            <>
              <strong>{student.fullName}</strong> дахин идэвхтэй болж, шинэ бэлтгэлийн жагсаалтад
              орно.
            </>
          )
        }
        onConfirm={async (reason) => {
          await api.post(`/api/admin/students/${student.id}/status`, {
            status: student.status === 'active' ? 'inactive' : 'active',
            reason: reason || null,
          })
          onChanged()
        }}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Эцэг эхэд түр код олгох"
        confirmLabel="Шинэ код үүсгэх"
        message={
          <>
            <strong>{student.parentName ?? formatPhone(student.parentPhone)}</strong>-д шинэ түр код
            үүснэ. Хуучин нууц код ажиллахаа болино, нэвтэрсэн бүх төхөөрөмжөөс гарна. Тэд эхний
            нэвтрэлтээр шинэ кодоо солино.
          </>
        }
        onConfirm={async () => {
          const result = await api.post<{ temporaryCode: string }>(
            `/api/admin/students/${student.id}/reset-code`,
          )
          setNewCode(result.temporaryCode)
          onChanged()
        }}
      />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--color-line)] px-3 py-2">
      <dt className="text-[13px] text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-ink)]">{value}</dd>
    </div>
  )
}
