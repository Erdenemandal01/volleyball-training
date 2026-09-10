import Link from 'next/link'
import { Users } from 'lucide-react'
import { listStudents } from '@/lib/services/students'
import { listGroups } from '@/lib/services/groups'
import { parseMonthKey, formatDate, formatMonthIn, MONTH_NAMES } from '@/lib/date'
import { formatPhone } from '@/lib/phone'
import { Badge, Card, EmptyState } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { MonthPicker, Pagination, SearchFilter, SelectFilter } from '@/components/filters'
import { StudentDetailDrawer } from '@/components/admin/student-detail'
import { AddStudentButton } from '@/components/admin/student-form'
import { STUDENT_STATUS_LABEL } from '@/lib/labels'
import type { StudentStatus } from '@/db/schema'

export const dynamic = 'force-dynamic'

type Search = Promise<{
  q?: string
  group?: string
  status?: string
  month?: string
  page?: string
  filter?: string
  student?: string
}>

export default async function StudentsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month } = parseMonthKey(params.month)
  const groups = await listGroups()

  const result = await listStudents({
    search: params.q,
    groupId: params.group,
    status: (params.status as StudentStatus | 'all' | undefined) ?? undefined,
    year,
    month,
    page: Number(params.page ?? 1),
    unpaidOnly: params.filter === 'unpaid',
    noCreditsOnly: params.filter === 'no-credits',
  })

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'student') query.set(key, value)
  }
  const hrefFor = (id: string) => {
    const next = new URLSearchParams(query)
    next.set('student', id)
    return `/admin/students?${next.toString()}`
  }

  const activeFilterLabel =
    params.filter === 'unpaid'
      ? `${formatMonthIn(year, month)} төлбөр төлөөгүй`
      : params.filter === 'no-credits'
        ? 'Оролтын эрх дууссан'
        : null

  return (
    <>
      <PageHeader
        title="Сурагчид"
        description={`Сонгосон сар: ${year} оны ${MONTH_NAMES[month - 1]} · төлбөрийн төлөв энэ сарынх`}
        action={<AddStudentButton groups={groups.map((g) => ({ id: g.id, name: g.name }))} />}
        filters={
          <>
            <SearchFilter placeholder="Нэр, утсаар хайх" defaultValue={params.q ?? ''} />
            <SelectFilter
              label="Бүлэг"
              name="group"
              value={params.group ?? ''}
              allLabel="Бүх бүлэг"
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
            />
            <SelectFilter
              label="Төлөв"
              name="status"
              value={params.status ?? ''}
              allLabel="Бүх төлөв"
              options={[
                { value: 'active', label: 'Идэвхтэй' },
                { value: 'inactive', label: 'Идэвхгүй' },
              ]}
            />
            <MonthPicker year={year} month={month} />
          </>
        }
      />

      {activeFilterLabel && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--color-line)] bg-white px-3 py-2 text-sm">
          <span className="text-[var(--color-muted)]">Шүүлтүүр:</span>
          <Badge tone="info">{activeFilterLabel}</Badge>
          <Link
            href={`/admin/students?month=${year}-${String(month).padStart(2, '0')}`}
            className="text-[var(--color-primary)] hover:underline"
          >
            Цэвэрлэх
          </Link>
        </div>
      )}

      <Card>
        {result.rows.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="Сурагч олдсонгүй"
            description="Хайлт, шүүлтүүрээ өөрчилж үзнэ үү. Эсвэл шинэ сурагч нэмнэ үү."
          />
        ) : (
          <div className="vt-scroll-x">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-slate-50 text-left">
                  <th scope="col" className="px-4 py-3 font-medium text-[var(--color-muted)]">
                    Нэр
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-[var(--color-muted)]">
                    Бүлэг
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-[var(--color-muted)]">
                    Эцэг эхийн утас
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-[var(--color-muted)]">
                    {month} сарын төлбөр
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">
                    Нийт ирсэн
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">
                    Үлдсэн эрх
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-[var(--color-muted)]">
                    Үйлдэл
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-line)] last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link href={hrefFor(row.id)} className="block font-medium text-[var(--color-ink)] hover:text-[var(--color-primary)]">
                        {row.fullName}
                      </Link>
                      <span className="text-[13px] text-[var(--color-muted)]">
                        {STUDENT_STATUS_LABEL[row.status]} · Бүртгүүлсэн {formatDate(row.registeredAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-body)]">{row.groupName ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums text-[var(--color-body)]">
                      {formatPhone(row.parentPhone)}
                    </td>
                    <td className="px-4 py-3">
                      {row.paidForMonth ? (
                        <Badge tone="success">✓ Төлсөн</Badge>
                      ) : (
                        <Badge tone="danger">× Төлөөгүй</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.totalPresent}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          row.credits.remaining <= 0
                            ? 'font-semibold tabular-nums text-[var(--color-danger)]'
                            : row.credits.remaining <= 2
                              ? 'font-semibold tabular-nums text-[var(--color-warning)]'
                              : 'font-semibold tabular-nums text-[var(--color-ink)]'
                        }
                      >
                        {row.credits.remaining}
                      </span>
                      <span className="text-[13px] text-[var(--color-muted)]"> / {row.credits.granted}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={hrefFor(row.id)}
                        className="inline-flex min-h-9 items-center rounded-[10px] border border-[var(--color-line-strong)] px-3 text-sm hover:bg-slate-50"
                      >
                        Дэлгэрэнгүй
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-[var(--color-line)]">
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />
        </div>
      </Card>

      <StudentDetailDrawer groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
    </>
  )
}
