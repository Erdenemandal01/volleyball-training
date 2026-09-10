import { ok, requireAdmin, route } from '@/lib/api'
import { getStudentDetail, resetParentCode } from '@/lib/services/students'
import { AppError } from '@/lib/errors'

type Params = { params: Promise<{ id: string }> }

export const POST = route(async (_request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const student = await getStudentDetail(id)
  if (!student.parentUserId) {
    throw new AppError('Энэ сурагчид холбогдсон эцэг эх байхгүй байна', { status: 409 })
  }
  const result = await resetParentCode({ parentUserId: student.parentUserId, actorId: admin.id })
  return ok(result)
})
