import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Wallet } from 'lucide-react'
import { getSessionUser } from '@/lib/auth'
import { resolveChild } from '@/lib/services/parent-context'
import { parentPaymentHistory } from '@/lib/services/parent'
import { MONTH_NAMES, formatDate } from '@/lib/date'
import { formatMoney } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui'

export const dynamic = 'force-dynamic'

type Search = Promise<{ child?: string }>

export default async function ParentPaymentsPage({ searchParams }: { searchParams: Search }) {
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

  const payments = await parentPaymentHistory({ parentUserId: user.id, studentId: child.id })
  const totalCredits = payments
    .filter((p) => p.status === 'valid')
    .reduce((sum, p) => sum + p.creditsGranted, 0)

  return (
    <div className="space-y-4">
      <Link
        href={`/parent?child=${child.id}`}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--color-muted)]"
      >
        <ChevronLeft size={16} aria-hidden />
        Нүүр хуудас
      </Link>

      <Card>
        <CardHeader
          title="Төлбөрийн түүх"
          description={`${child.fullName} · нийт олгогдсон ${totalCredits} оролт`}
        />
        {payments.length === 0 ? (
          <EmptyState
            icon={<Wallet size={28} />}
            title="Төлбөрийн бүртгэл алга"
            description="Төлбөр бүртгэгдмэгц энд харагдана."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {payments.map((payment) => (
              <li key={payment.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-ink)]">
                      {payment.coverageYear} оны {MONTH_NAMES[payment.coverageMonth - 1]}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                      Төлсөн огноо:{' '}
                      <span className="tabular-nums">{formatDate(payment.paidAt)}</span>
                    </p>
                  </div>
                  {payment.status === 'void' ? (
                    <Badge tone="danger">× Хүчингүй болсон</Badge>
                  ) : (
                    <Badge tone="success">✓ Хүчинтэй</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-[var(--color-muted)]">Дүн: </span>
                    <span className="font-medium tabular-nums">{formatMoney(payment.amount)}</span>
                  </span>
                  <span>
                    <span className="text-[var(--color-muted)]">Олгосон оролт: </span>
                    <span className="font-medium tabular-nums">{payment.creditsGranted}</span>
                  </span>
                </div>
                {payment.note && (
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">{payment.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[13px] text-[var(--color-muted)]">
        Хүчингүй болсон төлбөрийн олгосон оролт нийт эрхэнд тооцогдохгүй. Асуулт байвал админд
        хандана уу.
      </p>
    </div>
  )
}
