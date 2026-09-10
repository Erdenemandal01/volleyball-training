'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'
import { todayInUb } from '@/lib/date'

export type SessionFormValues = {
  groupId: string
  date: string
  startTime: string
  endTime: string
  location: string
  note: string
}

export function SessionFormModal({
  open,
  onClose,
  groups,
  mode = 'create',
  sessionId,
  initialValues,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  groups: { id: string; name: string }[]
  mode?: 'create' | 'edit'
  sessionId?: string
  initialValues?: Partial<SessionFormValues>
  onSaved?: () => void
}) {
  const router = useRouter()
  const [values, setValues] = useState<SessionFormValues>({
    groupId: initialValues?.groupId ?? groups[0]?.id ?? '',
    date: initialValues?.date ?? todayInUb(),
    startTime: initialValues?.startTime ?? '17:00',
    endTime: initialValues?.endTime ?? '18:30',
    location: initialValues?.location ?? '',
    note: initialValues?.note ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function update<K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    const payload = {
      groupId: values.groupId,
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      location: values.location,
      note: values.note || null,
    }

    try {
      if (mode === 'create') await api.post('/api/admin/sessions', payload)
      else await api.patch(`/api/admin/sessions/${sessionId}`, payload)
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
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Бэлтгэл нэмэх' : 'Бэлтгэл засах'}
      description={
        mode === 'create'
          ? 'Үүсгэх үед бүлгийн идэвхтэй сурагчид жагсаалтад автоматаар орно.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" form="session-form" loading={submitting}>
            {mode === 'create' ? 'Үүсгэх' : 'Хадгалах'}
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <ErrorNote message={formError} />}

        <Field label="Бүлэг" htmlFor="groupId" error={errors.groupId} required>
          <Select
            id="groupId"
            value={values.groupId}
            onChange={(e) => update('groupId', e.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Огноо" htmlFor="date" error={errors.date} required>
          <Input
            id="date"
            type="date"
            value={values.date}
            onChange={(e) => update('date', e.target.value)}
            aria-invalid={Boolean(errors.date)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Эхлэх цаг" htmlFor="startTime" error={errors.startTime} required>
            <Input
              id="startTime"
              type="time"
              value={values.startTime}
              onChange={(e) => update('startTime', e.target.value)}
              aria-invalid={Boolean(errors.startTime)}
            />
          </Field>
          <Field label="Дуусах цаг" htmlFor="endTime" error={errors.endTime} required>
            <Input
              id="endTime"
              type="time"
              value={values.endTime}
              onChange={(e) => update('endTime', e.target.value)}
              aria-invalid={Boolean(errors.endTime)}
            />
          </Field>
        </div>

        <Field label="Байршил" htmlFor="location" error={errors.location} required>
          <Input
            id="location"
            value={values.location}
            placeholder="1-р спорт заал"
            onChange={(e) => update('location', e.target.value)}
            aria-invalid={Boolean(errors.location)}
          />
        </Field>

        <Field label="Тайлбар" htmlFor="note" error={errors.note}>
          <Textarea id="note" value={values.note} onChange={(e) => update('note', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}

export function AddSessionButton({
  groups,
  defaultDate,
}: {
  groups: { id: string; name: string }[]
  defaultDate?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={groups.length === 0}>
        <Plus size={18} aria-hidden />
        Бэлтгэл нэмэх
      </Button>
      {open && (
        <SessionFormModal
          open={open}
          onClose={() => setOpen(false)}
          groups={groups}
          initialValues={defaultDate ? { date: defaultDate } : undefined}
        />
      )}
    </>
  )
}
