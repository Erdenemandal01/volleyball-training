import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Хэрэглэгч ба session                                                */
/* ------------------------------------------------------------------ */

export type UserRole = 'admin' | 'parent'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: text('role').$type<UserRole>().notNull(),
    /** Зөвхөн админд */
    email: text('email'),
    /** Зөвхөн эцэг эхэд — normalize хийсэн 8 оронтой дугаар */
    phone: text('phone'),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    /** Түр код олгосны дараа эхний нэвтрэлтэд заавал солино */
    mustChangePassword: boolean('must_change_password').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_uq').on(t.email),
    phoneIdx: uniqueIndex('users_phone_uq').on(t.phone),
  }),
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => ({
    tokenIdx: uniqueIndex('auth_sessions_token_uq').on(t.tokenHash),
    userIdx: index('auth_sessions_user_idx').on(t.userId),
  }),
)

/** Нэвтрэх оролдлогын rate limit */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ keyIdx: index('login_attempts_key_idx').on(t.key, t.createdAt) }),
)

/* ------------------------------------------------------------------ */
/* Бүлэг, сурагч                                                       */
/* ------------------------------------------------------------------ */

export const trainingGroups = pgTable(
  'training_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ nameIdx: uniqueIndex('training_groups_name_uq').on(t.name) }),
)

export type StudentStatus = 'active' | 'inactive'

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    /** Бүртгүүлсэн огноо — date-only, цагийн бүсээс хамаарахгүй */
    registeredAt: date('registered_at', { mode: 'string' }).notNull(),
    status: text('status').$type<StudentStatus>().notNull().default('active'),
    /** Зөвхөн админд харагдана */
    adminNote: text('admin_note'),
    currentGroupId: uuid('current_group_id').references(() => trainingGroups.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index('students_group_idx').on(t.currentGroupId),
    nameIdx: index('students_name_idx').on(t.fullName),
  }),
)

export const parentStudents = pgTable(
  'parent_students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('parent_students_uq').on(t.parentUserId, t.studentId),
    studentIdx: index('parent_students_student_idx').on(t.studentId),
  }),
)

/** Бүлэг солих түүх */
export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => trainingGroups.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({ studentIdx: index('group_memberships_student_idx').on(t.studentId) }),
)

/** Идэвхтэй / идэвхгүй болгосон түүх */
export const studentStatusHistory = pgTable('student_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  status: text('status').$type<StudentStatus>().notNull(),
  reason: text('reason'),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------------------------------------------ */
/* Бэлтгэл                                                             */
/* ------------------------------------------------------------------ */

export type SessionStatus = 'planned' | 'completed' | 'cancelled'

export const trainingSessions = pgTable(
  'training_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => trainingGroups.id, { onDelete: 'restrict' }),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    location: text('location').notNull(),
    note: text('note'),
    status: text('status').$type<SessionStatus>().notNull().default('planned'),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dateIdx: index('training_sessions_date_idx').on(t.date),
    groupIdx: index('training_sessions_group_idx').on(t.groupId, t.date),
  }),
)

/** Бэлтгэлийн roster snapshot — сурагч бүлэг солиход өөрчлөгдөхгүй */
export const sessionParticipants = pgTable(
  'session_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('session_participants_uq').on(t.sessionId, t.studentId),
    studentIdx: index('session_participants_student_idx').on(t.studentId),
  }),
)

/* ------------------------------------------------------------------ */
/* Ирц                                                                 */
/* ------------------------------------------------------------------ */

export type AttendanceStatus = 'present' | 'absent' | 'excused'

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => trainingSessions.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').$type<AttendanceStatus>().notNull(),
    /** Эрх ашигласан эсэх — эрхийн тооцооны цорын ганц эх сурвалж */
    creditConsumed: boolean('credit_consumed').notNull().default(false),
    markedBy: uuid('marked_by').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex('attendance_session_student_uq').on(t.sessionId, t.studentId),
    studentIdx: index('attendance_student_idx').on(t.studentId),
  }),
)

export const attendanceHistory = pgTable('attendance_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => trainingSessions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status').$type<AttendanceStatus | null>(),
  toStatus: text('to_status').$type<AttendanceStatus | null>(),
  creditDelta: integer('credit_delta').notNull().default(0),
  reason: text('reason'),
  changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------------------------------------------ */
/* Төлбөр                                                              */
/* ------------------------------------------------------------------ */

export type PaymentStatus = 'valid' | 'void'

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** Төлсөн огноо — date-only */
    paidAt: date('paid_at', { mode: 'string' }).notNull(),
    /** Хамрах он/сар — төлсөн огноотой тусдаа утга */
    coverageYear: integer('coverage_year').notNull(),
    coverageMonth: integer('coverage_month').notNull(),
    amount: integer('amount').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    note: text('note'),
    status: text('status').$type<PaymentStatus>().notNull().default('valid'),
    voidReason: text('void_reason'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idemIdx: uniqueIndex('payments_idempotency_uq').on(t.idempotencyKey),
    studentIdx: index('payments_student_idx').on(t.studentId),
    coverageIdx: index('payments_coverage_idx').on(t.coverageYear, t.coverageMonth),
  }),
)

/* ------------------------------------------------------------------ */
/* Харилцаа                                                            */
/* ------------------------------------------------------------------ */

export type AnnouncementAudience = 'all' | 'group' | 'student'

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audienceType: text('audience_type').$type<AnnouncementAudience>().notNull(),
  groupId: uuid('group_id').references(() => trainingGroups.id, { onDelete: 'set null' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
})

/** Нийтлэх үед хөлдөөсөн хүлээн авагчийн жагсаалт */
export const announcementRecipients = pgTable(
  'announcement_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('announcement_recipients_uq').on(t.announcementId, t.parentUserId),
    parentIdx: index('announcement_recipients_parent_idx').on(t.parentUserId),
  }),
)

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: uniqueIndex('conversations_parent_uq').on(t.parentUserId) }),
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderRole: text('sender_role').$type<UserRole>().notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    clientKey: text('client_key'),
  },
  (t) => ({
    convIdx: index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    clientIdx: uniqueIndex('messages_client_key_uq').on(t.clientKey),
  }),
)

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ entityIdx: index('audit_logs_entity_idx').on(t.entityType, t.entityId) }),
)
