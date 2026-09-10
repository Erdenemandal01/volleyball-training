import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { cancelTrainingSession } from '@/lib/services/sessions'
import { sessionCancelSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, sessionCancelSchema)
  const result = await cancelTrainingSession({
    sessionId: id,
    reason: body.reason,
    actorId: admin.id,
  })
  return ok(result)
})
