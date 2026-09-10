import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { updateGroup } from '@/lib/services/groups'
import { groupUpdateSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const PATCH = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, groupUpdateSchema)
  await updateGroup({
    groupId: id,
    name: body.name,
    description: body.description ?? null,
    isActive: body.isActive ?? true,
    actorId: admin.id,
  })
  return ok({ ok: true })
})
