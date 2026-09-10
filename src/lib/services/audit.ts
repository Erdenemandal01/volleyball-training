import { auditLogs } from '@/db/schema'
import type { DbClient } from './types'

export type AuditInput = {
  actorUserId: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId?: string | null
  meta?: Record<string, unknown> | null
}

const FORBIDDEN_KEYS = ['password', 'code', 'secret', 'token', 'hash']

function scrub(meta: Record<string, unknown> | null | undefined) {
  if (!meta) return null
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.some((k) => key.toLowerCase().includes(k))) continue
    clean[key] = value
  }
  return clean
}

/** Нууц үг, кодыг хэзээ ч audit-д бичихгүй. */
export async function writeAudit(client: DbClient, input: AuditInput) {
  await client.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    meta: scrub(input.meta),
  })
}
