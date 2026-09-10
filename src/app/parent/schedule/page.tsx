import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getSessionUser } from '@/lib/auth'
import { resolveChild } from '@/lib/services/parent-context'
import { parentUpcomingSessions } from '@/lib/services/parent'
import { WEEKDAY_SHORT, formatDate, formatTime, todayInUb, weekdayIndex } from '@/lib/date'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'
import { SESSION_STATUS_LABEL, SESSION_STATUS_TONE } from '@/lib/labels'

export const dynamic = 'force-dynamic'

type Search = Promise<{ child?: string }>

export default async function ParentSchedulePage({ searchParams }: { searchParams: Search }) {
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

  const sessions = await parentUpcomingSessions({ parentUserId: user.id, studentId: child.id })
  const today = todayInUb()

  return (
    <Card>
      <CardHeader
        title="Бэлтгэлийн хуваарь"
        description={`${child.fullName} · ${child.groupName ?? 'Бүлэг тодорхойгүй'}`}
      />
      {sessions.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Товлосон бэлтгэл алга"
          description="Шинэ хуваарь гармагц энд харагдана."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {sessions.map((session) => (
            <li key={session.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--color-ink)]">
                    <span className="tabular-nums">{formatDate(session.date)}</span>{' '}
                    <span className="text-[var(--color-muted)]">
                      {WEEKDAY_SHORT[weekdayIndex(session.date)]}
                    </span>
                    {session.date === today && (
                      <span className="ml-2 text-[13px] font-normal text-[var(--color-primary)]">
                        Өнөөдөр
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[15px] text-[var(--color-body)]">
                    <span className="tabular-nums">
                      {formatTime(session.startTime)}–{formatTime(session.endTime)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{session.location}</p>
                  {session.note && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{session.note}</p>
                  )}
                </div>
                <Badge tone={SESSION_STATUS_TONE[session.status]}>
                  {SESSION_STATUS_LABEL[session.status]}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
