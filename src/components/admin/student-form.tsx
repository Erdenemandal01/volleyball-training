'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  Button,
  ErrorNote,
  Field,
  Input,
  Modal,
  Select,
  SuccessNote,
  Textarea,
} from '@/components/ui'
import { RequestError, api } from '@/lib/client-api'
import { todayInUb } from '@/lib/date'

export type GroupOption = { id: string; name: string }

export type StudentFormValues = {
  fullName: string
  registeredAt: string
  groupId: string
  parentPhone: string
  parentName: string
  adminNote: string
}

const emptyValues = (): StudentFormValues => ({
  fullName: '',
  registeredAt: todayInUb(),
  groupId: '',
  parentPhone: '',
  parentName: '',
  adminNote: '',
})

export function StudentFormModal({
  open,
  onClose,
  groups,
  mode,
  studentId,
  initialValues,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  groups: GroupOption[]
  mode: 'create' | 'edit'
  studentId?: string
  initialValues?: StudentFormValues
  onSaved?: () => void
}) {
  const router = useRouter()
  const [values, setValues] = useState<StudentFormValues>(initialValues ?? emptyValues())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [temporaryCode, setTemporaryCode] = useState<string | null>(null)

  function update<K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function close() {
    setTemporaryCode(null)
    setErrors({})
    setFormError(null)
    onClose()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    const payload = {
      fullName: values.fullName,
      registeredAt: values.registeredAt,
      groupId: values.groupId || null,
      parentPhone: values.parentPhone,
      parentName: values.parentName || null,
      adminNote: values.adminNote || null,
    }

    try {
      const result =
        mode === 'create'
          ? await api.post<{ temporaryCode: string | null }>('/api/admin/students', payload)
          : await api.patch<{ temporaryCode: string | null }>(
              `/api/admin/students/${studentId}`,
              payload,
            )

      router.refresh()
      onSaved?.()

      if (result.temporaryCode) {
        setTemporaryCode(result.temporaryCode)
        setValues(emptyValues())
      } else {
        close()
      }
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

  if (temporaryCode) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="Эцэг эхийн түр код"
        footer={<Button onClick={close}>Ойлголоо</Button>}
      >
        <SuccessNote message="Сурагч амжилттай бүртгэгдлээ." />
        <div className="mt-4 rounded-[12px] border border-[var(--color-line)] bg-slate-50 p-4">
          <p className="text-sm text-[var(--color-muted)]">Түр нууц код</p>
          <p className="mt-1 font-mono text-3xl font-semibold tracking-widest text-[var(--color-ink)]">
            {temporaryCode}
          </p>
        </div>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Энэ кодыг эцэг эхэд өөрийн сувгаар дамжуулна уу. Тэд эхний нэвтрэлтээр кодоо солино.
          Код дахин харагдахгүй тул одоо тэмдэглэж авна уу.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={mode === 'create' ? 'Шинэ сурагч нэмэх' : 'Сурагчийн мэдээлэл засах'}
      description={
        mode === 'create'
          ? 'Утасны дугаараар эцэг эхийн бүртгэл байвал автоматаар холбогдоно.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} type="button">
            Болих
          </Button>
          <Button type="submit" form="student-form" loading={submitting}>
            {mode === 'create' ? 'Бүртгэх' : 'Хадгалах'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <ErrorNote message={formError} />}

        <Field label="Сурагчийн нэр" htmlFor="fullName" error={errors.fullName} required>
          <Input
            id="fullName"
            value={values.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            aria-invalid={Boolean(errors.fullName)}
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Бүртгүүлсэн огноо" htmlFor="registeredAt" error={errors.registeredAt} required>
            <Input
              id="registeredAt"
              type="date"
              value={values.registeredAt}
              onChange={(e) => update('registeredAt', e.target.value)}
              aria-invalid={Boolean(errors.registeredAt)}
            />
          </Field>

          <Field label="Сургалтын бүлэг" htmlFor="groupId" error={errors.groupId}>
            <Select
              id="groupId"
              value={values.groupId}
              onChange={(e) => update('groupId', e.target.value)}
            >
              <option value="">Бүлэг сонгоогүй</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Эцэг эхийн утас"
            htmlFor="parentPhone"
            error={errors.parentPhone}
            hint="8 оронтой дугаар. Ижил дугаартай бол одоо байгаа бүртгэлд холбогдоно."
            required
          >
            <Input
              id="parentPhone"
              type="tel"
              inputMode="numeric"
              placeholder="99112233"
              value={values.parentPhone}
              onChange={(e) => update('parentPhone', e.target.value)}
              aria-invalid={Boolean(errors.parentPhone)}
            />
          </Field>

          <Field label="Эцэг эхийн нэр" htmlFor="parentName" error={errors.parentName}>
            <Input
              id="parentName"
              value={values.parentName}
              onChange={(e) => update('parentName', e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Админы тайлбар"
          htmlFor="adminNote"
          error={errors.adminNote}
          hint="Зөвхөн админд харагдана. Эцэг эхэд харагдахгүй."
        >
          <Textarea
            id="adminNote"
            value={values.adminNote}
            onChange={(e) => update('adminNote', e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  )
}

export function AddStudentButton({ groups }: { groups: GroupOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={18} aria-hidden />
        Сурагч нэмэх
      </Button>
      {open && (
        <StudentFormModal open={open} onClose={() => setOpen(false)} groups={groups} mode="create" />
      )}
    </>
  )
}
