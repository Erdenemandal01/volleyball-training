import Link from 'next/link'
import {
  AlertTriangle,
  CalendarOff,
  ClipboardCheck,
  CircleSlash,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { dashboardData } from '@/lib/services/dashboard'
import { parseMonthKey, formatDate, formatTime, MONTH_NAMES } from '@/lib/date'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { MonthPicker } from '@/components/filters'
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE } from '@/lib/labels'

export const dynamic = 'force-dynamic'

type Search = Promise<{ month?: string }>

function MetricCard({
  href,
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  href: string
  label: string
  value: number
  hint: string
  icon: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = {
    neutral: 'text-[var(--color-ink)]',
    success: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    danger: 'text-[var(--color-danger)]',
  }[tone]

  return (
    <Link
      href={href}
      className="vt-card block px-4 py-4 transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--color-muted)]">{label}</p>
        <span className="text-[var(--color-faint)]" aria-hidden>
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[13px] text-[var(--color-muted)]">{hint}</p>
    </Link>
  )
}

export default async function AdminDashboardPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month, key } = parseMonthKey(params.month)
  const data = await dashboardData({ year, month })

  return (
    <>
      <PageHeader
        title="Хяналтын самбар"
        description={`Өнөөдөр ${formatDate(data.today)} · ${year} оны ${MONTH_NAMES[month - 1]}`}
        filters={<MonthPicker year={year} month={month} />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          href="/admin/students?status=active"
          label="Идэвхтэй сурагч"
          value={data.metrics.activeStudents}
          hint="Бүртгэлтэй, суралцаж буй"
          icon={<Users size={20} />}
        />
        <MetricCard
          href="/admin/attendance"
          label="Өнөөдөр ирсэн"
          value={data.metrics.presentToday}
          hint="Өнөөдрийн бэлтгэлүүдээр"
          icon={<UserCheck size={20} />}
          tone="success"
        />
        <MetricCard
          href={`/admin/students?filter=unpaid&month=${key}`}
          label="Төлбөр төлөөгүй"
          value={data.metrics.unpaidThisMonth}
          hint={`${year} оны ${MONTH_NAMES[month - 1]}`}
          icon={<Wallet size={20} />}
          tone={data.metrics.unpaidThisMonth > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          href={`/admin/students?filter=no-credits&month=${key}`}
          label="Эрх дууссан"
          value={data.metrics.noCredits}
          hint="Оролтын эрх 0 болсон"
          icon={<CircleSlash size={20} />}
          tone={data.metrics.noCredits > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Өнөөдрийн бэлтгэл"
            description={formatDate(data.today)}
            action={
              <Link
                href="/admin/training"
                className="text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                Бүх бэлтгэл
              </Link>
            }
          />
          {data.todaySessions.length === 0 ? (
            <EmptyState
              icon={<CalendarOff size={28} />}
              title="Өнөөдөр бэлтгэл алга"
              description="Энэ өдөрт төлөвлөсөн бэлтгэл байхгүй байна."
              action={
                <Link
                  href="/admin/training"
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  Бэлтгэл нэмэх
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {data.todaySessions.map((session) => {
                const progress =
                  session.rosterCount > 0
                    ? Math.round((session.markedCount / session.rosterCount) * 100)
                    : 0
                return (
                  <li key={session.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-ink)]">{session.groupName}</p>
                        <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                          {formatTime(session.startTime)}–{formatTime(session.endTime)} ·{' '}
                          {session.location}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={SESSION_STATUS_TONE[session.status]}>
                          {SESSION_STATUS_LABEL[session.status]}
                        </Badge>
                        {session.status === 'cancelled' ? (
                          <Link
                            href={`/admin/training/${session.id}`}
                            className="inline-flex min-h-11 items-center rounded-[10px] border border-[var(--color-line-strong)] px-3 text-sm font-medium hover:bg-slate-50"
                          >
                            Дэлгэрэнгүй
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/training/${session.id}`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                          >
                            <ClipboardCheck size={16} aria-hidden />
                            Ирц бүртгэх
                          </Link>
                        )}
                      </div>
                    </div>
                    {session.status !== 'cancelled' && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[var(--color-primary)]"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-[13px] text-[var(--color-muted)]">
                          {session.markedCount} / {session.rosterCount} бүртгэсэн
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Эрх дуусах дөхсөн"
            description="1–2 эрх үлдсэн болон дууссан сурагчид"
          />
          {data.lowCredit.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle size={28} />}
              title="Анхаарах сурагч алга"
              description="Бүх идэвхтэй сурагчид хангалттай эрхтэй байна."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {data.lowCredit.map((student) => (
                <li key={student.id}>
                  <Link
                    href={`/admin/students?student=${student.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--color-ink)]">
                        {student.fullName}
                      </p>
                      <p className="truncate text-[13px] text-[var(--color-muted)]">
                        {student.groupName ?? 'Бүлэггүй'}
                      </p>
                    </div>
                    <Badge tone={student.credits.remaining <= 0 ? 'danger' : 'warning'}>
                      {student.credits.remaining <= 0
                        ? 'Эрх дууссан'
                        : `${student.credits.remaining} үлдсэн`}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
