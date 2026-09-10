import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AuthShell } from '@/components/auth-shell'
import { ParentLoginForm } from './form'

export const dynamic = 'force-dynamic'

export default async function ParentLoginPage() {
  const user = await getSessionUser()
  if (user?.role === 'admin') redirect('/admin')
  if (user?.role === 'parent') redirect(user.mustChangePassword ? '/set-code' : '/parent')

  return (
    <AuthShell
      title="Эцэг эхийн нэвтрэлт"
      subtitle="Бүртгүүлсэн утасны дугаар болон админаас авсан нууц кодоо оруулна уу."
      footer={
        <span className="text-[var(--color-muted)]">
          Нууц кодоо мартсан бол сургалтын админд хандаж шинэ код авна уу.
        </span>
      }
    >
      <ParentLoginForm />
    </AuthShell>
  )
}
