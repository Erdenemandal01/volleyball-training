import { ok, route } from '@/lib/api'
import { destroyCurrentSession } from '@/lib/auth'

export const POST = route(async () => {
  await destroyCurrentSession()
  return ok({ ok: true, redirectTo: '/login' })
})
