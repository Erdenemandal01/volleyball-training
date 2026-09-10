import { ok, parseBody, requireAdmin, route, searchParams } from '@/lib/api'
import { createStudent, listStudents } from '@/lib/services/students'
import { studentCreateSchema } from '@/lib/validation'
import { parseMonthKey } from '@/lib/date'
import type { StudentStatus } from '@/db/schema'

export const GET = route(async (request) => {
  await requireAdmin()
  const params = searchParams(request)
  const { year, month } = parseMonthKey(params.get('month'))
  const filter = params.get('filter')

  const result = await listStudents({
    search: params.get('q') ?? undefined,
    groupId: params.get('group') ?? undefined,
    status: (params.get('status') as StudentStatus | 'all' | null) ?? undefined,
    year,
    month,
    page: Number(params.get('page') ?? 1),
    unpaidOnly: filter === 'unpaid',
    noCreditsOnly: filter === 'no-credits',
  })
  return ok(result)
})

export const POST = route(async (request) => {
  const admin = await requireAdmin()
  const body = await parseBody(request, studentCreateSchema)
  const result = await createStudent({
    fullName: body.fullName,
    registeredAt: body.registeredAt,
    groupId: body.groupId ?? null,
    parentPhone: body.parentPhone,
    parentName: body.parentName ?? null,
    adminNote: body.adminNote ?? null,
    actorId: admin.id,
  })
  return ok(result, { status: 201 })
})
