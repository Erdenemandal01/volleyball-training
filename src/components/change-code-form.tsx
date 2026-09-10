'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorNote, Field, Input, SuccessNote } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'

export function ChangeCodeForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function update(key: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)
    setSuccess(false)

    try {
      const result = await api.post<{ redirectTo: string }>('/api/auth/change-code', values)
      setSuccess(true)
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
      if (!compact) {
        router.replace(result.redirectTo)
        router.refresh()
        return
      }
      router.refresh()
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {})
        if (!error.fieldErrors) setFormError(error.message)
      } else {
        setFormError('Алдаа гарлаа. Дахин оролдоно уу.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && <ErrorNote message={formError} />}
      {success && compact && <SuccessNote message="Нууц код амжилттай солигдлоо." />}

      <Field label="Одоогийн код" htmlFor="currentPassword" error={errors.currentPassword} required>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(e) => update('currentPassword', e.target.value)}
          aria-invalid={Boolean(errors.currentPassword)}
        />
      </Field>

      <Field
        label="Шинэ нууц код"
        htmlFor="newPassword"
        error={errors.newPassword}
        hint="Дор хаяж 6 тэмдэгт"
        required
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(e) => update('newPassword', e.target.value)}
          aria-invalid={Boolean(errors.newPassword)}
        />
      </Field>

      <Field label="Шинэ кодоо давтах" htmlFor="confirmPassword" error={errors.confirmPassword} required>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={(e) => update('confirmPassword', e.target.value)}
          aria-invalid={Boolean(errors.confirmPassword)}
        />
      </Field>

      <Button type="submit" loading={submitting} className={compact ? '' : 'w-full'}>
        Кодоо солих
      </Button>
    </form>
  )
}
