import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { ok, parseBody, route } from '@/lib/api'
import {
  checkRateLimit,
  clearAttempts,
  clientKeyFromRequest,
  createSession,
  recordFailedAttempt,
  setSessionCookie,
  verifySecret,
} from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { normalizePhone } from '@/lib/phone'
import { parentLoginSchema } from '@/lib/validation'

/** Дугаар бүртгэлтэй эсэхийг задруулахгүй — бүх тохиолдолд ижил хариу. */
const GENERIC_ERROR = 'Утасны дугаар эсвэл нууц код буруу байна'

export const POST = route(async (request) => {
  const body = await parseBody(request, parentLoginSchema)
  const phone = normalizePhone(body.phone)!

  const rateKey = await clientKeyFromRequest(`parent:${phone}`)
  if (!(await checkRateLimit(rateKey))) {
    throw new AppError('Хэт олон удаа буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.', {
      status: 429,
      code: 'rate_limited',
    })
  }

  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.role, 'parent')))
    .limit(1)

  const user = rows[0]
  const valid = user ? await verifySecret(body.code, user.passwordHash) : false

  if (!user || !valid || !user.isActive) {
    await recordFailedAttempt(rateKey)
    throw new AppError(GENERIC_ERROR, { status: 401, code: 'invalid_credentials' })
  }

  await clearAttempts(rateKey)
  const token = await createSession(user.id, request.headers.get('user-agent'))
  await setSessionCookie(token)

  return ok({
    ok: true,
    mustChangePassword: user.mustChangePassword,
    redirectTo: user.mustChangePassword ? '/set-code' : '/parent',
  })
})
