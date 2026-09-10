import type { AttendanceStatus, SessionStatus, StudentStatus } from '@/db/schema'

export const ATTENDANCE_LABEL: Record<AttendanceStatus | 'unmarked' | 'na', string> = {
  present: 'Ирсэн',
  absent: 'Тасалсан',
  excused: 'Чөлөөтэй',
  unmarked: 'Бүртгээгүй',
  na: 'Хамаарахгүй',
}

/** Төлөвийг зөвхөн өнгөөр биш, тэмдэгтээр бас ялгана */
export const ATTENDANCE_MARK: Record<AttendanceStatus | 'unmarked' | 'na', string> = {
  present: '✓',
  absent: '×',
  excused: 'Ч',
  unmarked: '—',
  na: '·',
}

export const ATTENDANCE_TONE: Record<
  AttendanceStatus | 'unmarked' | 'na',
  'success' | 'danger' | 'warning' | 'neutral'
> = {
  present: 'success',
  absent: 'danger',
  excused: 'warning',
  unmarked: 'neutral',
  na: 'neutral',
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  planned: 'Төлөвлөсөн',
  completed: 'Дууссан',
  cancelled: 'Цуцлагдсан',
}

export const SESSION_STATUS_TONE: Record<SessionStatus, 'info' | 'success' | 'danger'> = {
  planned: 'info',
  completed: 'success',
  cancelled: 'danger',
}

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  active: 'Идэвхтэй',
  inactive: 'Идэвхгүй',
}

export const AUDIENCE_LABEL = {
  all: 'Бүх идэвхтэй эцэг эх',
  group: 'Сонгосон бүлэг',
  student: 'Нэг сурагчийн эцэг эх',
} as const
