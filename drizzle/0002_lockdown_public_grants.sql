-- ============================================================================
-- public schema-г Data API-ийн дүрүүдээс хаах
-- ============================================================================
-- Энэ апп Supabase Data API (PostgREST) ашигладаггүй — сервер нь шууд
-- PostgreSQL холболтоор `postgres` дүрээр ажилладаг. Тиймээс PostgREST-ийн
-- `anon` / `authenticated` дүрүүдэд public schema-д хандах шаардлага байхгүй.
-- Supabase анхдагчаар эдгээрт БҮХ хүснэгтэд бүрэн DML эрх өгдөг тул хураана.
--
-- ХАМРАХ ХҮРЭЭ: зөвхөн `public` schema, зөвхөн ЭНЭ ХЭРЭГЛЭГЧИЙН ЭЗЭМШДЭГ обьект.
--   Supabase-ийн системийн schema (auth, storage, realtime, graphql,
--   graphql_public, extensions, vault, cron г.м.) болон extension-үүдийг
--   огт хөндөхгүй. Өөр эзэнтэй обьект байвал алгасна — ингэснээр
--   "permission denied" гарч бүх migration унахаас сэргийлнэ.
--
-- АППАД НӨЛӨӨЛӨХГҮЙ: апп `postgres` дүрээр холбогддог ба хүснэгтүүдийн
--   эзэмшигч нь өөрөө. Эзэмшигчийн эрх GRANT-аар өгөгддөггүй тул REVOKE
--   түүнд хамаарахгүй.
--
-- service_role-г САНААТАЙГААР хөндөөгүй — зөвхөн серверийн нууц түлхүүрээр
--   ашиглагддаг, HTTP-ээр нээлттэй биш.
--
-- ДАХИН АЖИЛЛУУЛАХАД АЮУЛГҮЙ (идемпотент). Дүр байхгүй орчинд (локал
--   PostgreSQL, PGlite тест) anon/authenticated-ийн хэсэг алгасагдана;
--   PUBLIC-ийн хэсэг хаана ч ажиллана.
-- ============================================================================

DO $$
DECLARE
  grantee   text;
  obj       record;
  me        oid := (SELECT oid FROM pg_roles WHERE rolname = current_user);
  grantees  text[] := ARRAY['anon', 'authenticated', 'PUBLIC'];
BEGIN
  FOREACH grantee IN ARRAY grantees LOOP
    -- PUBLIC бол үргэлж байдаг; нэрлэсэн дүр байхгүй бол алгасна
    IF grantee <> 'PUBLIC'
       AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = grantee) THEN
      CONTINUE;
    END IF;

    -- 1. Хүснэгт / view / materialized view / partition / foreign table
    --    (баганы түвшний GRANT-ууд ч үүнд хамт хураагдана)
    FOR obj IN
      SELECT c.oid::regclass AS ref
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
        AND c.relowner = me
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s', obj.ref, grantee);
    END LOOP;

    -- 2. Sequence
    FOR obj IN
      SELECT c.oid::regclass AS ref
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relowner = me
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %s', obj.ref, grantee);
    END LOOP;

    -- 3. Function / procedure
    FOR obj IN
      SELECT p.oid::regprocedure AS ref
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proowner = me
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %s', obj.ref, grantee);
    END LOOP;

    -- 4. Ирээдүйд ЭНЭ ХЭРЭГЛЭГЧИЙН үүсгэх обьектод эрх автоматаар очихыг зогсооно.
    --    ЖИЧ: өөр дүрийн (жишээ нь supabase_admin) default privileges-т хүрэхгүй —
    --    доорх "Үлдэх эрсдэл"-ийг үзнэ үү.
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %s', grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %s', grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %s', grantee);

    -- 5. Schema дээр ШУУД олгосон эрхийг хураана.
    --    PUBLIC-ийн USAGE-ийг САНААТАЙГААР үлдээв: Supabase-ийн дотоод дүрүүдэд
    --    (backup, read-only, monitoring, dashboard) нөлөөлж болзошгүй бөгөөд
    --    обьектын эрхгүйгээр schema USAGE дангаараа өгөгдөлд хандуулахгүй.
    --    Тиймээс `has_schema_privilege('anon','public','USAGE')` энэ хойно ч
    --    TRUE гэж хариулна — энэ нь хүлээгдсэн зүйл.
    IF grantee = 'PUBLIC' THEN
      EXECUTE 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
    ELSE
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', grantee);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- PUBLIC-ийн функц дээрх далд EXECUTE
-- ---------------------------------------------------------------------------
-- PostgreSQL шинэ FUNCTION бүрд PUBLIC-д EXECUTE-ийг ДАЛД байдлаар өгдөг.
-- Энэ нь schema-д хамааралгүй тул `ALTER DEFAULT PRIVILEGES IN SCHEMA public`
-- хэлбэр ҮР ДҮНГҮЙ (хэмжиж баталсан: шинэ функцийн proacl = (default),
-- anon EXECUTE = true). Зөвхөн schema заахгүй хэлбэр нь ажиллана:
--   шинэ функцийн proacl = postgres=X/postgres, anon EXECUTE = false.
--
-- Хамрах хүрээ: зөвхөн ЭНЭ дүрийн (postgres) үүсгэх функцүүд. Supabase-ийн
-- системийн обьектуудыг supabase_admin үүсгэдэг тул тэдэнд нөлөөлөхгүй.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- ҮЛДЭХ ЭРСДЭЛ (энэ migration хаахгүй зүйлс)
-- ---------------------------------------------------------------------------
-- 1. `supabase_admin`-ийн эзэмшлийн default privileges нь public schema-д
--    хэвээр үлдэнэ. `postgres` түүнийг өөрчлөх эрхгүй. Хэрэв ирээдүйд платформ
--    өөрөө public-д обьект үүсгэвэл anon/authenticated дахин эрх авна.
-- 2. `service_role` бүх хүснэгтэд эрхтэй хэвээр (санаатай). Data API унтарсан
--    үед HTTP-ээр хүрэх зам байхгүй.
-- 3. Data API-г дахин асаах, эсвэл Supabase платформын шинэчлэлт нь
--    `grant all ... to anon, authenticated` -ийг дахин тавьж болно.
--    Тиймээс `npm run db:grants -- --strict` -ийг тогтмол ажиллуулна.
