import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  attendanceHistory,
  payments,
  sessionParticipants,
  students,
  trainingSessions,
  type AttendanceStatus,
} from '@/db/schema'
import { AppError, conflict, notFound } from '@/lib/errors'
import { todayInUb } from '@/lib/date'
import { writeAudit } from './audit'
import type { DbClient, Tx } from './types'

export type CreditSummary = {
  granted: number
  used: number
  remaining: number
}

export const EMPTY_SUMMARY: CreditSummary = { granted: 0, used: 0, remaining: 0 }

/** Нэг сурагчийн эрхийн тооцоо. Эх сурвалж: хүчинтэй төлбөр ба ашигласан ирц. */
export async function creditSummaryFor(
  client: DbClient,
  studentId: string,
): Promise<CreditSummary> {
  const map = await creditSummaryForMany(client, [studentId])
  return map.get(studentId) ?? { ...EMPTY_SUMMARY }
}

export async function creditSummaryForMany(
  client: DbClient,
  studentIds: string[],
): Promise<Map<string, CreditSummary>> {
  const result = new Map<string, CreditSummary>()
  if (studentIds.length === 0) return result
  for (const id of studentIds) result.set(id, { ...EMPTY_SUMMARY })

  const granted = await client
    .select({
      studentId: payments.studentId,
      total: sql<number>`coalesce(sum(${payments.creditsGranted}), 0)::int`,
    })
    .from(payments)
    .where(and(inArray(payments.studentId, studentIds), eq(payments.status, 'valid')))
    .groupBy(payments.studentId)

  for (const row of granted) {
    const entry = result.get(row.studentId)!
    entry.granted = Number(row.total)
  }

  const used = await client
    .select({
      studentId: attendance.studentId,
      total: sql<number>`count(*)::int`,
    })
    .from(attendance)
    .where(
      and(inArray(attendance.studentId, studentIds), eq(attendance.creditConsumed, true)),
    )
    .groupBy(attendance.studentId)

  for (const row of used) {
    const entry = result.get(row.studentId)!
    entry.used = Number(row.total)
  }

  for (const entry of result.values()) {
    entry.remaining = entry.granted - entry.used
  }
  return result
}

/** Мөрийн түгжээ — зэрэгцээ хүсэлт эрхийг давхар ашиглахаас сэргийлнэ. */
async function lockStudent(tx: Tx, studentId: string) {
  const rows = await tx
    .select({ id: students.id, status: students.status, fullName: students.fullName })
    .from(students)
    .where(eq(students.id, studentId))
    .for('update')
  const row = rows[0]
  if (!row) throw notFound('Сурагч олдсонгүй')
  return row
}

export type SetAttendanceInput = {
  sessionId: string
  studentId: string
  /** null = "Бүртгээгүй" рүү буцаах */
  status: AttendanceStatus | null
  actorId: string
  reason?: string
}

export type SetAttendanceResult = {
  status: AttendanceStatus | null
  summary: CreditSummary
  changed: boolean
}

/**
 * Ирцийн төлөв тавих. Нэг transaction дотор эрхийг зөв ашиглах/буцаах ба
 * түүхийг хадгална. Ижил төлөв дахин тавихад эрх дахин хасагдахгүй (idempotent).
 */
export async function setAttendance(
  input: SetAttendanceInput,
): Promise<SetAttendanceResult> {
  return db.transaction(async (tx) => {
    // ТҮГЖЭЭНИЙ ДАРААЛАЛ: эхлээд бэлтгэл, дараа нь сурагч.
    // cancelTrainingSession мөн ижил дараалал баримталдаг — deadlock үүсэхгүй.
    const sessionRows = await tx
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.id, input.sessionId))
      .limit(1)
      .for('update')
    const session = sessionRows[0]
    if (!session) throw notFound('Бэлтгэл олдсонгүй')

    if (session.status === 'cancelled') {
      throw conflict('Цуцлагдсан бэлтгэлд ирц бүртгэх боломжгүй')
    }

    await lockStudent(tx, input.studentId)

    const roster = await tx
      .select({ id: sessionParticipants.id })
      .from(sessionParticipants)
      .where(
        and(
          eq(sessionParticipants.sessionId, input.sessionId),
          eq(sessionParticipants.studentId, input.studentId),
        ),
      )
      .limit(1)
    if (roster.length === 0) {
      throw conflict('Энэ сурагч тухайн бэлтгэлийн жагсаалтад байхгүй байна')
    }

    if (input.status === 'present' && session.date > todayInUb()) {
      throw conflict('Болоогүй бэлтгэлд “Ирсэн” гэж бүртгэх боломжгүй')
    }

    const existingRows = await tx
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.sessionId, input.sessionId),
          eq(attendance.studentId, input.studentId),
        ),
      )
      .limit(1)
    const existing = existingRows[0] ?? null

    const currentStatus = existing?.status ?? null
    const currentConsumed = existing?.creditConsumed ?? false
    const nextConsumed = input.status === 'present'

    if (currentStatus === input.status) {
      // Давхар товшилт / retry — өөрчлөлтгүй
      return {
        status: currentStatus,
        summary: await creditSummaryFor(tx, input.studentId),
        changed: false,
      }
    }

    if (nextConsumed && !currentConsumed) {
      const summary = await creditSummaryFor(tx, input.studentId)
      if (summary.remaining <= 0) {
        throw new AppError(
          'Оролтын эрх дууссан тул “Ирсэн” гэж бүртгэх боломжгүй. Эхлээд төлбөр бүртгэнэ үү.',
          { status: 409, code: 'no_credits' },
        )
      }
    }

    const creditDelta = (nextConsumed ? 1 : 0) - (currentConsumed ? 1 : 0)

    if (input.status === null) {
      if (existing) {
        await tx.delete(attendance).where(eq(attendance.id, existing.id))
      }
    } else if (existing) {
      await tx
        .update(attendance)
        .set({
          status: input.status,
          creditConsumed: nextConsumed,
          markedBy: input.actorId,
          updatedAt: new Date(),
        })
        .where(eq(attendance.id, existing.id))
    } else {
      await tx.insert(attendance).values({
        sessionId: input.sessionId,
        studentId: input.studentId,
        status: input.status,
        creditConsumed: nextConsumed,
        markedBy: input.actorId,
      })
    }

    await tx.insert(attendanceHistory).values({
      sessionId: input.sessionId,
      studentId: input.studentId,
      fromStatus: currentStatus,
      toStatus: input.status,
      creditDelta,
      reason: input.reason ?? null,
      changedBy: input.actorId,
    })

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'attendance.set',
      entityType: 'attendance',
      entityId: `${input.sessionId}:${input.studentId}`,
      meta: { from: currentStatus, to: input.status, creditDelta },
    })

    return {
      status: input.status,
      summary: await creditSummaryFor(tx, input.studentId),
      changed: true,
    }
  })
}
