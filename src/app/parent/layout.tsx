import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { studentsForParent } from '@/lib/services/students'
import {
  unreadAnnouncementCount,
  unreadMessageCountForParent,
} from '@/lib/services/communication'
import { ParentShell } from '@/components/parent/shell'

export const dynamic = 'force-dynamic'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'parent') redirect('/admin')
  if (user.mustChangePassword) redirect('/set-code')

  const [students, unreadMessages, unreadAnnouncements] = await Promise.all([
    studentsForParent(user.id),
    unreadMessageCountForParent(user.id),
    unreadAnnouncementCount(user.id),
  ])

  return (
    <ParentShell
      displayName={user.displayName}
      unreadCount={unreadMessages + unreadAnnouncements}
      childOptions={students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        groupName: s.groupName,
        status: s.status,
      }))}
    >
      {children}
    </ParentShell>
  )
}
