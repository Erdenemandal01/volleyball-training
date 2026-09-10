import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  authSessions,
  conversations,
  groupMemberships,
  parentStudents,
  payments,
  sessionParticipants,
  studentStatusHistory,
  students,
  trainingGroups,
  trainingSessions,
  users,
  type StudentStatus,
} from '@/db/schema'
import { AppError, notFound } from '@/lib/errors'
import { normalizePhone } from '@/lib/phone'
import { generateTempCode, hashSecret } from '@/lib/password'
import { creditSummaryForMany, type CreditSummary } from './credits'
import { writeAudit } from './audit'
import { monthRange } from '@/lib/date'

export type StudentListFilters = {
  search?: string
  groupId?: string
  status?: StudentStatus | 'all'
  year: number
  month: number
  page?: number
  pageSize?: number
  /** Хяналтын самбарын шүүлтүүрүүд */
  unpaidOnly?: boolean
  noCreditsOnly?: boolean
}

export type StudentListRow = {
  id: string
  fullName: string
  status: StudentStatus
  groupId: string | null
  groupName: string | null
  parentPhone: string | null
  parentName: string | null
  registeredAt: string
  paidForMonth: boolean
  paidAt: string | null
  totalPresent: number
  credits: CreditSummary
}

/** Тухайн сард төлбөр төлсөн сурагчдын Map (сурагч → төлсөн огноо) */
export async function paidStudentsForMonth(year: number, month: number) {
  const rows = await db
    .select({ studentId: payments.studentId, paidAt: sql<string>`min(${payments.paidAt})` })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'valid'),
        eq(payments.coverageYear, year),
        eq(payments.coverageMonth, month),
      ),
    )
    .groupBy(payments.studentId)
  return new Map(rows.map((r) => [r.studentId, r.paidAt]))
}

export async function listStudents(filters: StudentListFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20))

  const conditions = []
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`
    conditions.push(or(ilike(students.fullName, term), ilike(users.phone, term)))
  }
  if (filters.groupId) conditions.push(eq(students.currentGroupId, filters.groupId))
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(students.status, filters.status))
  }

  const where = conditions.length ? and(...conditions) : undefined

  const baseRows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      registeredAt: students.registeredAt,
      groupId: students.currentGroupId,
      groupName: trainingGroups.name,
      parentPhone: users.phone,
      parentName: users.displayName,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .leftJoin(parentStudents, eq(parentStudents.studentId, students.id))
    .leftJoin(users, eq(users.id, parentStudents.parentUserId))
    .where(where)
    .orderBy(asc(students.fullName))

  const ids = baseRows.map((r) => r.id)
  const [credits, paidMap, presentMap] = await Promise.all([
    creditSummaryForMany(db, ids),
    paidStudentsForMonth(filters.year, filters.month),
    totalPresentForMany(ids),
  ])

  let rows: StudentListRow[] = baseRows.map((row) => ({
    ...row,
    paidForMonth: paidMap.has(row.id),
    paidAt: paidMap.get(row.id) ?? null,
    totalPresent: presentMap.get(row.id) ?? 0,
    credits: credits.get(row.id) ?? { granted: 0, used: 0, remaining: 0 },
  }))

  if (filters.unpaidOnly) rows = rows.filter((r) => !r.paidForMonth && r.status === 'active')
  if (filters.noCreditsOnly) {
    rows = rows.filter((r) => r.credits.remaining <= 0 && r.status === 'active')
  }

  const total = rows.length
  const start = (page - 1) * pageSize
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

async function totalPresentForMany(ids: string[]) {
  const map = new Map<string, number>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ studentId: attendance.studentId, count: sql<number>`count(*)::int` })
    .from(attendance)
    .where(and(inArray(attendance.studentId, ids), eq(attendance.status, 'present')))
    .groupBy(attendance.studentId)
  for (const row of rows) map.set(row.studentId, Number(row.count))
  return map
}

export async function getStudentDetail(studentId: string) {
  const rows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      registeredAt: students.registeredAt,
      adminNote: students.adminNote,
      groupId: students.currentGroupId,
      groupName: trainingGroups.name,
      parentUserId: users.id,
      parentPhone: users.phone,
      parentName: users.displayName,
      parentMustChange: users.mustChangePassword,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .leftJoin(parentStudents, eq(parentStudents.studentId, students.id))
    .leftJoin(users, eq(users.id, parentStudents.parentUserId))
    .where(eq(students.id, studentId))
    .limit(1)

  const student = rows[0]
  if (!student) throw notFound('Сурагч олдсонгүй')

  const credits = (await creditSummaryForMany(db, [studentId])).get(studentId)!
  const totalPresent = (await totalPresentForMany([studentId])).get(studentId) ?? 0
  return { ...student, credits, totalPresent }
}

export async function getStudentAttendanceHistory(
  studentId: string,
  opts: { year?: number; month?: number } = {},
) {
  const conditions = [eq(sessionParticipants.studentId, studentId)]
  if (opts.year && opts.month) {
    const { start, end } = monthRange(opts.year, opts.month)
    conditions.push(sql`${trainingSessions.date} between ${start} and ${end}`)
  }

  return db
    .select({
      sessionId: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      sessionStatus: trainingSessions.status,
      groupName: trainingGroups.name,
      status: attendance.status,
      creditConsumed: attendance.creditConsumed,
    })
    .from(sessionParticipants)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionParticipants.sessionId))
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .leftJoin(
      attendance,
      and(
        eq(attendance.sessionId, sessionParticipants.sessionId),
        eq(attendance.studentId, studentId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(trainingSessions.date), desc(trainingSessions.startTime))
}

export async function getStudentPayments(studentId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.studentId, studentId))
    .orderBy(desc(payments.coverageYear), desc(payments.coverageMonth), desc(payments.paidAt))
}

/* --------------------------- бүртгэх / засах --------------------------- */

export type CreateStudentInput = {
  fullName: string
  registeredAt: string
  groupId: string | null
  parentPhone: string
  parentName?: string | null
  adminNote?: string | null
  actorId: string
}

export type CreateStudentResult = {
  studentId: string
  parentUserId: string
  /** Шинэ Parent account үүссэн бол л буцна — админ өөрийн сувгаар дамжуулна. */
  temporaryCode: string | null
  parentExisted: boolean
}

export async function createStudent(input: CreateStudentInput): Promise<CreateStudentResult> {
  const phone = normalizePhone(input.parentPhone)
  if (!phone) {
    throw new AppError('Утасны дугаар буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { parentPhone: 'Монголын 8 оронтой дугаар оруулна уу' },
    })
  }

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.role, 'parent')))
      .limit(1)

    let parentUserId: string
    let temporaryCode: string | null = null
    const parentExisted = existing.length > 0

    if (parentExisted) {
      parentUserId = existing[0].id
      if (input.parentName?.trim() && existing[0].displayName !== input.parentName.trim()) {
        await tx
          .update(users)
          .set({ displayName: input.parentName.trim(), updatedAt: new Date() })
          .where(eq(users.id, parentUserId))
      }
    } else {
      temporaryCode = generateTempCode()
      const inserted = await tx
        .insert(users)
        .values({
          role: 'parent',
          phone,
          displayName: input.parentName?.trim() || `${input.fullName}-ийн эцэг эх`,
          passwordHash: await hashSecret(temporaryCode),
          mustChangePassword: true,
        })
        .returning({ id: users.id })
      parentUserId = inserted[0].id
    }

    const studentRows = await tx
      .insert(students)
      .values({
        fullName: input.fullName.trim(),
        registeredAt: input.registeredAt,
        currentGroupId: input.groupId,
        adminNote: input.adminNote?.trim() || null,
        status: 'active',
      })
      .returning({ id: students.id })
    const studentId = studentRows[0].id

    await tx.insert(parentStudents).values({ parentUserId, studentId })

    if (input.groupId) {
      await tx.insert(groupMemberships).values({ studentId, groupId: input.groupId })
    }

    await tx.insert(studentStatusHistory).values({
      studentId,
      status: 'active',
      reason: 'Шинээр бүртгэсэн',
      changedBy: input.actorId,
    })

    const conv = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.parentUserId, parentUserId))
      .limit(1)
    if (conv.length === 0) {
      await tx.insert(conversations).values({ parentUserId })
    }

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'student.create',
      entityType: 'student',
      entityId: studentId,
      meta: { fullName: input.fullName, parentExisted },
    })

    return { studentId, parentUserId, temporaryCode, parentExisted }
  })
}

export type UpdateStudentInput = {
  studentId: string
  fullName: string
  registeredAt: string
  groupId: string | null
  adminNote?: string | null
  parentPhone: string
  parentName?: string | null
  actorId: string
}

export async function updateStudent(input: UpdateStudentInput) {
  const phone = normalizePhone(input.parentPhone)
  if (!phone) {
    throw new AppError('Утасны дугаар буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { parentPhone: 'Монголын 8 оронтой дугаар оруулна уу' },
    })
  }

  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(students)
      .where(eq(students.id, input.studentId))
      .limit(1)
    if (current.length === 0) throw notFound('Сурагч олдсонгүй')
    const before = current[0]

    // Бүлэг өөрчлөгдвөл түүхийг хадгална (өмнөх roster хөндөгдөхгүй)
    if (before.currentGroupId !== input.groupId) {
      await tx
        .update(groupMemberships)
        .set({ endedAt: new Date() })
        .where(
          and(
            eq(groupMemberships.studentId, input.studentId),
            isNull(groupMemberships.endedAt),
          ),
        )
      if (input.groupId) {
        await tx
          .insert(groupMemberships)
          .values({ studentId: input.studentId, groupId: input.groupId })
      }
    }

    await tx
      .update(students)
      .set({
        fullName: input.fullName.trim(),
        registeredAt: input.registeredAt,
        currentGroupId: input.groupId,
        adminNote: input.adminNote?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(students.id, input.studentId))

    // Эцэг эхийн холбоос
    const link = await tx
      .select({ id: parentStudents.id, parentUserId: parentStudents.parentUserId })
      .from(parentStudents)
      .where(eq(parentStudents.studentId, input.studentId))
      .limit(1)

    const currentParent = link[0]
      ? (
          await tx.select().from(users).where(eq(users.id, link[0].parentUserId)).limit(1)
        )[0]
      : null

    let temporaryCode: string | null = null

    if (!currentParent || currentParent.phone !== phone) {
      const existing = await tx
        .select()
        .from(users)
        .where(and(eq(users.phone, phone), eq(users.role, 'parent')))
        .limit(1)

      let parentUserId: string
      if (existing.length > 0) {
        parentUserId = existing[0].id
      } else {
        temporaryCode = generateTempCode()
        const inserted = await tx
          .insert(users)
          .values({
            role: 'parent',
            phone,
            displayName: input.parentName?.trim() || `${input.fullName}-ийн эцэг эх`,
            passwordHash: await hashSecret(temporaryCode),
            mustChangePassword: true,
          })
          .returning({ id: users.id })
        parentUserId = inserted[0].id
        await tx.insert(conversations).values({ parentUserId })
      }

      if (link[0]) {
        await tx
          .update(parentStudents)
          .set({ parentUserId })
          .where(eq(parentStudents.id, link[0].id))
      } else {
        await tx.insert(parentStudents).values({ parentUserId, studentId: input.studentId })
      }
    } else if (input.parentName?.trim() && currentParent.displayName !== input.parentName.trim()) {
      await tx
        .update(users)
        .set({ displayName: input.parentName.trim(), updatedAt: new Date() })
        .where(eq(users.id, currentParent.id))
    }

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'student.update',
      entityType: 'student',
      entityId: input.studentId,
      meta: { groupChanged: before.currentGroupId !== input.groupId },
    })

    return { temporaryCode }
  })
}

export async function setStudentStatus(input: {
  studentId: string
  status: StudentStatus
  reason?: string | null
  actorId: string
}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(students)
      .where(eq(students.id, input.studentId))
      .limit(1)
    if (rows.length === 0) throw notFound('Сурагч олдсонгүй')

    await tx
      .update(students)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(students.id, input.studentId))

    await tx.insert(studentStatusHistory).values({
      studentId: input.studentId,
      status: input.status,
      reason: input.reason ?? null,
      changedBy: input.actorId,
    })

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: input.status === 'active' ? 'student.activate' : 'student.deactivate',
      entityType: 'student',
      entityId: input.studentId,
      meta: { reason: input.reason ?? null },
    })

    return { status: input.status }
  })
}

/** Эцэг эхийн нууц кодыг шинэчилж, бүх session-ийг хүчингүй болгоно. */
export async function resetParentCode(input: { parentUserId: string; actorId: string }) {
  const code = generateTempCode()
  const hash = await hashSecret(code)

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, input.parentUserId))
      .limit(1)
    if (rows.length === 0 || rows[0].role !== 'parent') throw notFound('Эцэг эх олдсонгүй')

    await tx
      .update(users)
      .set({
        passwordHash: hash,
        mustChangePassword: true,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.parentUserId))

    await tx.delete(authSessions).where(eq(authSessions.userId, input.parentUserId))

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'parent.reset_code',
      entityType: 'user',
      entityId: input.parentUserId,
      meta: { sessionsRevoked: true },
    })
  })

  return { temporaryCode: code }
}

/** Эцэг эхийн хүүхдүүд — ownership шалгалтад ашиглана. */
export async function studentsForParent(parentUserId: string) {
  return db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      registeredAt: students.registeredAt,
      groupId: students.currentGroupId,
      groupName: trainingGroups.name,
    })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.studentId))
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(eq(parentStudents.parentUserId, parentUserId))
    .orderBy(asc(students.fullName))
}

export async function assertParentOwnsStudent(parentUserId: string, studentId: string) {
  const rows = await db
    .select({ id: parentStudents.id })
    .from(parentStudents)
    .where(
      and(
        eq(parentStudents.parentUserId, parentUserId),
        eq(parentStudents.studentId, studentId),
      ),
    )
    .limit(1)
  if (rows.length === 0) throw notFound('Сурагч олдсонгүй')
}
