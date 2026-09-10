import { ok, requireParent, route } from '@/lib/api'
import { markAnnouncementRead } from '@/lib/services/communication'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (_request, context: Params) => {
  const parent = await requireParent()
  const { id } = await context.params
  return ok(await markAnnouncementRead(parent.id, id))
})
