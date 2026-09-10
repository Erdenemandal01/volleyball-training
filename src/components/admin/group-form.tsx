'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Modal, Textarea } from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'

type GroupValues = { name: string; description: string; isActive: boolean }

function GroupModal({
  open,
  onClose,
  mode,
  groupId,
  initialValues,
}: {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  groupId?: string
  initialValues?: GroupValues
}) {
  const router = useRouter()
  const [values, setValues] = useState<GroupValues>(
    initialValues ?? { name: '', description: '', isActive: true },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)
    try {
      if (mode === 'create') {
        await api.post('/api/admin/groups', {
          name: values.name,
          description: values.description || null,
        })
      } else {
        await api.patch(`/api/admin/groups/${groupId}`, {
          name: values.name,
          description: values.description || null,
          isActive: values.isActive,
        })
      }
      router.refresh()
      onClose()
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {})
        if (!error.fieldErrors) setFormError(error.message)
      } else {
        setFormError('Хадгалахад алдаа гарлаа.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Бүлэг үүсгэх' : 'Бүлэг засах'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Болих
          </Button>
          <Button type="submit" form="group-form" loading={submitting}>
            Хадгалах
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <ErrorNote message={formError} />}
        <Field label="Бүлгийн нэр" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
        </Field>
        <Field label="Тайлбар" htmlFor="description" error={errors.description}>
          <Textarea
            id="description"
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
        </Field>
        {mode === 'edit' && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-[var(--color-line-strong)]"
              checked={values.isActive}
              onChange={(e) => setValues((v) => ({ ...v, isActive: e.target.checked }))}
            />
            Идэвхтэй бүлэг
          </label>
        )}
      </form>
    </Modal>
  )
}

export function AddGroupButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={18} aria-hidden />
        Бүлэг үүсгэх
      </Button>
      {open && <GroupModal open={open} onClose={() => setOpen(false)} mode="create" />}
    </>
  )
}

export function EditGroupButton({ group }: { group: GroupValues & { id: string } }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={16} aria-hidden />
        Засах
      </Button>
      {open && (
        <GroupModal
          open={open}
          onClose={() => setOpen(false)}
          mode="edit"
          groupId={group.id}
          initialValues={{
            name: group.name,
            description: group.description,
            isActive: group.isActive,
          }}
        />
      )}
    </>
  )
}
