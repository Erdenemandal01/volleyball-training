import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getSessionUser } from '@/lib/auth'
import { resolveChild } from '@/lib/services/parent-context'
import { parentAttendanceHistory } from '@/lib/services/parent'
import { MONTH_NAMES, formatDate, formatTime, parseMonthKey } from '@/lib/date'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'
import { MonthPicker } from '@/components/filters'
import { ATTENDANCE_LABEL, ATTENDANCE_TONE } from '@/lib/labels'

export const dynamic = 'force-dynamic'

type Search = Promise<{ child?: string; month?: string }>

export default async function ParentAttendancePage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { child } = await resolveChild(user.id, params.child)
  if (!child) {
    return (
      <Card>
        <EmptyState title="Бүртгэлтэй хүүхэд алга" />
      </Card>
    )
  }

  const { year, month } = parseMonthKey(params.month)
  const rows = await parentAttendanceHistory({
    parentUserId: user.id,
    studentId: child.id,
    year,
    month,
  })

  const present = rows.filter((r) => r.status === 'present').length

  return (
    <div className="space-y-4">
      <Link
        href={`/parent?child=${child.id}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--color-muted)]"
      >
        <ChevronLeft size={16} aria-hidden />
        Нүүр хуудас
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Ирцийн түүх</h2>
        <MonthPicker year={year} month={month} />
      </div>

      <Card>
        <CardHeader
          title={`${year} оны ${MONTH_NAMES[month - 1]}`}
          description={`${child.fullName} · энэ сард ${present} удаа ирсэн`}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="Энэ сард бэлтгэл алга"
            description="Сонгосон сард бүртгэгдсэн бэлтгэл байхгүй байна."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map((row) => (
              <li
                key={row.sessionId}
                className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="font-medium tabular-nums text-[var(--color-ink)]">
                    {formatDate(row.date)}
                  </p>
                  <p className="truncate text-[13px] text-[var(--color-muted)]">
                    <span className="tabular-nums">
                      {formatTime(row.startTime)}–{formatTime(row.endTime)}
                    </span>{' '}
                    · {row.location}
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

      <p className="text-[13px] text-[var(--color-muted)]">
        Зөвхөн “Ирсэн” бүртгэл оролтын эрхээс 1 хасна. Тасалсан, чөлөөтэй тэмдэглэгээ эрх
        хасахгүй.
      </p>
    </div>
  )
}
