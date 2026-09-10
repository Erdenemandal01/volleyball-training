import { z } from 'zod'
import { ok, parseBody, requireAdmin, route } from '@/lib/api'
import {
  assertConversationAccess,
  getConversationMessages,
  markMessagesRead,
  sendMessage,
} from '@/lib/services/communication'

type Params = { params: Promise<{ id: string }> }

const sendSchema = z.object({
  body: z.string().trim().min(1, 'Зурвасаа бичнэ үү').max(2000),
  clientKey: z.string().min(8).max(100).optional().nullable(),
})

export const GET = route(async (_request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  await assertConversationAccess(id, { id: admin.id, role: 'admin' })
  await markMessagesRead(id, 'admin')
  return ok({ messages: await getConversationMessages(id) })
})

export const POST = route(async (request, context: Params) => {
  const admin = await requireAdmin()
  const { id } = await context.params
  await assertConversationAccess(id, { id: admin.id, role: 'admin' })
  const body = await parseBody(request, sendSchema)
  const message = await sendMessage({
    conversationId: id,
    senderUserId: admin.id,
    senderRole: 'admin',
    body: body.body,
    clientKey: body.clientKey ?? null,
  })
  return ok({ message }, { status: 201 })
})
