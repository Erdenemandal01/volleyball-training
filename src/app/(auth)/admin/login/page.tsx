import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AuthShell } from '@/components/auth-shell'
import { AdminLoginForm } from './form'

export const dynamic = 'force-dynamic'

export default async function AdminLoginPage() {
  const user = await getSessionUser()
  if (user?.role === 'admin') redirect('/admin')

  return (
    <AuthShell
      title="Админ нэвтрэлт"
      subtitle="Зөвхөн сургалтын байгууллагын админ нэвтэрнэ."
      footer={
        <span className="text-[var(--color-muted)]">
          Админ бүртгэл нээлттэй биш. Шинэ админыг серверийн командаар үүсгэнэ.
        </span>
      }
    >
      <AdminLoginForm />
    </AuthShell>
  )
}
