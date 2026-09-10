import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import { setStudentStatus } from '@/lib/services/students'
import { studentStatusSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, studentStatusSchema)
  const result = await setStudentStatus({
    studentId: id,
    status: body.status,
    reason: body.reason ?? null,
    actorId: admin.id,
  })
  return ok(result)
})
