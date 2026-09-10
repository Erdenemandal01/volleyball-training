import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { listPayments } from '@/lib/services/payments'
import { listStudents } from '@/lib/services/students'
import { MONTH_NAMES, formatDate, parseMonthKey } from '@/lib/date'
import { formatMoney } from '@/lib/format'
import { Badge, Card, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { MonthPicker, SearchFilter, SelectFilter } from '@/components/filters'
import { AddPaymentButton, PaymentRowActions } from '@/components/admin/payment-actions'

export const dynamic = 'force-dynamic'

type Search = Promise<{ month?: string; q?: string; scope?: string }>

export default async function PaymentsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month } = parseMonthKey(params.month)
  const allMonths = params.scope === 'all'

  const [payments, studentList] = await Promise.all([
    listPayments({
      year: allMonths ? undefined : year,
      month: allMonths ? undefined : month,
      search: params.q,
      status: 'all',
    }),
    listStudents({ year, month, pageSize: 100, status: 'all' }),
  ])

  const students = studentList.rows.map((s) => ({ id: s.id, fullName: s.fullName }))
  const totalValid = payments
    .filter((p) => p.status === 'valid')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <>
      <PageHeader
        title="Төлбөр"
        description={
          allMonths
            ? `Бүх сар · ${payments.length} бүртгэл`
            : `${year} оны ${MONTH_NAMES[month - 1]} · ${payments.length} бүртгэл · нийт ${formatMoney(totalValid)}`
        }
        action={<AddPaymentButton students={students} />}
        filters={
          <>
            <SearchFilter placeholder="Сурагчийн нэрээр хайх" defaultValue={params.q ?? ''} />
            <MonthPicker year={year} month={month} />
            <SelectFilter
              label="Хамрах хугацаа"
              name="scope"
              value={params.scope ?? ''}
              allLabel="Сонгосон сар"
              options={[{ value: 'all', label: 'Бүх сар' }]}
            />
          </>
        }
      />

      <Card>
        {payments.length === 0 ? (
          <EmptyState
            icon={<Wallet size={28} />}
            title="Төлбөрийн бүртгэл алга"
            description={
              allMonths
                ? 'Хайлтад тохирох төлбөр олдсонгүй.'
                : 'Сонгосон сард бүртгэгдсэн төлбөр байхгүй байна.'
            }
          />
        ) : (
          <div className="vt-scroll-x">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-slate-50 text-left">
                  <th className="px-4 py-3 font-medium text-[var(--color-muted)]">Сурагч</th>
                  <th className="px-4 py-3 font-medium text-[var(--color-muted)]">Хамрах сар</th>
                  <th className="px-4 py-3 font-medium text-[var(--color-muted)]">Төлсөн огноо</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">Дүн</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">
                    Олгосон эрх
                  </th>
                  <th className="px-4 py-3 font-medium text-[var(--color-muted)]">Төлөв</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">
                    Үйлдэл
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-[var(--color-line)] last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students?student=${payment.studentId}`}
                        className="font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)]"
                      >
                        {payment.studentName}
                      </Link>
                      <span className="block text-[13px] text-[var(--color-muted)]">
                        {payment.groupName ?? 'Бүлэггүй'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {payment.coverageYear} оны {MONTH_NAMES[payment.coverageMonth - 1]}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{formatDate(payment.paidAt)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatMoney(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{payment.creditsGranted}</td>
                    <td className="px-4 py-3">
                      {payment.status === 'valid' ? (
                        <Badge tone="success">✓ Хүчинтэй</Badge>
                      ) : (
                        <div>
                          <Badge tone="danger">× Хүчингүй</Badge>
                          {payment.voidReason && (
                            <span className="mt-1 block text-[12px] text-[var(--color-muted)]">
                              {payment.voidReason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PaymentRowActions
                        payment={{
                          id: payment.id,
                          studentId: payment.studentId,
                          studentName: payment.studentName,
                          paidAt: payment.paidAt,
                          coverageYear: payment.coverageYear,
                          coverageMonth: payment.coverageMonth,
                          amount: payment.amount,
                          creditsGranted: payment.creditsGranted,
                          note: payment.note ?? '',
                          status: payment.status,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-[13px] text-[var(--color-muted)]">
        Нэг бүртгэл нь сонгосон сарын бүрэн төлөгдсөн багц. Нэг сард нэмэлт багц бүртгэж болно —
        олгосон эрх нь өмнөх үлдэгдэл дээр нэмэгдэнэ.
      </p>
    </>
  )
}
