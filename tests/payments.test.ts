import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { payments } from '@/db/schema'
import { createPayment, updatePayment, voidPayment, monthlyPaymentReport } from '@/lib/services/payments'
import { creditSummaryFor, setAttendance } from '@/lib/services/credits'
import { addDays, todayInUb } from '@/lib/date'
import { makeAdmin, makeGroup, makeSession, makeStudent, setupDb } from './helpers'

let adminId: string
let groupId: string
let studentId: string
const today = todayInUb()
const year = Number(today.slice(0, 4))
const month = Number(today.slice(5, 7))

beforeEach(async () => {
  await setupDb()
  adminId = await makeAdmin()
  groupId = await makeGroup()
  studentId = await makeStudent({ name: 'Төлбөрийн тест', groupId, registeredAt: addDays(today, -40) })
})

const basePayment = () => ({
  studentId,
  paidAt: today,
  coverageYear: year,
  coverageMonth: month,
  amount: 120_000,
  creditsGranted: 12,
  actorId: adminId,
})

describe('Төлбөр', () => {
  it('№8: ижил idempotency түлхүүртэй давхар submit нэг л төлбөр үүсгэнэ', async () => {
    const key = 'idem-key-12345678'
    const first = await createPayment({ ...basePayment(), idempotencyKey: key })
    const second = await createPayment({ ...basePayment(), idempotencyKey: key })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.payment.id).toBe(first.payment.id)

    const rows = await db.select().from(payments).where(eq(payments.studentId, studentId))
    expect(rows).toHaveLength(1)
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ granted: 12 })
  })

  it('№8: зэрэгцээ давхар submit ч нэг төлбөр үүсгэнэ', async () => {
    const key = 'idem-parallel-123456'
    const results = await Promise.allSettled([
      createPayment({ ...basePayment(), idempotencyKey: key }),
      createPayment({ ...basePayment(), idempotencyKey: key }),
    ])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    const rows = await db.select().from(payments).where(eq(payments.studentId, studentId))
    expect(rows).toHaveLength(1)
  })

  it('№9: ашигласан эрхээс бага болгох засварыг хориглоно', async () => {
    const created = await createPayment({ ...basePayment(), idempotencyKey: 'p-edit-1234567' })

    for (let i = 5; i > 0; i--) {
      const sessionId = await makeSession({
        groupId,
        date: addDays(today, -i),
        roster: [studentId],
      })
      await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    }
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 5, remaining: 7 })

    await expect(
      updatePayment({
        paymentId: created.payment.id,
        paidAt: today,
        coverageYear: year,
        coverageMonth: month,
        amount: 60_000,
        creditsGranted: 4,
        reason: 'Буруу бүртгэсэн',
        actorId: adminId,
      }),
    ).rejects.toThrow(/бууруулах боломжгүй/)

    // 5 болгож бууруулах нь зөвшөөрөгдөнө (ашигласантай тэнцүү)
    const okResult = await updatePayment({
      paymentId: created.payment.id,
      paidAt: today,
      coverageYear: year,
      coverageMonth: month,
      amount: 60_000,
      creditsGranted: 5,
      reason: 'Буруу бүртгэсэн',
      actorId: adminId,
    })
    expect(okResult.creditsAfter).toBe(5)
    expect(await creditSummaryFor(db, studentId)).toEqual({ granted: 5, used: 5, remaining: 0 })
  })

  it('Хүчингүй болгоход эрх хасагдана, ашигласнаас бага бол хориглоно', async () => {
    const created = await createPayment({ ...basePayment(), idempotencyKey: 'p-void-1234567' })
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })

    await expect(
      voidPayment({ paymentId: created.payment.id, reason: 'Буруу', actorId: adminId }),
    ).rejects.toThrow(/хүчингүй болгох боломжгүй/)

    await setAttendance({ sessionId, studentId, status: 'absent', actorId: adminId })
    const result = await voidPayment({
      paymentId: created.payment.id,
      reason: 'Буруу бүртгэсэн',
      actorId: adminId,
    })
    expect(result.creditsAfter).toBe(0)
    expect(await creditSummaryFor(db, studentId)).toEqual({ granted: 0, used: 0, remaining: 0 })
  })

  it('Сөрөг эсвэл бутархай дүнг хүлээж авахгүй', async () => {
    await expect(createPayment({ ...basePayment(), amount: -100 })).rejects.toThrow(/Дүн/)
    await expect(createPayment({ ...basePayment(), amount: 1000.5 })).rejects.toThrow(/Дүн/)
    await expect(createPayment({ ...basePayment(), creditsGranted: 0 })).rejects.toThrow(/Оролтын тоо/)
  })

  it('№19: сарын төлбөрийн төлөв зөв сарынхаа мэдээллийг харуулна', async () => {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    await createPayment({
      ...basePayment(),
      coverageYear: prevYear,
      coverageMonth: prevMonth,
      idempotencyKey: 'prev-month-123456',
    })

    const currentReport = await monthlyPaymentReport(year, month)
    expect(currentReport.find((r) => r.id === studentId)?.paid).toBe(false)

    const prevReport = await monthlyPaymentReport(prevYear, prevMonth)
    expect(prevReport.find((r) => r.id === studentId)?.paid).toBe(true)

    // Эрх нь сар шилжсэн ч тэглэгдэхгүй
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ granted: 12, remaining: 12 })
  })

  it('Нэг сард нэмэлт багц авч болно', async () => {
    await createPayment({ ...basePayment(), idempotencyKey: 'pack-1-1234567' })
    await createPayment({ ...basePayment(), idempotencyKey: 'pack-2-1234567' })
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ granted: 24, remaining: 24 })
  })
})
