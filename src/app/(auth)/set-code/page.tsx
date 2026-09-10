import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { AuthShell } from '@/components/auth-shell'
import { ChangeCodeForm } from '@/components/change-code-form'

export const dynamic = 'force-dynamic'

export default async function SetCodePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <AuthShell
      title="Нууц кодоо солино уу"
      subtitle={
        user.mustChangePassword
          ? 'Аюулгүй байдлын үүднээс админаас авсан түр кодыг өөрийн кодоор солино.'
          : 'Шинэ нууц код оруулна уу. Солисны дараа бусад төхөөрөмжийн нэвтрэлт цуцлагдана.'
      }
    >
      <ChangeCodeForm />
    </AuthShell>
  )
}
