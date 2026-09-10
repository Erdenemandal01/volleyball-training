'use client'

export type ApiError = {
  message: string
  code?: string
  fieldErrors?: Record<string, string>
  status: number
}

export class RequestError extends Error implements ApiError {
  code?: string
  fieldErrors?: Record<string, string>
  status: number

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'RequestError'
    this.code = error.code
    this.fieldErrors = error.fieldErrors
    this.status = error.status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new RequestError({
      message: 'Сүлжээнд холбогдож чадсангүй. Холболтоо шалгаад дахин оролдоно уу.',
      status: 0,
    })
  }

  if (response.status === 204) return undefined as T

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const data = (payload ?? {}) as { error?: string; code?: string; fieldErrors?: Record<string, string> }
    throw new RequestError({
      message: data.error ?? 'Хүсэлт биелсэнгүй. Дахин оролдоно уу.',
      code: data.code,
      fieldErrors: data.fieldErrors,
      status: response.status,
    })
  }

  return payload as T
}

export const api = {
  get: <T>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}

/** Давхар submit-ээс хамгаалах түлхүүр */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
