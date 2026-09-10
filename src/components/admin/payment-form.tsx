'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { RequestError, api, newIdempotencyKey } from '@/lib/client-api'
import { MONTH_NAMES, todayInUb } from '@/lib/date'
import { formatMoney } from '@/lib/format'

export const DEFAULT_CREDITS = 12

export type PaymentFormValues = {
  studentId: string
  paidAt: string
  coverageYear: number
  coverageMonth: number
  amount: string
  creditsGranted: string
  note: string
}

export function PaymentFormModal({
  open,
  onClose,
  students,
  mode = 'create',
  paymentId,
  initialValues,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  students: { id: string; fullName: string }[]
  mode?: 'create' | 'edit'
  paymentId?: string
  initialValues?: Partial<PaymentFormValues>
  onSaved?: () => void
}) {
  const router = useRouter()
  const today = todayInUb()
  const [values, setValues] = useState<PaymentFormValues>({
    studentId: initialValues?.studentId ?? students[0]?.id ?? '',
    paidAt: initialValues?.paidAt ?? today,
    coverageYear: initialValues?.coverageYear ?? Number(today.slice(0, 4)),
    coverageMonth: initialValues?.coverageMonth ?? Number(today.slice(5, 7)),
    amount: initialValues?.amount ?? '',
    creditsGranted: initialValues?.creditsGranted ?? String(DEFAULT_CREDITS),
    note: initialValues?.note ?? '',
  })
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Давхар submit хийхэд нэг л төлбөр үүсэхийг баталгаажуулна
  const idempotencyKey = useRef(newIdempotencyKey())

  const years = useMemo(() => {
    const current = Number(today.slice(0, 4))
    return [current - 1, current, current + 1]
  }, [today])

  function update<K extends keyof PaymentFormValues>(key: K, value: PaymentFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    const payload = {
      studentId: values.studentId,
      paidAt: values.paidAt,
      coverageYear: Number(values.coverageYear),
      coverageMonth: Number(values.coverageMonth),
      amount: Number(values.amount),
      creditsGranted: Number(values.creditsGranted),
      note: values.note || null,
    }

    try {
      if (mode === 'create') {
        await api.post('/api/admin/payments', {
          ...payload,
          idempotencyKey: idempotencyKey.current,
        })
      } else {
        await api.patch(`/api/admin/payments/${paymentId}`, { ...payload, reason })
      }
      router.refresh()
      onSaved?.()
      onClose()
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {})
        if (!error.fieldErrors) setFormError(error.message)
      } else {
        setFormError('Хадгалахад алдаа гарлаа. Дахин оролдоно уу.')
      }
      // Дахин оролдоход шинэ түлхүүр авахгүй — давхар төлбөр үүсэхээс сэргийлнэ
    } finally {
      setSubmitting(false)
    }
  }

  const amountNumber = Number(values.amount)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Төлбөр бүртгэх' : 'Төлбөр засах'}
      description="Нэг бүртгэл нь сонгосон сарын бүрэн төлөгдсөн багц."
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" form="payment-form" loading={submitting}>
            {mode === 'create' ? 'Бүртгэх' : 'Хадгалах'}
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <ErrorNote message={formError} />}

        <Field label="Сурагч" htmlFor="studentId" error={errors.studentId} required>
          <Select
            id="studentId"
            value={values.studentId}
            disabled={mode === 'edit'}
            onChange={(e) => update('studentId', e.target.value)}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Төлсөн огноо" htmlFor="paidAt" error={errors.paidAt} required>
            <Input
              id="paidAt"
              type="date"
              value={values.paidAt}
              onChange={(e) => update('paidAt', e.target.value)}
              aria-invalid={Boolean(errors.paidAt)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Хамрах он" htmlFor="coverageYear" error={errors.coverageYear} required>
              <Select
                id="coverageYear"
                value={String(values.coverageYear)}
                onChange={(e) => update('coverageYear', Number(e.target.value))}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Хамрах сар" htmlFor="coverageMonth" error={errors.coverageMonth} required>
              <Select
                id="coverageMonth"
                value={String(values.coverageMonth)}
                onChange={(e) => update('coverageMonth', Number(e.target.value))}
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Төлсөн дүн (₮)"
            htmlFor="amount"
            error={errors.amount}
            hint={amountNumber > 0 ? formatMoney(amountNumber) : 'Бүхэл тоогоор'}
            required
          >
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.amount}
              onChange={(e) => update('amount', e.target.value)}
              aria-invalid={Boolean(errors.amount)}
            />
          </Field>

          <Field
            label="Олгох оролтын тоо"
            htmlFor="creditsGranted"
            error={errors.creditsGranted}
            hint="Стандарт багц 12 удаа"
            required
          >
            <Input
              id="creditsGranted"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={values.creditsGranted}
              onChange={(e) => update('creditsGranted', e.target.value)}
              aria-invalid={Boolean(errors.creditsGranted)}
            />
          </Field>
        </div>

        <Field label="Тайлбар" htmlFor="note" error={errors.note}>
          <Textarea id="note" value={values.note} onChange={(e) => update('note', e.target.value)} />
        </Field>

        {mode === 'edit' && (
          <Field label="Засварын шалтгаан" htmlFor="reason" error={errors.reason} required>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
      </form>
    </Modal>
  )
}
