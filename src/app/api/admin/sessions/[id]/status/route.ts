import { z } from 'zod'
import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { setSessionStatus } from '@/lib/services/sessions'

type Params = { params: Promise<{ id: string }> }

const schema = z.object({ status: z.enum(['planned', 'completed']) })

export const POST = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, schema)
  await setSessionStatus({ sessionId: id, status: body.status, actorId: admin.id })
  return ok({ ok: true })
})
