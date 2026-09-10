import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db'
import { attendance, payments } from '@/db/schema'
import { creditSummaryFor, setAttendance } from '@/lib/services/credits'
import { createPayment } from '@/lib/services/payments'
import { todayInUb, addDays } from '@/lib/date'
import { makeAdmin, makeGroup, makeSession, makeStudent, setupDb } from './helpers'
import { eq, and } from 'drizzle-orm'

let adminId: string
let groupId: string
let studentId: string

beforeAll(async () => {
  await setupDb()
})

beforeEach(async () => {
  await setupDb()
  adminId = await makeAdmin()
  groupId = await makeGroup()
  studentId = await makeStudent({ name: 'Тест сурагч', groupId })
})

async function grant(credits = 12, coverageMonth?: number) {
  const today = todayInUb()
  await createPayment({
    studentId,
    paidAt: today,
    coverageYear: Number(today.slice(0, 4)),
    coverageMonth: coverageMonth ?? Number(today.slice(5, 7)),
    amount: 120_000,
    creditsGranted: credits,
    actorId: adminId,
    idempotencyKey: `grant-${credits}-${coverageMonth ?? 'cur'}-${Math.random()}`,
  })
}

/** Өнгөрсөн огноотой N бэлтгэл үүсгэнэ. */
async function pastSessions(count: number) {
  const ids: string[] = []
  for (let i = count; i > 0; i--) {
    ids.push(
      await makeSession({
        groupId,
        date: addDays(todayInUb(), -i),
        roster: [studentId],
      }),
    )
  }
  return ids
}

describe('Оролтын эрхийн тооцоо', () => {
  it('№3: 12 эрх → 7 ирц → 5 үлдэнэ', async () => {
    await grant(12)
    const sessions = await pastSessions(7)
    for (const sessionId of sessions) {
      await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    }
    const summary = await creditSummaryFor(db, studentId)
    expect(summary).toEqual({ granted: 12, used: 7, remaining: 5 })
  })

  it('№4: нэг ирцийг буцаахад үлдэгдэл 6 болно', async () => {
    await grant(12)
    const sessions = await pastSessions(7)
    for (const sessionId of sessions) {
      await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    }
    await setAttendance({
      sessionId: sessions[0],
      studentId,
      status: 'absent',
      actorId: adminId,
    })
    const summary = await creditSummaryFor(db, studentId)
    expect(summary).toEqual({ granted: 12, used: 6, remaining: 6 })
  })

  it('№5: давхар ирцийн хүсэлт дахин эрх хасахгүй', async () => {
    await grant(12)
    const [sessionId] = await pastSessions(1)

    const first = await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    const second = await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    const third = await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(third.changed).toBe(false)

    const summary = await creditSummaryFor(db, studentId)
    expect(summary).toEqual({ granted: 12, used: 1, remaining: 11 })

    const rows = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.sessionId, sessionId), eq(attendance.studentId, studentId)))
    expect(rows).toHaveLength(1)
  })

  it('№6: 1 эрхтэй үед зэрэгцээ хоёр хүсэлтээс зөвхөн нэг нь амжилттай', async () => {
    await grant(1)
    const sessions = await pastSessions(2)

    const results = await Promise.allSettled(
      sessions.map((sessionId) =>
        setAttendance({ sessionId, studentId, status: 'present', actorId: adminId }),
      ),
    )

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const summary = await creditSummaryFor(db, studentId)
    expect(summary).toEqual({ granted: 1, used: 1, remaining: 0 })
    expect(summary.remaining).toBeGreaterThanOrEqual(0)
  })

  it('Эрх дууссан үед "Ирсэн" болгохыг хориглоно', async () => {
    await grant(1)
    const sessions = await pastSessions(2)
    await setAttendance({ sessionId: sessions[0], studentId, status: 'present', actorId: adminId })

    await expect(
      setAttendance({ sessionId: sessions[1], studentId, status: 'present', actorId: adminId }),
    ).rejects.toMatchObject({ code: 'no_credits' })
  })

  it('№7: нэмэлт 12 эрх авахад үлдэгдэл дээр нэмэгдэнэ (сар шилжихэд тэглэхгүй)', async () => {
    const today = todayInUb()
    const month = Number(today.slice(5, 7))
    await grant(12, month === 1 ? 12 : month - 1)

    const sessions = await pastSessions(7)
    for (const sessionId of sessions) {
      await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    }
    expect(await creditSummaryFor(db, studentId)).toEqual({ granted: 12, used: 7, remaining: 5 })

    await grant(12, month)
    expect(await creditSummaryFor(db, studentId)).toEqual({ granted: 24, used: 7, remaining: 17 })
  })

  it('Тасалсан / Чөлөөтэй эрх хасахгүй, бүртгээгүй нь тасалсан биш', async () => {
    await grant(12)
    const sessions = await pastSessions(3)
    await setAttendance({ sessionId: sessions[0], studentId, status: 'absent', actorId: adminId })
    await setAttendance({ sessionId: sessions[1], studentId, status: 'excused', actorId: adminId })

    const summary = await creditSummaryFor(db, studentId)
    expect(summary).toEqual({ granted: 12, used: 0, remaining: 12 })

    const rows = await db.select().from(attendance).where(eq(attendance.studentId, studentId))
    expect(rows).toHaveLength(2) // 3 дахь бэлтгэл бүртгэгдээгүй хэвээр
  })

  it('Ирээдүйн бэлтгэлд "Ирсэн" гэж бүртгэхгүй', async () => {
    await grant(12)
    const sessionId = await makeSession({
      groupId,
      date: addDays(todayInUb(), 3),
      roster: [studentId],
    })
    await expect(
      setAttendance({ sessionId, studentId, status: 'present', actorId: adminId }),
    ).rejects.toThrow(/Болоогүй бэлтгэлд/)
  })

  it('Жагсаалтад байхгүй сурагчийн ирцийг бүртгэхгүй', async () => {
    await grant(12)
    const other = await makeStudent({ name: 'Бусад сурагч', groupId })
    const sessionId = await makeSession({
      groupId,
      date: addDays(todayInUb(), -1),
      roster: [studentId],
    })
    await expect(
      setAttendance({ sessionId, studentId: other, status: 'present', actorId: adminId }),
    ).rejects.toThrow(/жагсаалтад байхгүй/)
  })

  it('Нэг сурагчийн өөрчлөлт бусдын ирцэд нөлөөлөхгүй', async () => {
    await grant(12)
    const other = await makeStudent({ name: 'Хоёрдугаар сурагч', groupId })
    await db.insert(payments).values({
      studentId: other,
      paidAt: todayInUb(),
      coverageYear: Number(todayInUb().slice(0, 4)),
      coverageMonth: Number(todayInUb().slice(5, 7)),
      amount: 120000,
      creditsGranted: 12,
    })
    const sessionId = await makeSession({
      groupId,
      date: addDays(todayInUb(), -1),
      roster: [studentId, other],
    })

    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    await setAttendance({ sessionId, studentId: other, status: 'absent', actorId: adminId })

    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 1, remaining: 11 })
    expect(await creditSummaryFor(db, other)).toMatchObject({ used: 0, remaining: 12 })
  })
})
