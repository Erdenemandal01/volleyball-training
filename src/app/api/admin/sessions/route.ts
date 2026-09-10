import { ok, parseBody, requireAdmin, route, searchParams } from '@/lib/api'
import { createTrainingSession, listSessions } from '@/lib/services/sessions'
import { sessionCreateSchema } from '@/lib/validation'

export const GET = route(async (request) => {
  await requireAdmin()
  const params = searchParams(request)
  const sessions = await listSessions({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    groupId: params.get('group') ?? undefined,
  })
  return ok({ sessions })
})

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, sessionCreateSchema)
  const result = await createTrainingSession({ ...body, actorId: admin.id })
  return ok(result, { status: 201 })
})
