import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { getPaymentDetail, updatePayment } from '@/lib/services/payments'
import { paymentUpdateSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const GET = route(async (_request, context: Params) => {
  await requireAdmin()
  const { id } = await context.params
  return ok({ payment: await getPaymentDetail(id) })
})

export const PATCH = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, paymentUpdateSchema)
  const result = await updatePayment({
    paymentId: id,
    paidAt: body.paidAt,
    coverageYear: body.coverageYear,
    coverageMonth: body.coverageMonth,
    amount: body.amount,
    creditsGranted: body.creditsGranted,
    note: body.note ?? null,
    reason: body.reason,
    actorId: admin.id,
  })
  return ok(result)
})
