import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  announcementRecipients,
  announcements,
  conversations,
  messages,
  parentStudents,
  students,
  trainingGroups,
  users,
  type AnnouncementAudience,
} from '@/db/schema'
import { AppError, notFound } from '@/lib/errors'
import { writeAudit } from './audit'
import type { DbClient } from './types'

/* ---------------------------------- Зар ---------------------------------- */

/** Хүлээн авагчийг тооцоолно — нэг эцэг эх давхардвал нэг л удаа хүргэнэ. */
async function resolveRecipients(
  client: DbClient,
  audienceType: AnnouncementAudience,
  groupId?: string | null,
  studentId?: string | null,
) {
  const rows = await client
    .select({
      parentUserId: parentStudents.parentUserId,
      parentName: users.displayName,
      phone: users.phone,
      studentName: students.fullName,
    })
    .from(parentStudents)
    .innerJoin(students, eq(students.id, parentStudents.studentId))
    .innerJoin(users, eq(users.id, parentStudents.parentUserId))
    .where(
      audienceType === 'student'
        ? and(eq(parentStudents.studentId, studentId ?? ''), eq(users.isActive, true))
        : audienceType === 'group'
          ? and(
              eq(students.currentGroupId, groupId ?? ''),
              eq(students.status, 'active'),
              eq(users.isActive, true),
            )
          : and(eq(students.status, 'active'), eq(users.isActive, true)),
    )

  const map = new Map<string, { parentUserId: string; parentName: string; phone: string | null; students: string[] }>()
  for (const row of rows) {
    const entry = map.get(row.parentUserId) ?? {
      parentUserId: row.parentUserId,
      parentName: row.parentName,
      phone: row.phone,
      students: [],
    }
    entry.students.push(row.studentName)
    map.set(row.parentUserId, entry)
  }
  return [...map.values()]
}

export async function previewAnnouncementRecipients(input: {
  audienceType: AnnouncementAudience
  groupId?: string | null
  studentId?: string | null
}) {
  const recipients = await resolveRecipients(
    db,
    input.audienceType,
    input.groupId,
    input.studentId,
  )
  return { count: recipients.length, recipients }
}

export async function createAnnouncement(input: {
  title: string
  body: string
  audienceType: AnnouncementAudience
  groupId?: string | null
  studentId?: string | null
  actorId: string
}) {
  if (input.audienceType === 'group' && !input.groupId) {
    throw new AppError('Бүлгээ сонгоно уу', {
      status: 422,
      code: 'validation',
      fieldErrors: { groupId: 'Бүлгээ сонгоно уу' },
    })
  }
  if (input.audienceType === 'student' && !input.studentId) {
    throw new AppError('Сурагчаа сонгоно уу', {
      status: 422,
      code: 'validation',
      fieldErrors: { studentId: 'Сурагчаа сонгоно уу' },
    })
  }

  return db.transaction(async (tx) => {
    const recipients = await resolveRecipients(
      tx,
      input.audienceType,
      input.groupId,
      input.studentId,
    )
    if (recipients.length === 0) {
      throw new AppError('Хүлээн авагч олдсонгүй. Сонголтоо шалгана уу.', { status: 409 })
    }

    const rows = await tx
      .insert(announcements)
      .values({
        title: input.title.trim(),
        body: input.body.trim(),
        audienceType: input.audienceType,
        groupId: input.groupId ?? null,
        studentId: input.studentId ?? null,
        createdBy: input.actorId,
      })
      .returning({ id: announcements.id })
    const announcementId = rows[0].id

    // Хүлээн авагчдыг нийтлэх мөчид хөлдөөнө
    await tx.insert(announcementRecipients).values(
      recipients.map((r) => ({ announcementId, parentUserId: r.parentUserId })),
    )

    await writeAudit(tx, {
      actorUserId: input.actorId,
      actorRole: 'admin',
      action: 'announcement.create',
      entityType: 'announcement',
      entityId: announcementId,
      meta: { audienceType: input.audienceType, recipients: recipients.length },
    })

    return { id: announcementId, recipients: recipients.length }
  })
}

export async function listAnnouncements() {
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      audienceType: announcements.audienceType,
      groupName: trainingGroups.name,
      studentName: students.fullName,
      publishedAt: announcements.publishedAt,
      recipientCount: sql<number>`(
        select count(*)::int from ${announcementRecipients}
        where ${announcementRecipients.announcementId} = ${announcements.id}
      )`,
      readCount: sql<number>`(
        select count(*)::int from ${announcementRecipients}
        where ${announcementRecipients.announcementId} = ${announcements.id}
          and ${announcementRecipients.readAt} is not null
      )`,
    })
    .from(announcements)
    .leftJoin(trainingGroups, eq(trainingGroups.id, announcements.groupId))
    .leftJoin(students, eq(students.id, announcements.studentId))
    .orderBy(desc(announcements.publishedAt))
}

export async function listAnnouncementsForParent(parentUserId: string) {
  return db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      publishedAt: announcements.publishedAt,
      readAt: announcementRecipients.readAt,
    })
    .from(announcementRecipients)
    .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
    .where(eq(announcementRecipients.parentUserId, parentUserId))
    .orderBy(desc(announcements.publishedAt))
}

export async function markAnnouncementRead(parentUserId: string, announcementId: string) {
  const updated = await db
    .update(announcementRecipients)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(announcementRecipients.parentUserId, parentUserId),
        eq(announcementRecipients.announcementId, announcementId),
        isNull(announcementRecipients.readAt),
      ),
    )
    .returning({ id: announcementRecipients.id })
  return { updated: updated.length }
}

export async function unreadAnnouncementCount(parentUserId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(announcementRecipients)
    .where(
      and(
        eq(announcementRecipients.parentUserId, parentUserId),
        isNull(announcementRecipients.readAt),
      ),
    )
  return Number(rows[0]?.count ?? 0)
}

/* -------------------------------- Зурвас --------------------------------- */

export async function ensureConversation(parentUserId: string) {
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.parentUserId, parentUserId))
    .limit(1)
  if (existing.length) return existing[0].id
  const rows = await db
    .insert(conversations)
    .values({ parentUserId })
    .returning({ id: conversations.id })
  return rows[0].id
}

export async function listConversationsForAdmin() {
  const rows = await db
    .select({
      id: conversations.id,
      parentUserId: conversations.parentUserId,
      parentName: users.displayName,
      phone: users.phone,
      lastMessageAt: conversations.lastMessageAt,
      unread: sql<number>`(
        select count(*)::int from ${messages}
        where ${messages.conversationId} = ${conversations.id}
          and ${messages.senderRole} = 'parent'
          and ${messages.readAt} is null
      )`,
      lastMessage: sql<string | null>`(
        select ${messages.body} from ${messages}
        where ${messages.conversationId} = ${conversations.id}
        order by ${messages.createdAt} desc limit 1
      )`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.parentUserId))
    .orderBy(desc(conversations.lastMessageAt), asc(users.displayName))

  const parentIds = rows.map((r) => r.parentUserId)
  const children = parentIds.length
    ? await db
        .select({
          parentUserId: parentStudents.parentUserId,
          fullName: students.fullName,
        })
        .from(parentStudents)
        .innerJoin(students, eq(students.id, parentStudents.studentId))
        .where(inArray(parentStudents.parentUserId, parentIds))
    : []

  const childMap = new Map<string, string[]>()
  for (const child of children) {
    childMap.set(child.parentUserId, [
      ...(childMap.get(child.parentUserId) ?? []),
      child.fullName,
    ])
  }

  return rows.map((row) => ({ ...row, children: childMap.get(row.parentUserId) ?? [] }))
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select({
      id: messages.id,
      senderRole: messages.senderRole,
      body: messages.body,
      createdAt: messages.createdAt,
      readAt: messages.readAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
}

export async function assertConversationAccess(
  conversationId: string,
  user: { id: string; role: 'admin' | 'parent' },
) {
  const rows = await db
    .select({ id: conversations.id, parentUserId: conversations.parentUserId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)
  const conversation = rows[0]
  if (!conversation) throw notFound('Харилцаа олдсонгүй')
  if (user.role === 'parent' && conversation.parentUserId !== user.id) {
    throw notFound('Харилцаа олдсонгүй')
  }
  return conversation
}

export async function sendMessage(input: {
  conversationId: string
  senderUserId: string
  senderRole: 'admin' | 'parent'
  body: string
  clientKey?: string | null
}) {
  const body = input.body.trim()
  if (!body) {
    throw new AppError('Зурвас хоосон байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { body: 'Зурвасаа бичнэ үү' },
    })
  }

  if (input.clientKey) {
    const existing = await db
      .select()
      .from(messages)
      .where(eq(messages.clientKey, input.clientKey))
      .limit(1)
    if (existing.length) return existing[0]
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderUserId: input.senderUserId,
        senderRole: input.senderRole,
        body,
        clientKey: input.clientKey ?? null,
      })
      .returning()

    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, input.conversationId))

    return rows[0]
  })
}

export async function markMessagesRead(
  conversationId: string,
  readerRole: 'admin' | 'parent',
) {
  const otherRole = readerRole === 'admin' ? 'parent' : 'admin'
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.senderRole, otherRole),
        isNull(messages.readAt),
      ),
    )
}

export async function unreadMessageCountForParent(parentUserId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(conversations.parentUserId, parentUserId),
        eq(messages.senderRole, 'admin'),
        isNull(messages.readAt),
      ),
    )
  return Number(rows[0]?.count ?? 0)
}

export async function unreadMessageCountForAdmin() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.senderRole, 'parent'), isNull(messages.readAt)))
  return Number(rows[0]?.count ?? 0)
}
