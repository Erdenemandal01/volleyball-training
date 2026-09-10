import { ok, parseBody, requireAdmin, route, searchParams } from '@/lib/api'
import {
  getStudentAttendanceHistory,
  getStudentDetail,
  getStudentPayments,
  updateStudent,
} from '@/lib/services/students'
import { studentUpdateSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

export const GET = route(async (request, context: Params) => {
  await requireAdmin()
  const { id } = await context.params
  const params = searchParams(request)

  const [student, attendanceHistory, payments] = await Promise.all([
    getStudentDetail(id),
    getStudentAttendanceHistory(id, {
      year: params.get('year') ? Number(params.get('year')) : undefined,
      month: params.get('month') ? Number(params.get('month')) : undefined,
    }),
    getStudentPayments(id),
  ])

  return ok({ student, attendanceHistory, payments })
})

export const PATCH = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  const body = await parseBody(request, studentUpdateSchema)

  const result = await updateStudent({
    studentId: id,
    fullName: body.fullName,
    registeredAt: body.registeredAt,
    groupId: body.groupId ?? null,
    adminNote: body.adminNote ?? null,
    parentPhone: body.parentPhone,
    parentName: body.parentName ?? null,
    actorId: admin.id,
  })
  return ok(result)
})
