import { ok, requireAdmin, route, searchParams } from '@/lib/api'
import { previewAnnouncementRecipients } from '@/lib/services/communication'
import type { AnnouncementAudience } from '@/db/schema'

export const GET = route(async (request) => {
  await requireAdmin()
  const params = searchParams(request)
  const audienceType = (params.get('audienceType') ?? 'all') as AnnouncementAudience
  return ok(
    await previewAnnouncementRecipients({
      audienceType,
      groupId: params.get('groupId'),
      studentId: params.get('studentId'),
    }),
  )
})
