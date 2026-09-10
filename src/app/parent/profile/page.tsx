import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { studentsForParent } from '@/lib/services/students'
import { formatPhone } from '@/lib/phone'
import { formatDate } from '@/lib/date'
import { Badge, Card, CardHeader } from '@/components/ui'
import { ChangeCodeForm } from '@/components/change-code-form'
import { LogoutButton } from '@/components/parent/logout-button'
import { STUDENT_STATUS_LABEL } from '@/lib/labels'

export const dynamic = 'force-dynamic'

export default async function ParentProfilePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const children = await studentsForParent(user.id)

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Профайл</h2>

      <Card>
        <CardHeader title="Миний мэдээлэл" />
        <dl className="divide-y divide-[var(--color-line)]">
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-[var(--color-muted)]">Нэр</dt>
            <dd className="font-medium">{user.displayName}</dd>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-[var(--color-muted)]">Утасны дугаар</dt>
            <dd className="font-medium tabular-nums">{formatPhone(user.phone)}</dd>
          </div>
        </dl>
        <p className="border-t border-[var(--color-line)] px-4 py-3 text-[13px] text-[var(--color-muted)]">
          Утасны дугаараа солих шаардлагатай бол сургалтын админд хандана уу.
        </p>
      </Card>

      <Card>
        <CardHeader title="Миний хүүхдүүд" description={`${children.length} хүүхэд бүртгэлтэй`} />
        <ul className="divide-y divide-[var(--color-line)]">
          {children.map((child) => (
            <li key={child.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">{child.fullName}</p>
                <p className="text-[13px] text-[var(--color-muted)]">
                  {child.groupName ?? 'Бүлэг тодорхойгүй'} · Бүртгүүлсэн{' '}
                  {formatDate(child.registeredAt)}
                </p>
              </div>
              <Badge tone={child.status === 'active' ? 'success' : 'neutral'}>
                {STUDENT_STATUS_LABEL[child.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Нууц код солих"
          description="Солисны дараа бусад төхөөрөмжийн нэвтрэлт цуцлагдана."
        />
        <div className="px-4 py-4">
          <ChangeCodeForm compact />
        </div>
      </Card>

      <LogoutButton />
    </div>
  )
}
