import { ok, requireAdmin, route } from '@/lib/api'
import { syncSessionRoster } from '@/lib/services/sessions'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (_request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  return ok(await syncSessionRoster({ sessionId: id, actorId: admin.id }))
})
