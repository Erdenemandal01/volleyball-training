import { z } from 'zod'
import { normalizePhone } from './phone'

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноог зөв сонгоно уу')

const timeOnly = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Цагийг зөв сонгоно уу')
  .transform((v) => (v.length === 5 ? `${v}:00` : v))

export const phoneSchema = z
  .string()
  .min(1, 'Утасны дугаараа оруулна уу')
  .refine((v) => normalizePhone(v) !== null, 'Монголын 8 оронтой дугаар оруулна уу')

export const adminLoginSchema = z.object({
  email: z.string().min(1, 'И-мэйлээ оруулна уу').email('И-мэйл хаяг буруу байна'),
  password: z.string().min(1, 'Нууц үгээ оруулна уу'),
})

export const parentLoginSchema = z.object({
  phone: phoneSchema,
  code: z.string().min(1, 'Нууц кодоо оруулна уу'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Одоогийн кодоо оруулна уу'),
    newPassword: z
      .string()
      .min(6, 'Шинэ код дор хаяж 6 тэмдэгт байна')
      .max(72, 'Шинэ код хэт урт байна'),
    confirmPassword: z.string().min(1, 'Кодоо давтан оруулна уу'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Код таарахгүй байна',
  })

export const studentCreateSchema = z.object({
  fullName: z.string().trim().min(2, 'Нэрээ бүтнээр нь оруулна уу').max(120),
  registeredAt: dateOnly,
  groupId: z.string().uuid('Бүлгээ сонгоно уу').nullable().optional(),
  parentPhone: phoneSchema,
  parentName: z.string().trim().max(120).optional().nullable(),
  adminNote: z.string().trim().max(1000).optional().nullable(),
})

export const studentUpdateSchema = studentCreateSchema

export const studentStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
  reason: z.string().trim().max(300).optional().nullable(),
})

export const groupCreateSchema = z.object({
  name: z.string().trim().min(2, 'Бүлгийн нэрийг оруулна уу').max(80),
  description: z.string().trim().max(500).optional().nullable(),
})

export const groupUpdateSchema = groupCreateSchema.extend({
  isActive: z.boolean().default(true),
})

export const sessionCreateSchema = z
  .object({
    groupId: z.string().uuid('Бүлгээ сонгоно уу'),
    date: dateOnly,
    startTime: timeOnly,
    endTime: timeOnly,
    location: z.string().trim().min(1, 'Байршлаа оруулна уу').max(160),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((data) => data.endTime > data.startTime, {
    path: ['endTime'],
    message: 'Дуусах цаг эхлэх цагаас хойш байх ёстой',
  })

export const sessionCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Цуцлах шалтгаанаа бичнэ үү').max(300),
})

export const attendanceSetSchema = z.object({
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: z.enum(['present', 'absent', 'excused']).nullable(),
})

export const paymentCreateSchema = z.object({
  studentId: z.string().uuid('Сурагчаа сонгоно уу'),
  paidAt: dateOnly,
  coverageYear: z.number().int().min(2000).max(2100),
  coverageMonth: z.number().int().min(1).max(12),
  amount: z
    .number({ invalid_type_error: 'Дүнг тоогоор оруулна уу' })
    .int('Бүхэл тоо оруулна уу')
    .positive('Дүн 0-ээс их байна'),
  creditsGranted: z
    .number({ invalid_type_error: 'Оролтын тоог оруулна уу' })
    .int('Бүхэл тоо оруулна уу')
    .positive('Оролтын тоо 0-ээс их байна')
    .max(200, 'Хэт олон байна'),
  note: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().min(8).max(100).optional().nullable(),
})

export const paymentUpdateSchema = paymentCreateSchema
  .omit({ studentId: true, idempotencyKey: true })
  .extend({
    reason: z.string().trim().min(3, 'Засварын шалтгаанаа бичнэ үү').max(300),
  })

export const paymentVoidSchema = z.object({
  reason: z.string().trim().min(3, 'Шалтгаанаа бичнэ үү').max(300),
})

export const announcementCreateSchema = z
  .object({
    title: z.string().trim().min(2, 'Гарчгаа оруулна уу').max(160),
    body: z.string().trim().min(2, 'Мэдээллээ бичнэ үү').max(4000),
    audienceType: z.enum(['all', 'group', 'student']),
    groupId: z.string().uuid().nullable().optional(),
    studentId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.audienceType !== 'group' || !!d.groupId, {
    path: ['groupId'],
    message: 'Бүлгээ сонгоно уу',
  })
  .refine((d) => d.audienceType !== 'student' || !!d.studentId, {
    path: ['studentId'],
    message: 'Сурагчаа сонгоно уу',
  })

export const messageSendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Зурвасаа бичнэ үү').max(2000),
  clientKey: z.string().min(8).max(100).optional().nullable(),
})
