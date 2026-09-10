'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorNote, Field, Input } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'

export function AdminLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    try {
      const result = await api.post<{ redirectTo: string }>('/api/auth/login/admin', {
        email,
        password,
      })
      router.replace(result.redirectTo)
      router.refresh()
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {})
        if (!error.fieldErrors) setFormError(error.message)
      } else {
        setFormError('Алдаа гарлаа. Дахин оролдоно уу.')
      }
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && <ErrorNote message={formError} />}

      <Field label="И-мэйл" htmlFor="email" error={errors.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          autoFocus
        />
      </Field>

      <Field label="Нууц үг" htmlFor="password" error={errors.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
        />
      </Field>

      <Button type="submit" loading={submitting} className="w-full">
        Нэвтрэх
      </Button>
    </form>
  )
}
