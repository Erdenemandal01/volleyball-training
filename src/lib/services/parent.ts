import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  payments,
  sessionParticipants,
  students,
  trainingGroups,
  trainingSessions,
} from '@/db/schema'
import { todayInUb } from '@/lib/date'
import { creditSummaryFor } from './credits'
import { assertParentOwnsStudent } from './students'

/** Эцэг эхийн нүүр хуудасны бүх мэдээлэл — ownership заавал шалгагдана. */
export async function parentStudentOverview(params: {
  parentUserId: string
  studentId: string
  year: number
  month: number
}) {
  await assertParentOwnsStudent(params.parentUserId, params.studentId)

  const studentRows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      registeredAt: students.registeredAt,
      groupName: trainingGroups.name,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(eq(students.id, params.studentId))
    .limit(1)
  const student = studentRows[0]

  const credits = await creditSummaryFor(db, params.studentId)

  const monthPayments = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.studentId, params.studentId),
        eq(payments.status, 'valid'),
        eq(payments.coverageYear, params.year),
        eq(payments.coverageMonth, params.month),
      ),
    )
    .orderBy(asc(payments.paidAt))

  const today = todayInUb()

  const nextSessions = await db
    .select({
      id: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      status: trainingSessions.status,
      groupName: trainingGroups.name,
    })
    .from(sessionParticipants)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionParticipants.sessionId))
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(
      and(
        eq(sessionParticipants.studentId, params.studentId),
        gte(trainingSessions.date, today),
        sql`${trainingSessions.status} <> 'cancelled'`,
      ),
    )
    .orderBy(asc(trainingSessions.date), asc(trainingSessions.startTime))
    .limit(5)

  const recentAttendance = await db
    .select({
      sessionId: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      location: trainingSessions.location,
      groupName: trainingGroups.name,
      status: attendance.status,
      sessionStatus: trainingSessions.status,
    })
    .from(sessionParticipants)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionParticipants.sessionId))
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .leftJoin(
      attendance,
      and(
        eq(attendance.sessionId, sessionParticipants.sessionId),
        eq(attendance.studentId, params.studentId),
      ),
    )
    .where(
      and(
        eq(sessionParticipants.studentId, params.studentId),
        sql`${trainingSessions.date} <= ${today}`,
      ),
    )
    .orderBy(desc(trainingSessions.date), desc(trainingSessions.startTime))
    .limit(6)

  const totalPresentRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendance)
    .where(and(eq(attendance.studentId, params.studentId), eq(attendance.status, 'present')))

  return {
    student,
    credits,
    totalPresent: Number(totalPresentRows[0]?.count ?? 0),
    monthPayments,
    paidThisMonth: monthPayments.length > 0,
    registeredBeforeMonth:
      student.registeredAt.slice(0, 7) <=
      `${params.year}-${String(params.month).padStart(2, '0')}`,
    nextSessions,
    recentAttendance,
  }
}

export async function parentAttendanceHistory(params: {
  parentUserId: string
  studentId: string
  year?: number
  month?: number
}) {
  await assertParentOwnsStudent(params.parentUserId, params.studentId)

  const conditions = [eq(sessionParticipants.studentId, params.studentId)]
  if (params.year && params.month) {
    const prefix = `${params.year}-${String(params.month).padStart(2, '0')}`
    conditions.push(sql`to_char(${trainingSessions.date}, 'YYYY-MM') = ${prefix}`)
  }

  return db
    .select({
      sessionId: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      groupName: trainingGroups.name,
      sessionStatus: trainingSessions.status,
      status: attendance.status,
    })
    .from(sessionParticipants)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionParticipants.sessionId))
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .leftJoin(
      attendance,
      and(
        eq(attendance.sessionId, sessionParticipants.sessionId),
        eq(attendance.studentId, params.studentId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(trainingSessions.date), desc(trainingSessions.startTime))
}

export async function parentPaymentHistory(params: {
  parentUserId: string
  studentId: string
}) {
  await assertParentOwnsStudent(params.parentUserId, params.studentId)
  return db
    .select({
      id: payments.id,
      paidAt: payments.paidAt,
      coverageYear: payments.coverageYear,
      coverageMonth: payments.coverageMonth,
      amount: payments.amount,
      creditsGranted: payments.creditsGranted,
      status: payments.status,
      note: payments.note,
    })
    .from(payments)
    .where(eq(payments.studentId, params.studentId))
    .orderBy(desc(payments.coverageYear), desc(payments.coverageMonth), desc(payments.paidAt))
}

export async function parentUpcomingSessions(params: {
  parentUserId: string
  studentId: string
}) {
  await assertParentOwnsStudent(params.parentUserId, params.studentId)
  const today = todayInUb()
  return db
    .select({
      id: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      note: trainingSessions.note,
      status: trainingSessions.status,
      groupName: trainingGroups.name,
    })
    .from(sessionParticipants)
    .innerJoin(trainingSessions, eq(trainingSessions.id, sessionParticipants.sessionId))
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(
      and(
        eq(sessionParticipants.studentId, params.studentId),
        gte(trainingSessions.date, today),
      ),
    )
    .orderBy(asc(trainingSessions.date), asc(trainingSessions.startTime))
    .limit(30)
}
