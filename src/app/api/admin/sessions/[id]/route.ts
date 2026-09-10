import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import {
  deleteTrainingSession,
  getSessionDetail,
  updateTrainingSession,
} from '@/lib/services/sessions'
import { sessionCreateSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const GET = route(async (_request, context: Params) => {
  await requireAdmin()
  const { id } = await context.params
  return ok(await getSessionDetail(id))
})

export const PATCH = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, sessionCreateSchema)
  await updateTrainingSession({ ...body, sessionId: id, actorId: admin.id })
  return ok({ ok: true })
})

export const DELETE = route(async (_request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  await deleteTrainingSession({ sessionId: id, actorId: admin.id })
  return ok({ ok: true })
})
