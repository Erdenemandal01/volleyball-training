import { ok, requireAdmin, route } from '@/lib/api'
import { listConversationsForAdmin } from '@/lib/services/communication'

export const GET = route(async () => {
  await requireAdmin()
  return ok({ conversations: await listConversationsForAdmin() })
})
