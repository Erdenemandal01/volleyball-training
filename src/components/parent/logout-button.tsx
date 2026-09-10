'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui'
import { api } from '@/lib/client-api'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    await api.post('/api/auth/logout')
    router.replace('/login')
    router.refresh()
  }

  return (
    <Button variant="secondary" className="w-full" onClick={logout} loading={loading}>
      <LogOut size={18} aria-hidden />
      Гарах
    </Button>
  )
}
