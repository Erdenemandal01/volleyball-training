import { cookies, headers } from 'next/headers'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { authSessions, loginAttempts, users, type UserRole } from '@/db/schema'
import { hmacToken, randomToken } from './password'

export { hashSecret, verifySecret, generateTempCode } from './password'

export const SESSION_COOKIE = 'vt_session'
const SESSION_TTL_DAYS = 30

/** Нэвтрэх оролдлогын хязгаар */
const RATE_LIMIT_WINDOW_MIN = 15
const RATE_LIMIT_MAX = 8

export type SessionUser = {
  id: string
  role: UserRole
  displayName: string
  email: string | null
  phone: string | null
  mustChangePassword: boolean
}

/* ------------------------------ session ------------------------------ */

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(authSessions).values({
    userId,
    tokenHash: hmacToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 200) ?? null,
  })
  return token
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export async function destroyCurrentSession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hmacToken(token)))
  }
  await clearSessionCookie()
}

/** Нууц код солих / reset хийхэд бүх төхөөрөмжийн session-ийг хүчингүй болгоно. */
export async function revokeAllSessions(userId: string) {
  await db.delete(authSessions).where(eq(authSessions.userId, userId))
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return getSessionUserByToken(token)
}

export async function getSessionUserByToken(token: string): Promise<SessionUser | null> {
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      email: users.email,
      phone: users.phone,
      mustChangePassword: users.mustChangePassword,
      isActive: users.isActive,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hmacToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1)

  const row = rows[0]
  if (!row || !row.isActive) return null
  return {
    id: row.id,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone,
    mustChangePassword: row.mustChangePassword,
  }
}

/* ---------------------------- rate limiting --------------------------- */

export async function checkRateLimit(key: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60 * 1000)
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.key, key), gt(loginAttempts.createdAt, since)))
  return Number(rows[0]?.count ?? 0) < RATE_LIMIT_MAX
}

export async function recordFailedAttempt(key: string) {
  await db.insert(loginAttempts).values({ key })
}

export async function clearAttempts(key: string) {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key))
}

export async function clientKeyFromRequest(identifier: string): Promise<string> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'local'
  return `${identifier}|${ip}`
}
