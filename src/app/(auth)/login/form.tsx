'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorNote, Field, Input } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'

export function ParentLoginForm() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
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
      const result = await api.post<{ redirectTo: string }>('/api/auth/login/parent', {
        phone,
        code,
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

      <Field label="Утасны дугаар" htmlFor="phone" error={errors.phone} required>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="99112233"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(errors.phone)}
          autoFocus
        />
      </Field>

      <Field label="Нууц код" htmlFor="code" error={errors.code} required>
        <Input
          id="code"
          name="code"
          type="password"
          autoComplete="current-password"
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={Boolean(errors.code)}
        />
      </Field>

      <Button type="submit" loading={submitting} className="w-full">
        Нэвтрэх
      </Button>
    </form>
  )
}
