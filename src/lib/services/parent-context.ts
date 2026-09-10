import { notFound } from 'next/navigation'
import { studentsForParent } from './students'

/**
 * Эцэг эхийн сонгосон хүүхдийг тодорхойлно.
 * URL-ийн parameter нь өөрийн хүүхдийнх биш бол 404 буцна (хандалт хаагдана).
 */
export async function resolveChild(parentUserId: string, requestedId?: string) {
  const children = await studentsForParent(parentUserId)
  if (children.length === 0) return { children, child: null }

  if (requestedId) {
    const match = children.find((c) => c.id === requestedId)
    if (!match) notFound()
    return { children, child: match }
  }

  return { children, child: children[0] }
}
