import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  attendanceHistory,
  sessionParticipants,
  students,
  trainingGroups,
  trainingSessions,
} from '@/db/schema'
import { AppError, conflict, notFound } from '@/lib/errors'
import { creditSummaryForMany } from './credits'
import { writeAudit } from './audit'

export type SessionListFilters = {
  from?: string
  to?: string
  groupId?: string
  status?: 'planned' | 'completed' | 'cancelled' | 'all'
}

export async function listSessions(filters: SessionListFilters) {
  const conditions = []
  if (filters.from) conditions.push(gte(trainingSessions.date, filters.from))
  if (filters.to) conditions.push(lte(trainingSessions.date, filters.to))
  if (filters.groupId) conditions.push(eq(trainingSessions.groupId, filters.groupId))
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(trainingSessions.status, filters.status))
  }

  return db
    .select({
      id: trainingSessions.id,
      groupId: trainingSessions.groupId,
      groupName: trainingGroups.name,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      note: trainingSessions.note,
      status: trainingSessions.status,
      rosterCount: sql<number>`(
        select count(*)::int from ${sessionParticipants}
        where ${sessionParticipants.sessionId} = ${trainingSessions.id}
      )`,
      markedCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.sessionId} = ${trainingSessions.id}
      )`,
      presentCount: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance.sessionId} = ${trainingSessions.id}
          and ${attendance.status} = 'present'
      )`,
      /** Ирцийн түүх үлдсэн бол устгахыг зөвшөөрөхгүй (түүх cascade-ээр арилна) */
      historyCount: sql<number>`(
        select count(*)::int from ${attendanceHistory}
        where ${attendanceHistory.sessionId} = ${trainingSessions.id}
      )`,
    })
    .from(trainingSessions)
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(trainingSessions.date), asc(trainingSessions.startTime))
}

export async function getSessionDetail(sessionId: string) {
  const rows = await db
    .select({
      id: trainingSessions.id,
      groupId: trainingSessions.groupId,
      groupName: trainingGroups.name,
      date: trainingSessions.date,
      startTime: trainingSessions.startTime,
      endTime: trainingSessions.endTime,
      location: trainingSessions.location,
      note: trainingSessions.note,
      status: trainingSessions.status,
      cancelReason: trainingSessions.cancelReason,
    })
    .from(trainingSessions)
    .innerJoin(trainingGroups, eq(trainingGroups.id, trainingSessions.groupId))
    .where(eq(trainingSessions.id, sessionId))
    .limit(1)

  const session = rows[0]
  if (!session) throw notFound('Бэлтгэл олдсонгүй')

  const roster = await db
    .select({
      studentId: students.id,
      fullName: students.fullName,
      studentStatus: students.status,
      status: attendance.status,
      creditConsumed: attendance.creditConsumed,
    })
    .from(sessionParticipants)
    .innerJoin(students, eq(students.id, sessionParticipants.studentId))
    .leftJoin(
      attendance,
      and(
        eq(attendance.sessionId, sessionParticipants.sessionId),
        eq(attendance.studentId, sessionParticipants.studentId),
      ),
    )
    .where(eq(sessionParticipants.sessionId, sessionId))
    .orderBy(asc(students.fullName))

  const credits = await creditSummaryForMany(
    db,
    roster.map((r) => r.studentId),
  )

  const historyRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendanceHistory)
    .where(eq(attendanceHistory.sessionId, sessionId))

  return {
    session,
    historyCount: Number(historyRows[0]?.count ?? 0),
    roster: roster.map((row) => ({
      ...row,
      credits: credits.get(row.studentId) ?? { granted: 0, used: 0, remaining: 0 },
    })),
  }
}

export type CreateSessionInput = {
  groupId: string
  date: string
  startTime: string
  endTime: string
  location: string
  note?: string | null
  actorId: string
}

export async function createTrainingSession(input: CreateSessionInput) {
  if (input.endTime <= input.startTime) {
    throw new AppError('Цаг буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { endTime: 'Дуусах цаг эхлэх цагаас хойш байх ёстой' },
    })
  }

  return db.transaction(async (tx) => {
    const group = await tx
      .select({ id: trainingGroups.id })
      .from(trainingGroups)
      .where(eq(trainingGroups.id, input.groupId))
      .limit(1)
    if (!group.length) throw notFound('Бүлэг олдсонгүй')

    const inserted = await tx
      .insert(trainingSessions)
      .values({
        groupId: input.groupId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location.trim(),
        note: input.note?.trim() || null,
        status: 'planned',
        createdBy: input.actorId,
      })
      .returning({ id: trainingSessions.id })
    const sessionId = inserted[0].id

    // Roster snapshot — идэвхтэй сурагчид. Дараа нь бүлэг солиход өөрчлөгдөхгүй.
    const members = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.currentGroupId, input.groupId), eq(students.status, 'active')))

    if (members.length) {
      await tx
        .insert(sessionParticipants)
        .values(members.map((m) => ({ sessionId, studentId: m.id })))
    }

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'session.create',
      entityType: 'training_session',
      entityId: sessionId,
      meta: { date: input.date, rosterCount: members.length },
    })

    return { id: sessionId, rosterCount: members.length }
  })
}

export async function updateTrainingSession(input: CreateSessionInput & { sessionId: string }) {
  if (input.endTime <= input.startTime) {
    throw new AppError('Цаг буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { endTime: 'Дуусах цаг эхлэх цагаас хойш байх ёстой' },
    })
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
    if (!rows.length) throw notFound('Бэлтгэл олдсонгүй')
    if (rows[0].status === 'cancelled') {
      throw conflict('Цуцлагдсан бэлтгэлийг засах боломжгүй')
    }

    const marked = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(attendance)
      .where(eq(attendance.sessionId, input.sessionId))

    // Ирц бүртгэсэн бол бүлгийг өөрчлөхийг хориглоно (roster хөндөгдөнө)
    if (Number(marked[0]?.count ?? 0) > 0 && rows[0].groupId !== input.groupId) {
      throw conflict('Ирц бүртгэсэн бэлтгэлийн бүлгийг өөрчлөх боломжгүй')
    }

    await tx
      .update(trainingSessions)
      .set({
        groupId: input.groupId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location.trim(),
        note: input.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(trainingSessions.id, input.sessionId))

    if (rows[0].groupId !== input.groupId) {
      await tx
        .delete(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, input.sessionId))
      const members = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.currentGroupId, input.groupId), eq(students.status, 'active')))
      if (members.length) {
        await tx
          .insert(sessionParticipants)
          .values(members.map((m) => ({ sessionId: input.sessionId, studentId: m.id })))
      }
    }

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'session.update',
      entityType: 'training_session',
      entityId: input.sessionId,
      meta: { date: input.date },
    })
  })
}

/** Планд байгаа бэлтгэлийн жагсаалтад шинэ идэвхтэй сурагчдыг нэмнэ (хасахгүй). */
export async function syncSessionRoster(input: { sessionId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
    if (!rows.length) throw notFound('Бэлтгэл олдсонгүй')
    const session = rows[0]
    if (session.status !== 'planned') {
      throw conflict('Зөвхөн төлөвлөсөн бэлтгэлийн жагсаалтыг шинэчилнэ')
    }

    const existing = await tx
      .select({ studentId: sessionParticipants.studentId })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, input.sessionId))
    const existingIds = new Set(existing.map((e) => e.studentId))

    const members = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.currentGroupId, session.groupId), eq(students.status, 'active')))

    const toAdd = members.filter((m) => !existingIds.has(m.id))
    if (toAdd.length) {
      await tx
        .insert(sessionParticipants)
        .values(toAdd.map((m) => ({ sessionId: input.sessionId, studentId: m.id })))
      await writeAudit(tx, {
        actorUserId: input.actorId,
        actorRole: 'admin',
        action: 'session.roster_sync',
        entityType: 'training_session',
        entityId: input.sessionId,
        meta: { added: toAdd.length },
      })
    }
    return { added: toAdd.length }
  })
}

export async function setSessionStatus(input: {
  sessionId: string
  status: 'planned' | 'completed'
  actorId: string
}) {
  // Цуцлалттай зэрэг ажиллавал цуцлагдсан бэлтгэлийг "дууссан" болгож
  // дарж бичихээс сэргийлж, нэг transaction дотор түгжээтэй шалгана.
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
      .for('update')
    if (!rows.length) throw notFound('Бэлтгэл олдсонгүй')
    if (rows[0].status === 'cancelled') {
      throw conflict('Цуцлагдсан бэлтгэлийн төлөв өөрчлөгдөхгүй')
    }

    await tx
      .update(trainingSessions)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(trainingSessions.id, input.sessionId))

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'session.status',
      entityType: 'training_session',
      entityId: input.sessionId,
      meta: { status: input.status },
    })
  })
}

/**
 * Бэлтгэл цуцлах. Ашигласан эрхийг нэг transaction дотор буцааж,
 * ирцийн түүхийг хадгална.
 */
export async function cancelTrainingSession(input: {
  sessionId: string
  reason: string
  actorId: string
}) {
  return db.transaction(async (tx) => {
    // Бэлтгэлийн мөрийг түгжинэ: зэрэгцээ хоёр цуцлалт, эсвэл цуцлахтай зэрэг
    // ирц бүртгэх оролдлого хоорондоо зөрчилдөхөөс сэргийлнэ.
    const rows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
      .for('update')
    if (!rows.length) throw notFound('Бэлтгэл олдсонгүй')
    if (rows[0].status === 'cancelled') throw conflict('Энэ бэлтгэл аль хэдийн цуцлагдсан')

    const marks = await tx
      .select()
      .from(attendance)
      .where(eq(attendance.sessionId, input.sessionId))

    const studentIds = marks.map((m) => m.studentId)
    if (studentIds.length) {
      // Эрхийн зөрчилгүй байлгахын тулд сурагчдын мөрийг түгжинэ
      await tx
        .select({ id: students.id })
        .from(students)
        .where(inArray(students.id, studentIds))
        .for('update')
    }

    let refunded = 0
    for (const mark of marks) {
      if (mark.creditConsumed) refunded += 1
      await tx.insert(attendanceHistory).values({
        sessionId: mark.sessionId,
        studentId: mark.studentId,
        fromStatus: mark.status,
        // Цуцлахад мөрүүд "excused" болдог — түүх нь бодит төлөвтэйгээ таарна
        toStatus: 'excused',
        creditDelta: mark.creditConsumed ? -1 : 0,
        reason: `Бэлтгэл цуцлагдсан: ${input.reason}`,
        changedBy: input.actorId,
      })
    }

    if (marks.length) {
      await tx
        .update(attendance)
        .set({ creditConsumed: false, status: 'excused', updatedAt: new Date() })
        .where(eq(attendance.sessionId, input.sessionId))
    }

    await tx
      .update(trainingSessions)
      .set({ status: 'cancelled', cancelReason: input.reason, updatedAt: new Date() })
      .where(eq(trainingSessions.id, input.sessionId))

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'session.cancel',
      entityType: 'training_session',
      entityId: input.sessionId,
      meta: { reason: input.reason, refundedCredits: refunded, affected: marks.length },
    })

    return { refunded, affected: marks.length }
  })
}

/**
 * Ирцийн ул мөр огт үлдээгээгүй бэлтгэлийг л устгана.
 * Ирц бүртгэсэн (эсвэл бүртгээд буцаасан) бэлтгэлийг цуцлах ёстой —
 * ингэснээр attendance_history дэх эрхийн түүх устахгүй.
 */
export async function deleteTrainingSession(input: { sessionId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    // Устгах гэж буй бэлтгэлийг түгжиж, зэрэгцээ ирц бүртгэхээс сэргийлнэ
    const sessionRows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
      .for('update')
    if (!sessionRows.length) throw notFound('Бэлтгэл олдсонгүй')
    const session = sessionRows[0]

    const marks = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(attendance)
      .where(eq(attendance.sessionId, input.sessionId))
    if (Number(marks[0]?.count ?? 0) > 0) {
      throw conflict('Ирц бүртгэсэн бэлтгэлийг устгах боломжгүй. Цуцлах үйлдлийг ашиглана уу.')
    }

    // attendance_history нь session устахад cascade-ээр арилдаг тул
    // устгахын өмнө audit_logs руу хуулж авна (audit нь cascade-д өртөхгүй).
    const history = await tx
      .select()
      .from(attendanceHistory)
      .where(eq(attendanceHistory.sessionId, input.sessionId))
      .orderBy(attendanceHistory.changedAt)

    const roster = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, input.sessionId))

    await tx
      .delete(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, input.sessionId))
    const deleted = await tx
      .delete(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .returning({ id: trainingSessions.id })
    if (!deleted.length) throw notFound('Бэлтгэл олдсонгүй')

    // Мөр нь устсан тул устгасан бэлтгэлийн мэдээллийг audit дотор үлдээнэ
    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'session.delete',
      entityType: 'training_session',
      entityId: input.sessionId,
      meta: {
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        groupId: session.groupId,
        location: session.location,
        status: session.status,
        rosterCount: Number(roster[0]?.count ?? 0),
        // Устсан ирцийн түүхийг хадгалж үлдээнэ
        attendanceHistoryCount: history.length,
        attendanceHistory: history.slice(0, 200).map((h) => ({
          studentId: h.studentId,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          creditDelta: h.creditDelta,
          reason: h.reason,
          changedBy: h.changedBy,
          changedAt: h.changedAt?.toISOString() ?? null,
        })),
      },
    })
  })
}
