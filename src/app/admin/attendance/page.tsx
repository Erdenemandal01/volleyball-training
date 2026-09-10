import Link from 'next/link'
import { CalendarOff, ClipboardCheck } from 'lucide-react'
import { monthlyAttendanceGrid } from '@/lib/services/attendance'
import { listGroups } from '@/lib/services/groups'
import { listSessions } from '@/lib/services/sessions'
import { MONTH_NAMES, formatTime, monthRange, parseMonthKey, todayInUb } from '@/lib/date'
import { Card, CardHeader, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { MonthPicker, SelectFilter } from '@/components/filters'
import { AttendanceGrid } from '@/components/admin/attendance-grid'

export const dynamic = 'force-dynamic'

type Search = Promise<{ month?: string; group?: string }>

export default async function AttendancePage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month } = parseMonthKey(params.month)
  const today = todayInUb()
  const { start, end } = monthRange(year, month)

  const [groups, grid, todaySessions] = await Promise.all([
    listGroups(),
    monthlyAttendanceGrid({ year, month, groupId: params.group }),
    listSessions({ from: today, to: today, groupId: params.group, status: 'all' }),
  ])

  // Цуцлагдсан бэлтгэлд ирц бүртгэхгүй тул хурдан ирцэд харуулахгүй
  const activeTodaySessions = todaySessions.filter((s) => s.status !== 'cancelled')

  return (
    <>
      <PageHeader
        title="Ирц"
        description={`${year} оны ${MONTH_NAMES[month - 1]} · ${grid.sessions.length} бэлтгэл, ${grid.rows.length} сурагч`}
        filters={
          <>
            <MonthPicker year={year} month={month} />
            <SelectFilter
              label="Бүлэг"
              name="group"
              value={params.group ?? ''}
              allLabel="Бүх бүлэг"
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
          </>
        }
      />

      {activeTodaySessions.length > 0 && (
        <Card className="mb-4">
          <CardHeader
            title="Өнөөдрийн хурдан ирц"
            description="Бэлтгэлээ сонгоод шууд бүртгэнэ үү."
          />
          <ul className="divide-y divide-[var(--color-line)]">
            {activeTodaySessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/admin/training/${session.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                >
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">{session.groupName}</p>
                    <p className="text-sm text-[var(--color-muted)]">
                      {formatTime(session.startTime)}–{formatTime(session.endTime)} ·{' '}
                      {session.location}
                    </p>
                  </div>
                  <span className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-[var(--color-primary)] px-3 text-sm font-medium text-white">
                    <ClipboardCheck size={16} aria-hidden />
                    {session.markedCount}/{session.rosterCount} бүртгэсэн
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Сарын ирцийн хүснэгт"
          description={`Багана бүр нэг бэлтгэл (${start.slice(5)}–${end.slice(5)}). Нүд дээр дарж төлөв өөрчилнө.`}
        />
        {grid.sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarOff size={28} />}
            title="Энэ сард бэлтгэл алга"
            description="Сонгосон сар, бүлэгт бүртгэгдсэн бэлтгэл байхгүй тул хүснэгт хоосон байна."
            action={
              <Link
                href="/admin/training"
                className="text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                Бэлтгэл нэмэх
              </Link>
            }
          />
        ) : grid.rows.length === 0 ? (
          <EmptyState title="Сурагч олдсонгүй" description="Сонгосон бүлэгт сурагч алга байна." />
        ) : (
          <AttendanceGrid sessions={grid.sessions} rows={grid.rows} />
        )}
      </Card>
    </>
  )
}
