import { listAnnouncements, listConversationsForAdmin } from '@/lib/services/communication'
import { listGroups } from '@/lib/services/groups'
import { listStudents } from '@/lib/services/students'
import { parseMonthKey } from '@/lib/date'
import { CommunicationTabs } from '@/components/admin/communication'

export const dynamic = 'force-dynamic'

type Search = Promise<{ tab?: string; parent?: string }>

export default async function CommunicationPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const { year, month } = parseMonthKey(undefined)

  const [announcements, conversations, groups, studentList] = await Promise.all([
    listAnnouncements(),
    listConversationsForAdmin(),
    listGroups(),
    listStudents({ year, month, pageSize: 100, status: 'active' }),
  ])

  return (
    <CommunicationTabs
      activeTab={params.tab === 'messages' ? 'messages' : 'announcements'}
      activeParent={params.parent ?? null}
      announcements={announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audienceType: a.audienceType,
        groupName: a.groupName,
        studentName: a.studentName,
        publishedAt: a.publishedAt.toISOString(),
        recipientCount: Number(a.recipientCount),
        readCount: Number(a.readCount),
      }))}
      conversations={conversations.map((c) => ({
        id: c.id,
        parentUserId: c.parentUserId,
        parentName: c.parentName,
        phone: c.phone,
        children: c.children,
        unread: Number(c.unread),
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      }))}
      groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      students={studentList.rows.map((s) => ({ id: s.id, fullName: s.fullName }))}
    />
  )
}
