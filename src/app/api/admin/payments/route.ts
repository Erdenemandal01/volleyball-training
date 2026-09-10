import { ok, parseBody, requireAdmin, route, searchParams } from '@/lib/api'
import { createPayment, listPayments } from '@/lib/services/payments'
import { paymentCreateSchema } from '@/lib/validation'
import { parseMonthKey } from '@/lib/date'

export const GET = route(async (request) => {
  await requireAdmin()
  const params = searchParams(request)
  const all = params.get('all') === '1'
  const { year, month } = parseMonthKey(params.get('month'))
  const payments = await listPayments({
    year: all ? undefined : year,
    month: all ? undefined : month,
    search: params.get('q') ?? undefined,
    studentId: params.get('student') ?? undefined,
    status: 'all',
  })
  return ok({ payments })
})

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, paymentCreateSchema)
  const result = await createPayment({
    studentId: body.studentId,
    paidAt: body.paidAt,
    coverageYear: body.coverageYear,
    coverageMonth: body.coverageMonth,
    amount: body.amount,
    creditsGranted: body.creditsGranted,
    note: body.note ?? null,
    idempotencyKey: body.idempotencyKey ?? null,
    actorId: admin.id,
  })
  return ok(result, { status: result.duplicate ? 200 : 201 })
})
