-- ============================================================================
-- public schema-г Data API-ийн дүрүүдээс хаах
-- ============================================================================
-- Энэ апп Supabase Data API (PostgREST) ашигладаггүй — сервер нь шууд
-- PostgreSQL холболтоор `postgres` дүрээр ажилладаг. Тиймээс PostgREST-ийн
-- `anon` / `authenticated` дүрүүдэд public schema-д хандах шаардлага байхгүй.
-- Supabase анхдагчаар эдгээрт БҮХ хүснэгтэд бүрэн DML эрх өгдөг тул хураана.
--
-- ХАМРАХ ХҮРЭЭ (яг тодорхой):
--   • Зөвхөн `public` schema. Бүх `ALTER DEFAULT PRIVILEGES` нь `IN SCHEMA public`
--     гэсэн заалттай — өөр schema-д нөлөөлөх database-wide мөр үүсгэхгүй.
--   • Зөвхөн ЭНЭ ХЭРЭГЛЭГЧИЙН ЭЗЭМШДЭГ обьект (`relowner`/`proowner` = current_user).
--     Өөр эзэнтэй обьектыг алгасна — ингэснээр "permission denied" гарч бүх
--     migration унахаас сэргийлнэ.
--   • Зөвхөн `anon`, `authenticated`, `PUBLIC` гэсэн гурван grantee.
--   • Supabase-ийн системийн schema (auth, storage, realtime, graphql,
--     graphql_public, extensions, vault, cron г.м.), extension болон
--     платформын эзэмшдэг обьектыг ОГТ хөндөхгүй.
--
-- АППАД НӨЛӨӨЛӨХГҮЙ: апп `postgres` дүрээр холбогддог ба хүснэгтүүдийн
--   эзэмшигч нь өөрөө. Эзэмшигчийн эрх GRANT-аар өгөгддөггүй тул REVOKE
--   түүнд хамаарахгүй.
--
-- service_role-г САНААТАЙГААР хөндөөгүй — түүний PostgreSQL эрх бүрэн хэвээр
--   үлдэнэ (доорх "ҮЛДЭХ ЭРСДЭЛ"-ийг үз).
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
END $$;

-- ---------------------------------------------------------------------------
-- ҮЛДЭХ ЭРСДЭЛ (энэ migration ЗОРИУД хаахгүй зүйлс)
-- ---------------------------------------------------------------------------
-- 1. ИРЭЭДҮЙН ФУНКЦИЙН PUBLIC EXECUTE.
--    PostgreSQL шинэ FUNCTION бүрд PUBLIC-д EXECUTE-ийг ДАЛД өгдөг. Үүнийг
--    урьдчилан хаахын тулд `ALTER DEFAULT PRIVILEGES` -ийг schema ЗААХГҮЙГЭЭР
--    ажиллуулах шаардлагатай бөгөөд тэр нь энэ дүрийн БҮХ SCHEMA-д үүсгэх
--    функцэд нөлөөлнө (хэмжиж баталсан: pg_default_acl-д defaclnamespace = 0
--    мөр үүсч, other_schema дахь функц ч мөн хамрагдана).
--    Энэ migration-ы амласан хамрах хүрээ (зөвхөн public) -тэй зөрчилдөх тул
--    ОРУУЛААГҮЙ. Одоогоор public schema-д функц 0 ширхэг байгаа бөгөөд апп
--    функц үүсгэдэггүй (Drizzle зөвхөн хүснэгт/индекс/constraint үүсгэнэ).
--    ХЭРЭВ ирээдүйд public-д функц нэмбэл тухайн функц дээр нь шууд:
--        REVOKE EXECUTE ON FUNCTION public.<нэр>(...) FROM PUBLIC;
--    `npm run db:grants -- --strict` нь ийм функцийг илрүүлж exit 1 буцаана.
--
-- 2. `supabase_admin`-ийн эзэмшлийн default privileges нь public schema-д
--    хэвээр үлдэнэ. `postgres` түүнийг өөрчлөх эрхгүй. Хэрэв платформ өөрөө
--    public-д обьект үүсгэвэл anon/authenticated тэр обьектод эрх авна.
--
-- 3. `service_role` нь бүх хүснэгтэд эрхтэй, `rolbypassrls = true` хэвээр
--    (санаатай). Энэ migration түүнийг хөндөхгүй.
--
-- 4. Энэ migration нь PostgreSQL-ийн ЭРХИЙГ өөрчилнө. Supabase Dashboard дахь
--    "Enable Data API" унтраалга бол ТУСДАА давхарга: PostgREST үйлчилгээ
--    ажиллаж, HTTP-ээр нээлттэй эсэхийг шийднэ. Хоёулаа бие даасан.
--    Data API-г дахин асаах нь энд хураасан эрхийг БУЦААХГҮЙ — PostgREST
--    ажиллах боловч anon/authenticated-д обьектын эрх байхгүй тул хүсэлт
--    "permission denied" болно. Харин эрхийг гараар дахин GRANT хийвэл
--    (эсвэл платформ ямар нэг байдлаар GRANT ажиллуулбал) хандалт сэргэнэ.
--    Тиймээс `npm run db:grants -- --strict` -ийг тогтмол ажиллуулна.
