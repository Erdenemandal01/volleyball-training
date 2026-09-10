import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, parseBody, requireUser, route } from '@/lib/api'
import {
  createSession,
  hashSecret,
  revokeAllSessions,
  setSessionCookie,
  verifySecret,
} from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { changePasswordSchema } from '@/lib/validation'
import { writeAudit } from '@/lib/services/audit'

/**
 * Нууц код солих. Солигдсоны дараа бүх хуучин session хүчингүй болж,
 * зөвхөн энэ төхөөрөмж дээр шинэ session үүснэ.
 */
export const POST = route(async (request) => {
  const sessionUser = await requireUser()
  const body = await parseBody(request, changePasswordSchema)

  const rows = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1)
  const user = rows[0]
  if (!user) throw new AppError('Хэрэглэгч олдсонгүй', { status: 404 })

  const valid = await verifySecret(body.currentPassword, user.passwordHash)
  if (!valid) {
    throw new AppError('Одоогийн код буруу байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { currentPassword: 'Одоогийн код буруу байна' },
    })
  }

  if (await verifySecret(body.newPassword, user.passwordHash)) {
    throw new AppError('Шинэ код хуучинтайгаа адилхан байна', {
      status: 422,
      code: 'validation',
      fieldErrors: { newPassword: 'Өмнөхөөсөө өөр код сонгоно уу' },
    })
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashSecret(body.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  await revokeAllSessions(user.id)
  const token = await createSession(user.id, request.headers.get('user-agent'))
  await setSessionCookie(token)

  await writeAudit(db, {
    actorUserId: user.id,
    actorRole: user.role,
    action: 'auth.change_password',
    entityType: 'user',
    entityId: user.id,
    meta: { sessionsRevoked: true },
  })

  return ok({ ok: true, redirectTo: user.role === 'admin' ? '/admin' : '/parent' })
})
