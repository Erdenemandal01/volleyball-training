import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { voidPayment } from '@/lib/services/payments'
import { paymentVoidSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, paymentVoidSchema)
  return ok(await voidPayment({ paymentId: id, reason: body.reason, actorId: admin.id }))
})
