-- Бизнес дүрмийг өгөгдлийн сангийн түвшинд баталгаажуулах шалгалтууд

ALTER TABLE "users"
  ADD CONSTRAINT "users_role_chk" CHECK ("role" IN ('admin', 'parent'));--> statement-breakpoint

ALTER TABLE "students"
  ADD CONSTRAINT "students_status_chk" CHECK ("status" IN ('active', 'inactive'));--> statement-breakpoint

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_status_chk"
  CHECK ("status" IN ('planned', 'completed', 'cancelled'));--> statement-breakpoint

-- Дуусах цаг эхлэх цагаас хойш байх ёстой
ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_time_chk" CHECK ("end_time" > "start_time");--> statement-breakpoint

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_status_chk"
  CHECK ("status" IN ('present', 'absent', 'excused'));--> statement-breakpoint

-- Зөвхөн "Ирсэн" бүртгэл эрх ашиглана
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_credit_chk"
  CHECK ("credit_consumed" = false OR "status" = 'present');--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_status_chk" CHECK ("status" IN ('valid', 'void'));--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0);--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_credits_chk" CHECK ("credits_granted" > 0);--> statement-breakpoint

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_month_chk"
  CHECK ("coverage_month" BETWEEN 1 AND 12 AND "coverage_year" BETWEEN 2000 AND 2100);--> statement-breakpoint

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_audience_chk"
  CHECK ("audience_type" IN ('all', 'group', 'student'));
