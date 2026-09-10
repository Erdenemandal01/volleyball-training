import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { ZodError, type ZodSchema } from 'zod'
import { AppError, forbidden, unauthorized } from './errors'
import { getSessionUser, type SessionUser } from './auth'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data as object, init)
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code, fieldErrors: error.fieldErrors },
      { status: error.status },
    )
  }
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) {
      const path = issue.path.join('.')
      if (!fieldErrors[path]) fieldErrors[path] = issue.message
    }
    return NextResponse.json(
      { error: 'Оруулсан мэдээлэл буруу байна', code: 'validation', fieldErrors },
      { status: 422 },
    )
  }
  console.error('[api] unexpected error', error)
  return NextResponse.json(
    { error: 'Системд алдаа гарлаа. Дахин оролдоно уу.', code: 'internal' },
    { status: 500 },
  )
}

/** SameSite=Lax дээр нэмэлт CSRF хамгаалалт: origin/host таарч байх ёстой. */
export async function assertSameOrigin() {
  const h = await headers()
  const origin = h.get('origin')
  if (!origin) return
  const host = h.get('host')
  try {
    if (new URL(origin).host !== host) {
      throw forbidden('Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй байна')
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw forbidden('Хүсэлтийн эх сурвалж зөвшөөрөгдөөгүй байна')
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw unauthorized()
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') throw forbidden()
  return user
}

export async function requireParent(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'parent') throw forbidden()
  return user
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new AppError('Хүсэлтийн агуулга буруу байна', { status: 400 })
  }
  return schema.parse(raw)
}

export function searchParams(request: Request) {
  return new URL(request.url).searchParams
}

/** Route handler-ийг try/catch-аар боож алдааг нэгдсэн хэлбэрээр буцаана. */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        await assertSameOrigin()
      }
      return await handler(request, ...args)
    } catch (error) {
      return fail(error)
    }
  }
}
