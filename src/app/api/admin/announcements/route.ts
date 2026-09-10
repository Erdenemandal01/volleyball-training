import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { createAnnouncement, listAnnouncements } from '@/lib/services/communication'
import { announcementCreateSchema } from '@/lib/validation'

export const GET = route(async () => {
  await requireAdmin()
  return ok({ announcements: await listAnnouncements() })
})

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, announcementCreateSchema)
  const result = await createAnnouncement({
    title: body.title,
    body: body.body,
    audienceType: body.audienceType,
    groupId: body.groupId ?? null,
    studentId: body.studentId ?? null,
    actorId: admin.id,
  })
  return ok(result, { status: 201 })
})
