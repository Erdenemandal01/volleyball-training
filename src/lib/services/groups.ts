import { asc, eq, sql, and } from 'drizzle-orm'
import { db } from '@/db'
import { students, trainingGroups } from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { writeAudit } from './audit'

export async function listGroups() {
  return db
    .select({
      id: trainingGroups.id,
      name: trainingGroups.name,
      description: trainingGroups.description,
      isActive: trainingGroups.isActive,
      studentCount: sql<number>`(
        select count(*)::int from ${students}
        where ${students.currentGroupId} = ${trainingGroups.id}
          and ${students.status} = 'active'
      )`,
    })
    .from(trainingGroups)
    .orderBy(asc(trainingGroups.name))
}

export async function createGroup(input: {
  name: string
  description?: string | null
  actorId: string
}) {
  const existing = await db
    .select({ id: trainingGroups.id })
    .from(trainingGroups)
    .where(eq(trainingGroups.name, input.name.trim()))
    .limit(1)
  if (existing.length) throw conflict('Ийм нэртэй бүлэг аль хэдийн байна')

  const rows = await db
    .insert(trainingGroups)
    .values({ name: input.name.trim(), description: input.description?.trim() || null })
    .returning({ id: trainingGroups.id })

  await writeAudit(db, {
    actorUserId: input.actorId,
    actorRole: 'admin',
    action: 'group.create',
    entityType: 'training_group',
    entityId: rows[0].id,
    meta: { name: input.name },
  })
  return rows[0]
}

export async function updateGroup(input: {
  groupId: string
  name: string
  description?: string | null
  isActive: boolean
  actorId: string
}) {
  const rows = await db
    .select({ id: trainingGroups.id })
    .from(trainingGroups)
    .where(eq(trainingGroups.id, input.groupId))
    .limit(1)
  if (!rows.length) throw notFound('Бүлэг олдсонгүй')

  const duplicate = await db
    .select({ id: trainingGroups.id })
    .from(trainingGroups)
    .where(
      and(
        eq(trainingGroups.name, input.name.trim()),
        sql`${trainingGroups.id} <> ${input.groupId}`,
      ),
    )
    .limit(1)
  if (duplicate.length) throw conflict('Ийм нэртэй бүлэг аль хэдийн байна')

  await db
    .update(trainingGroups)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isActive: input.isActive,
    })
    .where(eq(trainingGroups.id, input.groupId))

  await writeAudit(db, {
    actorUserId: input.actorId,
    actorRole: 'admin',
    action: 'group.update',
    entityType: 'training_group',
    entityId: input.groupId,
    meta: { name: input.name, isActive: input.isActive },
  })
}
