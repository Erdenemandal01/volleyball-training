import path from 'node:path'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  sessionParticipants,
  students,
  trainingGroups,
  trainingSessions,
  users,
} from '@/db/schema'
import { hashSecret } from '@/lib/password'
import { todayInUb } from '@/lib/date'

let migrated = false

/**
 * Unit тестүүд өгөгдөл үүсгэж, TRUNCATE хийдэг. Тиймээс зөвхөн тусгаарласан
 * in-memory PostgreSQL дээр ажиллахыг баталгаажуулна (tests/setup.ts тохируулдаг).
 */
function assertIsolatedDatabase() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('pglite://')) {
    throw new Error(
      `Тестүүд зөвхөн тусгаарласан PGlite сан дээр ажиллана. DATABASE_URL="${url.split('@').pop()}"`,
    )
  }
}

export async function setupDb() {
  assertIsolatedDatabase()
  if (!migrated) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
    migrated = true
  }
  await resetData()
}

export async function resetData() {
  await db.execute(sql`
    truncate table
      audit_logs, attendance_history, attendance, session_participants, training_sessions,
      payments, announcement_recipients, announcements, messages, conversations,
      student_status_history, group_memberships, parent_students, students,
      training_groups, auth_sessions, login_attempts, users
    restart identity cascade
  `)
}

export async function makeAdmin(email = 'admin@test.mn') {
  const rows = await db
    .insert(users)
    .values({
      role: 'admin',
      email,
      displayName: 'Тест админ',
      passwordHash: await hashSecret('Admin123456'),
    })
    .returning({ id: users.id })
  return rows[0].id
}

export async function makeGroup(name = 'Анхан шат') {
  const rows = await db
    .insert(trainingGroups)
    .values({ name })
    .returning({ id: trainingGroups.id })
  return rows[0].id
}

export async function makeStudent(opts: {
  name: string
  groupId: string | null
  registeredAt?: string
}) {
  const rows = await db
    .insert(students)
    .values({
      fullName: opts.name,
      registeredAt: opts.registeredAt ?? todayInUb(),
      currentGroupId: opts.groupId,
    })
    .returning({ id: students.id })
  return rows[0].id
}

export async function makeSession(opts: {
  groupId: string
  date?: string
  start?: string
  end?: string
  roster?: string[]
}) {
  const rows = await db
    .insert(trainingSessions)
    .values({
      groupId: opts.groupId,
      date: opts.date ?? todayInUb(),
      startTime: opts.start ?? '17:00:00',
      endTime: opts.end ?? '18:30:00',
      location: 'Тест заал',
    })
    .returning({ id: trainingSessions.id })
  const sessionId = rows[0].id
  if (opts.roster?.length) {
    await db
      .insert(sessionParticipants)
      .values(opts.roster.map((studentId) => ({ sessionId, studentId })))
  }
  return sessionId
}
