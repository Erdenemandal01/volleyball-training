import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { listAnnouncementsForParent } from '@/lib/services/communication'
import { resolveChild } from '@/lib/services/parent-context'
import { ParentCommunication } from '@/components/parent/communication'

export const dynamic = 'force-dynamic'

type Search = Promise<{ child?: string; tab?: string }>

export default async function ParentMessagesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const [announcements, { children }] = await Promise.all([
    listAnnouncementsForParent(user.id),
    resolveChild(user.id, params.child),
  ])

  return (
    <ParentCommunication
      activeTab={params.tab === 'messages' ? 'messages' : 'announcements'}
      childNames={children.map((c) => c.fullName)}
      announcements={announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        publishedAt: a.publishedAt.toISOString(),
        read: a.readAt !== null,
      }))}
    />
  )
}
