import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSessionDetail } from '@/lib/services/sessions'
import { listGroups } from '@/lib/services/groups'
import { formatDate, formatTime, todayInUb, WEEKDAY_SHORT, weekdayIndex } from '@/lib/date'
import { Badge, Card, CardHeader } from '@/components/ui'
import { AttendanceMarker } from '@/components/admin/attendance-marker'
import { SessionActions } from '@/components/admin/session-actions'
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE } from '@/lib/labels'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export default async function SessionDetailPage({ params }: { params: Params }) {
  const { id } = await params

  // Устгагдсан эсвэл байхгүй бэлтгэлийн холбоос дээр дарахад 404 хуудас гарна
  const detail = await getSessionDetail(id).catch(() => null)
  if (!detail) notFound()

  const { session, roster, historyCount } = detail
  const groups = await listGroups()
  const today = todayInUb()

  const marked = roster.filter((r) => r.status).length
  const present = roster.filter((r) => r.status === 'present').length
  const isFuture = session.date > today
  const isCancelled = session.status === 'cancelled'

  return (
    <>
      <Link
        href="/admin/training"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ChevronLeft size={16} aria-hidden />
        Бэлтгэл рүү буцах
      </Link>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-[var(--color-ink)]">
                {session.groupName}
              </h2>
              <Badge tone={SESSION_STATUS_TONE[session.status]}>
                {SESSION_STATUS_LABEL[session.status]}
              </Badge>
            </div>
            <p className="mt-1 text-[15px] text-[var(--color-body)]">
              <span className="tabular-nums">{formatDate(session.date)}</span>{' '}
              {WEEKDAY_SHORT[weekdayIndex(session.date)]} ·{' '}
              <span className="tabular-nums">
                {formatTime(session.startTime)}–{formatTime(session.endTime)}
              </span>{' '}
              · {session.location}
            </p>
            {session.note && (
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">{session.note}</p>
            )}
            {isCancelled && session.cancelReason && (
              <p className="mt-2 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
                Цуцлагдсан шалтгаан: {session.cancelReason}
              </p>
            )}
          </div>

          <SessionActions
            session={{
              id: session.id,
              groupId: session.groupId,
              groupName: session.groupName,
              date: session.date,
              startTime: session.startTime.slice(0, 5),
              endTime: session.endTime.slice(0, 5),
              location: session.location,
              note: session.note ?? '',
              status: session.status,
            }}
            groups={groups.map((g) => ({ id: g.id, name: g.name }))}
            hasAttendance={marked > 0}
            rosterCount={roster.length}
            markedCount={marked}
            presentCount={present}
            historyCount={historyCount}
          />
        </div>

        <div className="grid grid-cols-3 divide-x divide-[var(--color-line)] border-t border-[var(--color-line)] text-center">
          <div className="px-3 py-3">
            <p className="text-[13px] text-[var(--color-muted)]">Жагсаалтад</p>
            <p className="text-xl font-semibold tabular-nums">{roster.length}</p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[13px] text-[var(--color-muted)]">Бүртгэсэн</p>
            <p className="text-xl font-semibold tabular-nums">{marked}</p>
          </div>
          <div className="px-3 py-3">
            <p className="text-[13px] text-[var(--color-muted)]">Ирсэн</p>
            <p className="text-xl font-semibold tabular-nums text-[var(--color-success)]">
              {present}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ирц бүртгэх"
          description="Сурагч бүрийн төлөвийг товшиж сонгоно. Өөрчлөлт тухай бүрд хадгалагдана."
        />
        <AttendanceMarker
          sessionId={session.id}
          roster={roster.map((row) => ({
            studentId: row.studentId,
            fullName: row.fullName,
            studentStatus: row.studentStatus,
            status: row.status,
            credits: row.credits,
          }))}
          disabled={isCancelled || isFuture}
          disabledReason={
            isCancelled
              ? 'Энэ бэлтгэл цуцлагдсан тул ирц бүртгэхгүй.'
              : isFuture
                ? 'Болоогүй бэлтгэл. Бэлтгэл болсны дараа ирцээ бүртгэнэ үү.'
                : undefined
          }
        />
      </Card>
    </>
  )
}
