-- ============================================================
-- public schema-ийн эрхийг БУЦААХ SQL (автоматаар үүсгэсэн)
-- ============================================================
-- Хэмжсэн: 2026-09-11T06:14:36.120Z
-- Database: postgres   (уншсан дүр: postgres)
-- Хамрах grantee: anon, authenticated, PUBLIC
--
-- Энэ файл нь 0002_lockdown_public_grants.sql -ийг ажиллуулахын ӨМНӨХ
-- БОДИТ төлөвийг сэргээнэ. Ерөнхий `GRANT ALL` ашигладаггүй — зөвхөн
-- хэмжсэн эрхүүдийг нэг бүрчлэн буцаана.
--
-- ХАМРАХ ХҮРЭЭ: зөвхөн "postgres" дүрийн нэрээр дахин олгож ЧАДАХ эрхүүд
-- (обьектын эзэн нь өөрөө, эсвэл түүний гишүүн байх дүр). Migration ч
-- яг тэр хүрээг хөнддөг тул бусдыг сэргээх шаардлагагүй; түүнчлэн өөр
-- дүрийн default privileges-ийг өөрчлөхийг оролдвол "permission denied
-- to change default privileges" алдаа гарч буцаалт дунд замдаа зогсоно.
-- Эзэн нь өөр дүр байвал grantor-ыг ЯГ сэргээхийн тулд `SET ROLE`-оор
-- шилжинэ (жишээ нь public schema-ийн эзэн `pg_database_owner`).
--
-- АНХААР: үүнийг ажиллуулах нь Data API-ийн дүрүүдэд public schema-г
-- дахин нээнэ. Зөвхөн санаатайгаар, шаардлагатай үед ажиллуулна.

SET ROLE "pg_database_owner";
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO "anon";
GRANT USAGE ON SCHEMA public TO "authenticated";
RESET ROLE;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."announcement_recipients" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."announcement_recipients" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."announcements" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."announcements" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."attendance_history" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."attendance_history" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."attendance" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."attendance" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."audit_logs" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."audit_logs" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."auth_sessions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."auth_sessions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."conversations" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."conversations" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."group_memberships" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."group_memberships" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."login_attempts" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."login_attempts" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."messages" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."messages" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."parent_students" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."parent_students" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."payments" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."payments" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."session_participants" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."session_participants" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."student_status_history" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."student_status_history" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."students" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."students" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."training_groups" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."training_groups" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."training_sessions" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."training_sessions" TO "authenticated";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."users" TO "anon";
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public."users" TO "authenticated";

-- Default privileges (ирээдүйд үүсэх обьектод)
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";

-- ------------------------------------------------------------
-- ЭНЭ БУЦААЛТАД ОРООГҮЙ (migration ч тэдгээрийг хөндөөгүй)
-- ------------------------------------------------------------
--   DEFAULT PRIVILEGES (FUNCTIONS) → anon (EXECUTE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (FUNCTIONS) → authenticated (EXECUTE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → anon (SELECT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → anon (UPDATE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → anon (USAGE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → authenticated (SELECT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → authenticated (UPDATE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (SEQUENCES) → authenticated (USAGE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (DELETE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (INSERT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (MAINTAIN); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (REFERENCES); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (SELECT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (TRIGGER); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (TRUNCATE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → anon (UPDATE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (DELETE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (INSERT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (MAINTAIN); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (REFERENCES); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (SELECT); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (TRIGGER); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (TRUNCATE); эзэмшигч: supabase_admin
--   DEFAULT PRIVILEGES (TABLES) → authenticated (UPDATE); эзэмшигч: supabase_admin
