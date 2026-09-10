import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarDays, ChevronRight, Megaphone } from 'lucide-react'
import { getSessionUser } from '@/lib/auth'
import { resolveChild } from '@/lib/services/parent-context'
import { parentStudentOverview } from '@/lib/services/parent'
import { listAnnouncementsForParent } from '@/lib/services/communication'
import { formatDate, formatMonthOf, formatTime, parseMonthKey, todayInUb } from '@/lib/date'
import { formatMoney } from '@/lib/format'
import { Badge, Card, CardHeader, CreditBar, EmptyState } from '@/components/ui'
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '@/lib/labels'

export const dynamic = 'force-dynamic'

type Search = Promise<{ child?: string }>

export default async function ParentHomePage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { child } = await resolveChild(user.id, params.child)
  if (!child) {
    return (
      <Card>
        <EmptyState
          title="Бүртгэлтэй хүүхэд алга"
          description="Таны бүртгэлд хүүхэд холбогдоогүй байна. Сургалтын админд хандана уу."
        />
      </Card>
    )
  }

  const { year, month } = parseMonthKey(undefined)
  const [overview, announcements] = await Promise.all([
    parentStudentOverview({ parentUserId: user.id, studentId: child.id, year, month }),
    listAnnouncementsForParent(user.id),
  ])

  const { credits } = overview
  const childQuery = `?child=${child.id}`
  const latestAnnouncement = announcements[0]

  return (
    <div className="space-y-4">
      <Card className="px-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-ink)]">
              {overview.student.fullName}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">
              {overview.student.groupName ?? 'Бүлэг тодорхойгүй'}
            </p>
          </div>
          {overview.student.status === 'inactive' && <Badge tone="neutral">Идэвхгүй</Badge>}
        </div>

        <div className="mt-5 text-center">
          <p className="text-sm text-[var(--color-muted)]">Үлдсэн оролт</p>
          <p
            className={`mt-1 text-6xl font-bold tabular-nums ${
              credits.remaining <= 0
                ? 'text-[var(--color-danger)]'
                : credits.remaining <= 2
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--color-success)]'
            }`}
          >
            {credits.remaining}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Нийт {credits.granted} эрхээс {credits.used} ашигласан
          </p>
        </div>

        <CreditBar used={credits.used} granted={credits.granted} className="mt-4" />

        {credits.remaining <= 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-[10px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>Оролтын эрх дууссан.</strong> Бэлтгэлд үргэлжлүүлэн оролцохын тулд төлбөрөө
              төлж, сургалтын админаар бүртгүүлнэ үү.
            </span>
          </div>
        ) : credits.remaining <= 2 ? (
          <div className="mt-4 flex items-start gap-2 rounded-[10px] bg-[var(--color-warning-soft)] px-4 py-3 text-sm text-[var(--color-warning)]">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Үлдсэн оролт <strong>{credits.remaining}</strong> байна. Удахгүй дуусах тул төлбөрөө
              урьдчилан төлөхийг зөвлөж байна.
            </span>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title={`${formatMonthOf(year, month)} төлбөр`}
          action={
            <Link
              href={`/parent/payments${childQuery}`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
            >
              Түүх
              <ChevronRight size={16} aria-hidden />
            </Link>
          }
        />
        <div className="px-4 py-4 sm:px-5">
          {overview.paidThisMonth ? (
            <div className="space-y-2">
              <Badge tone="success">✓ ТӨЛСӨН</Badge>
              {overview.monthPayments.map((payment) => (
                <p key={payment.id} className="text-sm text-[var(--color-body)]">
                  Төлсөн огноо: <span className="tabular-nums">{formatDate(payment.paidAt)}</span> ·{' '}
                  {formatMoney(payment.amount)} · {payment.creditsGranted} оролт
                </p>
              ))}
            </div>
          ) : !overview.registeredBeforeMonth ? (
            <Badge tone="neutral">— Хамаарахгүй (бүртгүүлэхээс өмнөх сар)</Badge>
          ) : (
            <div className="space-y-2">
              <Badge tone="danger">× ТӨЛӨӨГҮЙ</Badge>
              <p className="text-sm text-[var(--color-muted)]">
                Энэ сарын төлбөр бүртгэгдээгүй байна. Төлбөрөө төлсөн бол админд мэдэгдэнэ үү.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Дараагийн бэлтгэл"
          action={
            <Link
              href={`/parent/schedule${childQuery}`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
            >
              Бүх хуваарь
              <ChevronRight size={16} aria-hidden />
            </Link>
          }
        />
        {overview.nextSessions.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={26} />}
            title="Товлосон бэлтгэл алга"
            description="Шинэ хуваарь гармагц энд харагдана."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {overview.nextSessions.slice(0, 3).map((session) => (
              <li key={session.id} className="px-4 py-3.5 sm:px-5">
                <p className="font-medium tabular-nums text-[var(--color-ink)]">
                  {formatDate(session.date)}
                  {session.date === todayInUb() && (
                    <span className="ml-2 text-[13px] font-normal text-[var(--color-primary)]">
                      Өнөөдөр
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  <span className="tabular-nums">
                    {formatTime(session.startTime)}–{formatTime(session.endTime)}
                  </span>{' '}
                  · {session.location}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Сүүлийн ирц"
          action={
            <Link
              href={`/parent/attendance${childQuery}`}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
            >
              Бүх түүх
              <ChevronRight size={16} aria-hidden />
            </Link>
          }
        />
        {overview.recentAttendance.length === 0 ? (
          <EmptyState title="Ирцийн бүртгэл алга" description="Бэлтгэлд оролцсоны дараа энд харагдана." />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {overview.recentAttendance.map((row) => (
              <li
                key={row.sessionId}
                className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium tabular-nums text-[var(--color-ink)]">
                    {formatDate(row.date)}
                  </p>
                  <p className="truncate text-[13px] text-[var(--color-muted)]">
                    <span className="tabular-nums">{formatTime(row.startTime)}</span> · {row.location}
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
      </Card>

      {latestAnnouncement && (
        <Card>
          <CardHeader
            title="Сүүлийн зар"
            action={
              <Link
                href={`/parent/messages${childQuery}`}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--color-primary)]"
              >
                Бүх зар
                <ChevronRight size={16} aria-hidden />
              </Link>
            }
          />
          <div className="px-4 py-4 sm:px-5">
            <div className="flex items-start gap-2">
              <Megaphone size={18} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden />
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">{latestAnnouncement.title}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--color-body)]">
                  {latestAnnouncement.body}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
