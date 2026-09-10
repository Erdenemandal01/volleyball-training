import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '@/db'
import { payments, students, trainingGroups } from '@/db/schema'
import { AppError, conflict, notFound } from '@/lib/errors'
import { monthRange } from '@/lib/date'
import { creditSummaryFor } from './credits'
import { writeAudit } from './audit'

export const DEFAULT_CREDITS = 12

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

export type PaymentListFilters = {
  year?: number
  month?: number
  search?: string
  studentId?: string
  status?: 'valid' | 'void' | 'all'
}

export async function listPayments(filters: PaymentListFilters) {
  const conditions = []
  if (filters.year) conditions.push(eq(payments.coverageYear, filters.year))
  if (filters.month) conditions.push(eq(payments.coverageMonth, filters.month))
  if (filters.studentId) conditions.push(eq(payments.studentId, filters.studentId))
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(payments.status, filters.status))
  }
  if (filters.search?.trim()) {
    conditions.push(ilike(students.fullName, `%${filters.search.trim()}%`))
  }

  return db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      studentName: students.fullName,
      groupName: trainingGroups.name,
      paidAt: payments.paidAt,
      coverageYear: payments.coverageYear,
      coverageMonth: payments.coverageMonth,
      amount: payments.amount,
      creditsGranted: payments.creditsGranted,
      note: payments.note,
      status: payments.status,
      voidReason: payments.voidReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(payments.paidAt), asc(students.fullName))
}

export type CreatePaymentInput = {
  studentId: string
  paidAt: string
  coverageYear: number
  coverageMonth: number
  amount: number
  creditsGranted: number
  note?: string | null
  idempotencyKey?: string | null
  actorId: string
}

export async function createPayment(input: CreatePaymentInput) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new AppError('Дүн буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { amount: 'Эерэг бүхэл тоо оруулна уу' },
    })
  }
  if (!Number.isInteger(input.creditsGranted) || input.creditsGranted <= 0) {
    throw new AppError('Оролтын тоо буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { creditsGranted: 'Эерэг бүхэл тоо оруулна уу' },
    })
  }

  // Давхар submit — ижил түлхүүртэй хүсэлт нэг л төлбөр үүсгэнэ
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (existing.length) return { payment: existing[0], duplicate: true }
  }

  try {
    return await db.transaction(async (tx) => {
      const student = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, input.studentId))
        .for('update')
      if (!student.length) throw notFound('Сурагч олдсонгүй')

      const rows = await tx
        .insert(payments)
        .values({
          studentId: input.studentId,
          paidAt: input.paidAt,
          coverageYear: input.coverageYear,
          coverageMonth: input.coverageMonth,
          amount: input.amount,
          creditsGranted: input.creditsGranted,
          note: input.note?.trim() || null,
          idempotencyKey: input.idempotencyKey ?? null,
          createdBy: input.actorId,
        })
        .returning()

      await writeAudit(tx, {
        actorUserId: input.actorId,
        actorRole: 'admin',
        action: 'payment.create',
        entityType: 'payment',
        entityId: rows[0].id,
        meta: {
          studentId: input.studentId,
          amount: input.amount,
          creditsGranted: input.creditsGranted,
          coverage: `${input.coverageYear}-${input.coverageMonth}`,
        },
      })

      return { payment: rows[0], duplicate: false }
    })
  } catch (error) {
    if (isUniqueViolation(error) && input.idempotencyKey) {
      const existing = await db
        .select()
        .from(payments)
        .where(eq(payments.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (existing.length) return { payment: existing[0], duplicate: true }
    }
    throw error
  }
}

export type UpdatePaymentInput = {
  paymentId: string
  paidAt: string
  coverageYear: number
  coverageMonth: number
  amount: number
  creditsGranted: number
  note?: string | null
  reason: string
  actorId: string
}

export async function updatePayment(input: UpdatePaymentInput) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1)
    if (!rows.length) throw notFound('Төлбөр олдсонгүй')
    const before = rows[0]
    if (before.status === 'void') throw conflict('Хүчингүй болгосон төлбөрийг засах боломжгүй')

    await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, before.studentId))
      .for('update')

    const summary = await creditSummaryFor(tx, before.studentId)
    const nextGranted = summary.granted - before.creditsGranted + input.creditsGranted
    if (nextGranted < summary.used) {
      throw conflict(
        `Ашигласан эрх ${summary.used} байгаа тул нийт олгосон эрхийг ${nextGranted} болгож бууруулах боломжгүй.`,
      )
    }

    await tx
      .update(payments)
      .set({
        paidAt: input.paidAt,
        coverageYear: input.coverageYear,
        coverageMonth: input.coverageMonth,
        amount: input.amount,
        creditsGranted: input.creditsGranted,
        note: input.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, input.paymentId))

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'payment.update',
      entityType: 'payment',
      entityId: input.paymentId,
      meta: {
        reason: input.reason,
        before: {
          amount: before.amount,
          creditsGranted: before.creditsGranted,
          coverage: `${before.coverageYear}-${before.coverageMonth}`,
        },
        after: {
          amount: input.amount,
          creditsGranted: input.creditsGranted,
          coverage: `${input.coverageYear}-${input.coverageMonth}`,
        },
      },
    })

    return { creditsAfter: nextGranted }
  })
}

export async function voidPayment(input: {
  paymentId: string
  reason: string
  actorId: string
}) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1)
    if (!rows.length) throw notFound('Төлбөр олдсонгүй')
    const payment = rows[0]
    if (payment.status === 'void') throw conflict('Энэ төлбөр аль хэдийн хүчингүй болсон')

    await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, payment.studentId))
      .for('update')

    const summary = await creditSummaryFor(tx, payment.studentId)
    const nextGranted = summary.granted - payment.creditsGranted
    if (nextGranted < summary.used) {
      throw conflict(
        `Ашигласан эрх ${summary.used} байгаа тул энэ төлбөрийг хүчингүй болгох боломжгүй. Эхлээд холбогдох ирцийг засна уу.`,
      )
    }

    await tx
      .update(payments)
      .set({
        status: 'void',
        voidReason: input.reason,
        voidedAt: new Date(),
        voidedBy: input.actorId,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, input.paymentId))

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'payment.void',
      entityType: 'payment',
      entityId: input.paymentId,
      meta: { reason: input.reason, creditsRemoved: payment.creditsGranted },
    })

    return { creditsAfter: nextGranted }
  })
}

export async function getPaymentDetail(paymentId: string) {
  const rows = await db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      studentName: students.fullName,
      paidAt: payments.paidAt,
      coverageYear: payments.coverageYear,
      coverageMonth: payments.coverageMonth,
      amount: payments.amount,
      creditsGranted: payments.creditsGranted,
      note: payments.note,
      status: payments.status,
      voidReason: payments.voidReason,
      voidedAt: payments.voidedAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .where(eq(payments.id, paymentId))
    .limit(1)
  if (!rows.length) throw notFound('Төлбөр олдсонгүй')
  return rows[0]
}

/** Сарын төлбөрийн тайланд тухайн сард идэвхтэй байсан сурагчид хамрагдана. */
export async function monthlyPaymentReport(year: number, month: number, groupId?: string) {
  const { end: monthEnd } = monthRange(year, month)

  const conditions = [sql`${students.registeredAt} <= ${monthEnd}`]
  if (groupId) conditions.push(eq(students.currentGroupId, groupId))

  const rows = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      registeredAt: students.registeredAt,
      groupName: trainingGroups.name,
      paidAt: sql<string | null>`(
        select min(${payments.paidAt}) from ${payments}
        where ${payments.studentId} = ${students.id}
          and ${payments.status} = 'valid'
          and ${payments.coverageYear} = ${year}
          and ${payments.coverageMonth} = ${month}
      )`,
      totalPaid: sql<number>`(
        select coalesce(sum(${payments.amount}), 0)::int from ${payments}
        where ${payments.studentId} = ${students.id}
          and ${payments.status} = 'valid'
          and ${payments.coverageYear} = ${year}
          and ${payments.coverageMonth} = ${month}
      )`,
    })
    .from(students)
    .leftJoin(trainingGroups, eq(trainingGroups.id, students.currentGroupId))
    .where(and(...conditions))
    .orderBy(asc(students.fullName))

  return rows.map((row) => ({
    ...row,
    paid: row.paidAt !== null,
  }))
}
