import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AdminShell } from '@/components/admin/shell'
import { unreadMessageCountForAdmin } from '@/lib/services/communication'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/admin/login')
  if (user.role !== 'admin') redirect('/parent')

  const unread = await unreadMessageCountForAdmin()

  return (
    <AdminShell user={{ displayName: user.displayName, email: user.email }} unreadMessages={unread}>
      {children}
    </AdminShell>
  )
}
