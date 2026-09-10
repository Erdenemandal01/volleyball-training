import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  attendance,
  attendanceHistory,
  auditLogs,
  sessionParticipants,
  trainingSessions,
} from '@/db/schema'
import {
  cancelTrainingSession,
  createTrainingSession,
  deleteTrainingSession,
  getSessionDetail,
} from '@/lib/services/sessions'
import { createPayment } from '@/lib/services/payments'
import { creditSummaryFor, setAttendance } from '@/lib/services/credits'
import { updateStudent, setStudentStatus, createStudent } from '@/lib/services/students'
import { addDays, todayInUb } from '@/lib/date'
import { makeAdmin, makeGroup, makeSession, makeStudent, setupDb } from './helpers'

let adminId: string
let groupId: string
let otherGroupId: string
let studentId: string
const today = todayInUb()
const year = Number(today.slice(0, 4))
const month = Number(today.slice(5, 7))

beforeEach(async () => {
  await setupDb()
  adminId = await makeAdmin()
  groupId = await makeGroup('Анхан шат')
  otherGroupId = await makeGroup('Ахисан шат')
  studentId = await makeStudent({ name: 'Бэлтгэлийн тест', groupId, registeredAt: addDays(today, -30) })
  await createPayment({
    studentId,
    paidAt: today,
    coverageYear: year,
    coverageMonth: month,
    amount: 120_000,
    creditsGranted: 12,
    actorId: adminId,
    idempotencyKey: `s-${Math.random()}`,
  })
})

describe('Бэлтгэл', () => {
  it('Дуусах цаг эхлэх цагаас өмнө байвал хүлээж авахгүй', async () => {
    await expect(
      createTrainingSession({
        groupId,
        date: today,
        startTime: '18:00:00',
        endTime: '17:00:00',
        location: 'Заал',
        actorId: adminId,
      }),
    ).rejects.toMatchObject({
      fieldErrors: { endTime: 'Дуусах цаг эхлэх цагаас хойш байх ёстой' },
    })
  })

  it('Үүсгэхэд идэвхтэй сурагчдын roster snapshot хадгалагдана', async () => {
    const created = await createTrainingSession({
      groupId,
      date: addDays(today, 1),
      startTime: '17:00:00',
      endTime: '18:30:00',
      location: 'Заал',
      actorId: adminId,
    })
    expect(created.rosterCount).toBe(1)
    const roster = await db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.sessionId, created.id))
    expect(roster).toHaveLength(1)
  })

  it('№10: ирцтэй бэлтгэлийг цуцлахад эрх буцаж, түүх хадгалагдана', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 1, remaining: 11 })

    const result = await cancelTrainingSession({
      sessionId,
      reason: 'Заал завгүй',
      actorId: adminId,
    })
    expect(result.refunded).toBe(1)
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 0, remaining: 12 })

    const history = await db
      .select()
      .from(attendanceHistory)
      .where(eq(attendanceHistory.sessionId, sessionId))
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.some((h) => h.creditDelta === -1)).toBe(true)

    const rows = await db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId))
    expect(rows[0].status).toBe('cancelled')
  })

  it('Цуцлагдсан бэлтгэлд ирц бүртгэхгүй', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await cancelTrainingSession({ sessionId, reason: 'Цас их', actorId: adminId })
    await expect(
      setAttendance({ sessionId, studentId, status: 'present', actorId: adminId }),
    ).rejects.toThrow(/Цуцлагдсан/)
  })

  it('Ирцтэй бэлтгэлийг устгахгүй', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    await expect(deleteTrainingSession({ sessionId, actorId: adminId })).rejects.toThrow(/устгах/)
  })

  it('Ирц бүртгээд буцаасан бэлтгэлийг устгахад түүх audit-д хадгалагдана', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    // Ирцийг буцаахад attendance мөр устдаг ч түүх үлдэнэ
    await setAttendance({ sessionId, studentId, status: null, actorId: adminId })

    const marks = await db.select().from(attendance).where(eq(attendance.sessionId, sessionId))
    expect(marks).toHaveLength(0)

    const history = await db
      .select()
      .from(attendanceHistory)
      .where(eq(attendanceHistory.sessionId, sessionId))
    expect(history.length).toBeGreaterThan(0)

    // Ирц үлдээгүй тул устгах боломжтой; түүх нь audit руу хуулагдана
    await deleteTrainingSession({ sessionId, actorId: adminId })

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'session.delete'), eq(auditLogs.entityId, sessionId)))
    const meta = logs[0].meta as Record<string, unknown>
    expect(meta.attendanceHistoryCount).toBe(history.length)
    expect((meta.attendanceHistory as unknown[]).length).toBe(history.length)
  })

  it('Ирцгүй бэлтгэлийг устгахад audit-д мэдээлэл нь үлдэнэ', async () => {
    const sessionId = await makeSession({
      groupId,
      date: addDays(today, 3),
      roster: [studentId],
    })
    await deleteTrainingSession({ sessionId, actorId: adminId })

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'session.delete'), eq(auditLogs.entityId, sessionId)))
    expect(logs).toHaveLength(1)
    const meta = logs[0].meta as Record<string, unknown>
    expect(meta.date).toBe(addDays(today, 3))
    expect(meta.rosterCount).toBe(1)
    expect(meta.location).toBeTruthy()
  })

  it('Цуцлахад бичигдэх түүх нь үлдсэн бодит төлөвтэй таарна', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    await cancelTrainingSession({ sessionId, reason: 'Заал завгүй', actorId: adminId })

    const marks = await db.select().from(attendance).where(eq(attendance.sessionId, sessionId))
    const history = await db
      .select()
      .from(attendanceHistory)
      .where(eq(attendanceHistory.sessionId, sessionId))
    const cancelEntry = history.find((h) => h.creditDelta === -1)

    expect(marks[0].status).toBe('excused')
    expect(cancelEntry?.toStatus).toBe(marks[0].status)
  })

  it('Цуцлагдсан бэлтгэлийг дахин цуцалж түүх давхардуулахгүй', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -1), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })
    await cancelTrainingSession({ sessionId, reason: 'Нэгдүгээр', actorId: adminId })

    await expect(
      cancelTrainingSession({ sessionId, reason: 'Хоёрдугаар', actorId: adminId }),
    ).rejects.toThrow(/аль хэдийн цуцлагдсан/)

    const history = await db
      .select()
      .from(attendanceHistory)
      .where(eq(attendanceHistory.sessionId, sessionId))
    expect(history.filter((h) => h.creditDelta === -1)).toHaveLength(1)
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 0, remaining: 12 })
  })

  it('№11: бүлэг солиход өмнөх roster, ирц өөрчлөгдөхгүй', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -2), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })

    await updateStudent({
      studentId,
      fullName: 'Бэлтгэлийн тест',
      registeredAt: addDays(today, -30),
      groupId: otherGroupId,
      parentPhone: '99001122',
      actorId: adminId,
    })

    const detail = await getSessionDetail(sessionId)
    expect(detail.roster).toHaveLength(1)
    expect(detail.roster[0].status).toBe('present')
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 1, remaining: 11 })
  })

  it('№12: сурагчийг идэвхгүй болгоход түүх хадгалагдана', async () => {
    const sessionId = await makeSession({ groupId, date: addDays(today, -2), roster: [studentId] })
    await setAttendance({ sessionId, studentId, status: 'present', actorId: adminId })

    await setStudentStatus({ studentId, status: 'inactive', reason: 'Түр завсарлав', actorId: adminId })

    const detail = await getSessionDetail(sessionId)
    expect(detail.roster[0].status).toBe('present')
    expect(await creditSummaryFor(db, studentId)).toMatchObject({ used: 1, remaining: 11 })

    // Идэвхгүй сурагч шинэ бэлтгэлийн roster-д орохгүй
    const created = await createTrainingSession({
      groupId,
      date: addDays(today, 2),
      startTime: '17:00:00',
      endTime: '18:30:00',
      location: 'Заал',
      actorId: adminId,
    })
    expect(created.rosterCount).toBe(0)
  })

  it('Дахин идэвхжүүлсэн сурагч шинэ roster-д орно', async () => {
    await setStudentStatus({ studentId, status: 'inactive', actorId: adminId })
    await setStudentStatus({ studentId, status: 'active', actorId: adminId })
    const created = await createTrainingSession({
      groupId,
      date: addDays(today, 2),
      startTime: '17:00:00',
      endTime: '18:30:00',
      location: 'Заал',
      actorId: adminId,
    })
    expect(created.rosterCount).toBe(1)
  })

  it('Шинэ сурагч нэмэхэд эцэг эхийн бүртгэл давхардахгүй', async () => {
    const first = await createStudent({
      fullName: 'Ах',
      registeredAt: today,
      groupId,
      parentPhone: '+976 9911 2233',
      parentName: 'Эцэг эх',
      actorId: adminId,
    })
    const second = await createStudent({
      fullName: 'Дүү',
      registeredAt: today,
      groupId,
      parentPhone: '99112233',
      actorId: adminId,
    })
    expect(first.parentExisted).toBe(false)
    expect(second.parentExisted).toBe(true)
    expect(second.parentUserId).toBe(first.parentUserId)
    expect(first.temporaryCode).toBeTruthy()
    expect(second.temporaryCode).toBeNull()
  })
})
