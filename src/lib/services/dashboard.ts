import { and, asc, eq, sql } from 'drizzle-orm'
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
import { creditSummaryForMany } from './credits'

export async function dashboardData(params: { year: number; month: number }) {
  const today = todayInUb()

  const activeStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      groupName: trainingGroups.name,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(eq(students.status, 'active'))
    .orderBy(asc(students.fullName))

  const ids = activeStudents.map((s) => s.id)
  const credits = await creditSummaryForMany(db, ids)

  const paidRows = await db
    .select({ studentId: payments.studentId })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'valid'),
        eq(payments.coverageYear, params.year),
        eq(payments.coverageMonth, params.month),
      ),
    )
    .groupBy(payments.studentId)
  const paidSet = new Set(paidRows.map((r) => r.studentId))

  const todayPresentRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendance)
    .innerJoin(trainingSessions, eq(trainingSessions.id, attendance.sessionId))
    .where(and(eq(trainingSessions.date, today), eq(attendance.status, 'present')))

  const todaySessions = await db
    .select({
      id: trainingSessions.id,
      groupName: trainingGroups.name,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      status: trainingSessions.status,
      rosterCount: sql<number>`(
        select count(*)::int from ${sessionParticipants}
        where ${sessionParticipants.sessionId} = ${trainingSessions.id}
      )`,
      markedCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.sessionId} = ${trainingSessions.id}
      )`,
    })
    .from(trainingSessions)
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(eq(trainingSessions.date, today))
    .orderBy(asc(trainingSessions.startTime))

  const withCredits = activeStudents.map((student) => ({
    ...student,
    credits: credits.get(student.id) ?? { granted: 0, used: 0, remaining: 0 },
    paid: paidSet.has(student.id),
  }))

  const lowCredit = withCredits
    .filter((s) => s.credits.remaining <= 2)
    .sort((a, b) => a.credits.remaining - b.credits.remaining)

  return {
    today,
    metrics: {
      activeStudents: activeStudents.length,
      presentToday: Number(todayPresentRows[0]?.count ?? 0),
      unpaidThisMonth: withCredits.filter((s) => !s.paid).length,
      noCredits: withCredits.filter((s) => s.credits.remaining <= 0).length,
    },
    todaySessions,
    lowCredit: lowCredit.slice(0, 12),
  }
}
