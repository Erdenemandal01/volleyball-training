import { z } from 'zod'
import { ok, parseBody, requireParent, route } from '@/lib/api'
import {
  ensureConversation,
  getConversationMessages,
  markMessagesRead,
  sendMessage,
} from '@/lib/services/communication'

const sendSchema = z.object({
  body: z.string().trim().min(1, 'Зурвасаа бичнэ үү').max(2000),
  clientKey: z.string().min(8).max(100).optional().nullable(),
})

export const GET = route(async () => {
  const parent = await requireParent()
  const conversationId = await ensureConversation(parent.id)
  await markMessagesRead(conversationId, 'parent')
  return ok({ conversationId, messages: await getConversationMessages(conversationId) })
})

export const POST = route(async (request) => {
  const parent = await requireParent()
  const conversationId = await ensureConversation(parent.id)
  const body = await parseBody(request, sendSchema)
  const message = await sendMessage({
    conversationId,
    senderUserId: parent.id,
    senderRole: 'parent',
    body: body.body,
    clientKey: body.clientKey ?? null,
  })
  return ok({ message }, { status: 201 })
})
