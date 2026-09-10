import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  payments,
  sessionParticipants,
  students,
  trainingGroups,
  trainingSessions,
  type AttendanceStatus,
} from '@/db/schema'
import { monthRange } from '@/lib/date'
import { creditSummaryForMany, type CreditSummary } from './credits'

export type MonthlyCell = AttendanceStatus | 'unmarked' | 'na'

export type MonthlyRow = {
  studentId: string
  fullName: string
  studentStatus: 'active' | 'inactive'
  groupName: string | null
  paid: boolean
  paidAt: string | null
  cells: MonthlyCell[]
  monthPresent: number
  credits: CreditSummary
}

export type MonthlyGrid = {
  sessions: {
    id: string
    date: string
    startTime: string
    endTime: string
    location: string
    groupName: string
    status: string
  }[]
  rows: MonthlyRow[]
}

/** Сарын ирцийн хүснэгт — багануудыг бодит бэлтгэлийн хуваариас үүсгэнэ. */
export async function monthlyAttendanceGrid(params: {
  year: number
  month: number
  groupId?: string
}): Promise<MonthlyGrid> {
  const { start, end } = monthRange(params.year, params.month)

  const sessionConditions = [
    sql`${trainingSessions.date} between ${start} and ${end}`,
    sql`${trainingSessions.status} <> 'cancelled'`,
  ]
  if (params.groupId) sessionConditions.push(eq(trainingSessions.groupId, params.groupId))

  const sessions = await db
    .select({
      id: trainingSessions.id,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      status: trainingSessions.status,
      groupName: trainingGroups.name,
    })
    .from(trainingSessions)
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(and(...sessionConditions))
    .orderBy(asc(trainingSessions.date), asc(trainingSessions.startTime))

  const sessionIds = sessions.map((s) => s.id)

  // Мөрүүд: тухайн сарын жагсаалтад орсон сурагчид + бүлгийн одоогийн идэвхтэй сурагчид
  const studentConditions = []
  if (params.groupId) studentConditions.push(eq(students.currentGroupId, params.groupId))
  const currentMembers = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      groupName: trainingGroups.name,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(
      studentConditions.length
        ? and(eq(students.status, 'active'), ...studentConditions)
        : eq(students.status, 'active'),
    )

  const rosterRows = sessionIds.length
    ? await db
        .select({
          sessionId: sessionParticipants.sessionId,
          studentId: sessionParticipants.studentId,
          fullName: students.fullName,
          status: students.status,
          groupName: trainingGroups.name,
        })
        .from(sessionParticipants)
        .innerJoin(students, eq(students.id, sessionParticipants.studentId))
        .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
        .where(inArray(sessionParticipants.sessionId, sessionIds))
    : []

  const studentMap = new Map<
    string,
    { id: string; fullName: string; status: 'active' | 'inactive'; groupName: string | null }
  >()
  for (const m of currentMembers) {
    studentMap.set(m.id, {
      id: m.id,
      fullName: m.fullName,
      status: m.status,
      groupName: m.groupName,
    })
  }
  for (const r of rosterRows) {
    if (!studentMap.has(r.studentId)) {
      studentMap.set(r.studentId, {
        id: r.studentId,
        fullName: r.fullName,
        status: r.status,
        groupName: r.groupName,
      })
    }
  }

  const rosterSet = new Set(rosterRows.map((r) => `${r.sessionId}:${r.studentId}`))

  const marks = sessionIds.length
    ? await db
        .select({
          sessionId: attendance.sessionId,
          studentId: attendance.studentId,
          status: attendance.status,
        })
        .from(attendance)
        .where(inArray(attendance.sessionId, sessionIds))
    : []
  const markMap = new Map(marks.map((m) => [`${m.sessionId}:${m.studentId}`, m.status]))

  const studentIds = [...studentMap.keys()]
  const credits = await creditSummaryForMany(db, studentIds)

  const paidRows = studentIds.length
    ? await db
        .select({
          studentId: payments.studentId,
          paidAt: sql<string>`min(${payments.paidAt})`,
        })
        .from(payments)
        .where(
          and(
            inArray(payments.studentId, studentIds),
            eq(payments.status, 'valid'),
            eq(payments.coverageYear, params.year),
            eq(payments.coverageMonth, params.month),
          ),
        )
        .groupBy(payments.studentId)
    : []
  const paidMap = new Map(paidRows.map((p) => [p.studentId, p.paidAt]))

  const rows: MonthlyRow[] = [...studentMap.values()]
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'mn'))
    .map((student) => {
      let monthPresent = 0
      const cells = sessions.map((session): MonthlyCell => {
        const key = `${session.id}:${student.id}`
        if (!rosterSet.has(key)) return 'na'
        const mark = markMap.get(key)
        if (!mark) return 'unmarked'
        if (mark === 'present') monthPresent += 1
        return mark
      })
      return {
        studentId: student.id,
        fullName: student.fullName,
        studentStatus: student.status,
        groupName: student.groupName,
        paid: paidMap.has(student.id),
        paidAt: paidMap.get(student.id) ?? null,
        cells,
        monthPresent,
        credits: credits.get(student.id) ?? { granted: 0, used: 0, remaining: 0 },
      }
    })

  return { sessions, rows }
}
