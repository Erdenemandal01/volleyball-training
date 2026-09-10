import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { createGroup, listGroups } from '@/lib/services/groups'
import { groupCreateSchema } from '@/lib/validation'

export const GET = route(async () => {
  await requireAdmin()
  return ok({ groups: await listGroups() })
})

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, groupCreateSchema)
  const result = await createGroup({
    name: body.name,
    description: body.description ?? null,
    actorId: admin.id,
  })
  return ok(result, { status: 201 })
})
