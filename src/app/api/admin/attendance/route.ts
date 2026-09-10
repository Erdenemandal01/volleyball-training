import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { setAttendance } from '@/lib/services/credits'
import { attendanceSetSchema } from '@/lib/validation'

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, attendanceSetSchema)
  const result = await setAttendance({
    sessionId: body.sessionId,
    studentId: body.studentId,
    status: body.status,
    actorId: admin.id,
  })
  return ok(result)
})
