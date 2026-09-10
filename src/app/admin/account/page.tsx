import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { Card, CardHeader } from '@/components/ui'
import { PageHeader } from '@/components/page-header'
import { ChangeCodeForm } from '@/components/change-code-form'

export const dynamic = 'force-dynamic'

export default async function AdminAccountPage() {
  const user = await getSessionUser()
  if (!user) redirect('/admin/login')

  return (
    <>
      <PageHeader title="Миний бүртгэл" description="Нэвтрэх мэдээллээ шинэчлэх" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Хэрэглэгчийн мэдээлэл" />
          <dl className="divide-y divide-[var(--color-line)]">
            <div className="flex justify-between px-5 py-3">
              <dt className="text-[var(--color-muted)]">Нэр</dt>
              <dd className="font-medium">{user.displayName}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-[var(--color-muted)]">И-мэйл</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex justify-between px-5 py-3">
              <dt className="text-[var(--color-muted)]">Эрх</dt>
              <dd className="font-medium">Админ</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Нууц үг солих"
            description="Солисны дараа бусад бүх төхөөрөмжийн нэвтрэлт цуцлагдана."
          />
          <div className="px-5 py-4">
            <ChangeCodeForm compact />
          </div>
        </Card>
      </div>
    </>
  )
}
