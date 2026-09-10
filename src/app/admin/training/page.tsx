import Link from 'next/link'
import { CalendarOff } from 'lucide-react'
import { listSessions } from '@/lib/services/sessions'
import { listGroups } from '@/lib/services/groups'
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDays,
  formatDate,
  formatTime,
  monthRange,
  parseMonthKey,
  todayInUb,
  weekdayIndex,
} from '@/lib/date'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { MonthPicker, SelectFilter } from '@/components/filters'
import { AddSessionButton } from '@/components/admin/session-form'
import { SessionRowActions } from '@/components/admin/session-row-actions'
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE } from '@/lib/labels'
import { cx } from '@/lib/format'

export const dynamic = 'force-dynamic'

type Search = Promise<{ month?: string; group?: string }>

export default async function TrainingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month } = parseMonthKey(params.month)
  const { start, end } = monthRange(year, month)
  const today = todayInUb()

  const [groups, sessions] = await Promise.all([
    listGroups(),
    listSessions({ from: start, to: end, groupId: params.group }),
  ])

  const byDate = new Map<string, typeof sessions>()
  for (const session of sessions) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session])
  }

  // Календарийн сүлжээ — Даваа гарагаас эхэлнэ
  const firstWeekday = (weekdayIndex(start) + 6) % 7
  const gridStart = addDays(start, -firstWeekday)
  const cells: string[] = []
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i))
  const lastNeeded = cells.findIndex((d) => d > end && (weekdayIndex(d) + 6) % 7 === 0)
  const gridCells = cells.slice(0, lastNeeded > 0 ? lastNeeded : 42)

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }))

  return (
    <>
      <PageHeader
        title="Бэлтгэл"
        description={`${year} оны ${MONTH_NAMES[month - 1]} · нийт ${sessions.length} бэлтгэл`}
        action={<AddSessionButton groups={groupOptions} />}
        filters={
          <>
            <MonthPicker year={year} month={month} />
            <SelectFilter
              label="Бүлэг"
              name="group"
              value={params.group ?? ''}
              allLabel="Бүх бүлэг"
              options={groupOptions.map((g) => ({ value: g.id, label: g.name }))}
            />
          </>
        }
      />

      {groups.length === 0 && (
        <Card className="mb-4">
          <EmptyState
            title="Эхлээд сургалтын бүлэг үүсгэнэ үү"
            description="Бэлтгэл нэмэхийн тулд дор хаяж нэг бүлэг шаардлагатай."
            action={
              <Link
                href="/admin/training/groups"
                className="text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                Бүлэг үүсгэх
              </Link>
            }
          />
        </Card>
      )}

      {/* Desktop: сарын календарь */}
      <Card className="hidden lg:block">
        <CardHeader
          title="Сарын календарь"
          action={
            <Link
              href="/admin/training/groups"
              className="text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              Бүлгүүд
            </Link>
          }
        />
        <div className="grid grid-cols-7 border-b border-[var(--color-line)] bg-slate-50 text-center text-[13px] font-medium text-[var(--color-muted)]">
          {['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'].map((day) => (
            <div key={day} className="px-2 py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridCells.map((date) => {
            const inMonth = date >= start && date <= end
            const daySessions = byDate.get(date) ?? []
            return (
              <div
                key={date}
                className={cx(
                  'min-h-[104px] border-b border-r border-[var(--color-line)] p-1.5',
                  !inMonth && 'bg-slate-50/60',
                  date === today && 'bg-[var(--color-primary-soft)]',
                )}
              >
                <p
                  className={cx(
                    'mb-1 px-1 text-[13px] tabular-nums',
                    inMonth ? 'text-[var(--color-ink)]' : 'text-[var(--color-faint)]',
                    date === today && 'font-semibold text-[var(--color-primary)]',
                  )}
                >
                  {Number(date.slice(8, 10))}
                </p>
                <div className="space-y-1">
                  {daySessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`/admin/training/${session.id}`}
                      className={cx(
                        'block rounded-[8px] border px-1.5 py-1 text-[12px] leading-tight transition-colors hover:bg-slate-50',
                        session.status === 'cancelled'
                          ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)] line-through'
                          : 'border-[var(--color-line)] bg-white text-[var(--color-ink)]',
                      )}
                    >
                      <span className="block font-medium tabular-nums">
                        {formatTime(session.startTime)}
                      </span>
                      <span className="block truncate">{session.groupName}</span>
                      {/* Төлөвийг зөвхөн өнгөөр биш текстээр бас илэрхийлнэ */}
                      <span
                        className={
                          session.status === 'cancelled'
                            ? 'block font-medium no-underline'
                            : 'block text-[var(--color-muted)]'
                        }
                      >
                        {session.status === 'cancelled'
                          ? '✕ Цуцлагдсан'
                          : `${session.markedCount}/${session.rosterCount}`}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Жагсаалт (mobile-д үндсэн харагдац) */}
      <Card className="mt-4">
        <CardHeader title="Бэлтгэлийн жагсаалт" description="Огноогоор эрэмбэлэв" />
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarOff size={28} />}
            title="Энэ сард бэлтгэл алга"
            description="Сонгосон сард төлөвлөсөн бэлтгэл байхгүй байна."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-1 pr-2 hover:bg-slate-50">
                <Link
                  href={`/admin/training/${session.id}`}
                  className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-ink)]">
                      <span className="tabular-nums">{formatDate(session.date)}</span>
                      <span className="ml-2 text-[var(--color-muted)]">
                        {WEEKDAY_SHORT[weekdayIndex(session.date)]}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                      {session.groupName} · {formatTime(session.startTime)}–
                      {formatTime(session.endTime)} · {session.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[var(--color-muted)]">
                      Ирц {session.markedCount}/{session.rosterCount}
                    </span>
                    <Badge tone={SESSION_STATUS_TONE[session.status]}>
                      {SESSION_STATUS_LABEL[session.status]}
                    </Badge>
                  </div>
                </Link>
                <SessionRowActions
                  session={{
                    id: session.id,
                    date: session.date,
                    startTime: session.startTime,
                    groupName: session.groupName,
                    location: session.location,
                    status: session.status,
                    markedCount: Number(session.markedCount),
                    rosterCount: Number(session.rosterCount),
                    presentCount: Number(session.presentCount),
                    historyCount: Number(session.historyCount),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
