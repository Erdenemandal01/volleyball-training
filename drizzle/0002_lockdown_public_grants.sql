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
--   • Зөвхөн ЭНЭ ДҮРИЙН НЭРЭЭР ХУРААЖ ЧАДАХ обьект, өөрөөр хэлбэл эзэмшигч нь
--     өөрөө, эсвэл түүний нэрээр ажиллаж чадах дүр (`pg_has_role(current_user,
--     relowner, 'USAGE')`). Энэ нь ЭЗЭМШЛИЙГ шууд харьцуулахаас илүү зөв:
--     `public` schema-ийн эзэн нь `pg_database_owner` бөгөөд өгөгдлийн сангийн
--     эзэн түүний ДАЛД гишүүн байдаг (production дээр хэмжиж баталсан).
--     Хүрч чадахгүй обьектыг алгасаад, төгсгөлд нь WARNING-аар мэдээлнэ.
--     ЖИЧ: PostgreSQL-д өөрийн бус обьект дээр REVOKE хийхэд "permission
--     denied" ГАРАХГҮЙ — зөвхөн "no privileges could be revoked" WARNING өгөөд
--     амжилттай дуусдаг (жинхэнэ PostgreSQL 17 дээр хэмжсэн). Тиймээс
--     хязгаарлалтын шалтгаан нь "унахаас сэргийлэх" БИШ, харин хамрах хүрээг
--     тодорхой болгож, доорх пост-шалгалтыг утга төгөлдөр болгох явдал.
--   • Зөвхөн `anon`, `authenticated`, `PUBLIC` гэсэн гурван grantee.
--   • Supabase-ийн системийн schema (auth, storage, realtime, graphql,
--     graphql_public, extensions, vault, cron г.м.), extension болон
--     платформын эзэмшдэг обьектыг ОГТ хөндөхгүй.
--
-- АППАД НӨЛӨӨЛӨХГҮЙ, ГЭХДЭЭ ЯАГААД гэдэг нь чухал:
--   Апп `postgres` дүрээр холбогдоно. Түүний хандалт хадгалагдах ШАЛТГААН нь
--   дээрх `grantees` жагсаалтад `postgres` ОРООГҮЙ явдал — эзэмшил ӨӨРӨӨ БИШ.
--   Түгээмэл буруу ойлголтыг жинхэнэ PostgreSQL 17 дээр хэмжиж няцаав:
--       ACL:  {app_pg=arwdDxtm/app_pg, service_role=arwdDxtm/app_pg}
--       REVOKE ALL ON TABLE public.users FROM app_pg, service_role;
--       →  ACL: {}   эзэмшигч: app_pg (хэвээр)
--          has_table_privilege('app_pg', ..., 'SELECT') = false
--          select count(*) from public.users  →  ERROR: permission denied
--   Өөрөөр хэлбэл ЭЗЭМШИЛ нь GRANT/REVOKE/ALTER/DROP хийх ЭРХ өгдөг ч,
--   ӨГӨГДӨЛД хандах эрхийг өгдөггүй — тэр нь эзэмшигчийн ӨӨРИЙН ACL бичлэгээс
--   ирдэг бөгөөд REVOKE түүнийг бусадтай адил устгана.
--   ПРАКТИК ҮР ДАГАВАР: ирээдүйд `service_role`-ийг хатууруулах (ҮЛДЭХ ЭРСДЭЛ
--   №3) үед `postgres`-ийг grantee жагсаалтад САНАМСАРГҮЙ оруулж болохгүй —
--   тэр даруй апп унана.
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
  grantees  text[] := ARRAY['anon', 'authenticated', 'PUBLIC'];
  owned     bigint;
  total     bigint;
  leftover  text;
  foreign_o text;
BEGIN
  -- ── УРЬДЧИЛСАН ШАЛГАЛТ: энэ дүр юу ч хаах чадвартай юу? ─────────────────
  -- Хэрэв migration-ыг хангалттай эрхгүй дүрээр ажиллуулбал бүх давталт хоосон
  -- эргэж, "амжилттай" гэж дуусах байсан — Drizzle үүнийг хэрэглэгдсэн гэж
  -- тэмдэглэнэ, гэтэл юу ч хаагдаагүй байна.
  -- Шалгуур нь ЭЗЭМШИЛ биш, ЧАДВАР: `pg_has_role(..., 'USAGE')` нь эзэмшигч
  -- дүрийн нэрээр ажиллаж чадах эсэхийг хэлнэ (superuser, эсвэл далд
  -- pg_database_owner гишүүнчлэл ч үүнд орно).
  -- ЖИЧ: ЭРХИЙН тоог биш ОБЬЕКТЫН тоог харна. Хоёр дахь удаа ажиллуулахад
  -- хүрч болох бүх эрх аль хэдийн хураагдсан байх тул "үлдсэн эрх" дээр
  -- тулгуурласан шалгуур худал эерэг өгнө (идемпотент байдлыг эвдэнэ).
  SELECT count(*) FILTER (WHERE pg_has_role(current_user, c.relowner, 'USAGE')),
         count(*)
    INTO owned, total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'v', 'm', 'f', 'p', 'S');

  IF total > 0 AND owned = 0 THEN
    RAISE EXCEPTION
      'Энэ migration-ыг хангалтгүй эрхтэй дүрээр ажиллуулж байна: "%" нь public доторх % обьектын аль нэгэн дээр ч эрх хураах боломжгүй. Обьектын эзэмшигч дүрээрээ холбогдоно уу.',
      current_user, total;
  END IF;

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
        AND pg_has_role(current_user, c.relowner, 'USAGE')
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %s', obj.ref, grantee);
    END LOOP;

    -- 2. Sequence
    FOR obj IN
      SELECT c.oid::regclass AS ref
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S'
        AND pg_has_role(current_user, c.relowner, 'USAGE')
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM %s', obj.ref, grantee);
    END LOOP;

    -- 3. Function / procedure / aggregate / window
    --    ЗААВАЛ `ON ROUTINE` байх ёстой. `ON FUNCTION` нь PROCEDURE-т
    --    "ERROR: <нэр>() is not a function" өгч БҮХ migration-ыг унагаадаг
    --    (жинхэнэ PostgreSQL 17 дээр давтан хэмжсэн). ROUTINE нь function,
    --    procedure, aggregate, window дөрвүүлэнг хамарна.
    FOR obj IN
      SELECT p.oid::regprocedure AS ref
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND pg_has_role(current_user, p.proowner, 'USAGE')
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON ROUTINE %s FROM %s', obj.ref, grantee);
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

  -- ── ПОСТ-ШАЛГАЛТ: үнэхээр хаагдсан уу? ──────────────────────────────────
  -- REVOKE нь зөвхөн ӨӨРИЙН (эсвэл гишүүн байх дүрийн) олгосон ACL бичлэгийг
  -- устгадаг. Хэрэв гуравдагч дүр GRANT OPTION-той байж эрх олгосон бол тэр
  -- бичлэг ҮЛДЭНЭ — PostgreSQL ямар ч WARNING өгөхгүй, учир нь бид обьектыг
  -- эзэмшдэг. Ийм чимээгүй бүтэлгүйтлийг энд барина.
  SELECT string_agg(DISTINCT format('%s→%s(%s)', c.oid::regclass, g.who, a.privilege_type), ', ')
    INTO leftover
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  CROSS JOIN LATERAL (
    SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS who
  ) g
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'v', 'm', 'f', 'p', 'S')
    AND pg_has_role(current_user, c.relowner, 'USAGE')
    AND g.who = ANY(grantees);

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'Хаалт бүрэн болсонгүй — эзэмшиж буй обьект дээр эрх үлдлээ: %. Гуравдагч дүр GRANT OPTION-оор олгосон байж болзошгүй; тухайн grantor-оор REVOKE хийнэ үү.',
      leftover;
  END IF;

  -- Мэдээлэл: хамрах хүрээнээс ГАДУУР үлдсэн (өөр эзэнтэй) обьектууд.
  -- Энэ нь алдаа биш — санаатайгаар хөндөөгүй — гэхдээ чимээгүй өнгөрөхгүй.
  SELECT string_agg(DISTINCT c.oid::regclass::text, ', ')
    INTO foreign_o
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'v', 'm', 'f', 'p', 'S')
    AND NOT pg_has_role(current_user, c.relowner, 'USAGE')
    AND (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) = ANY(grantees);

  IF foreign_o IS NOT NULL THEN
    RAISE WARNING
      'Хамрах хүрээнээс гадуур (өөр эзэнтэй) обьектод эрх хэвээр байна: %. Эдгээрийг эзэмшигч нь өөрөө хураана.',
      foreign_o;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ҮЛДЭХ ЭРСДЭЛ (энэ migration ЗОРИУД хаахгүй зүйлс)
-- ---------------------------------------------------------------------------
-- 1. ИРЭЭДҮЙН ФУНКЦИЙН PUBLIC EXECUTE.
--    PostgreSQL шинэ FUNCTION бүрд PUBLIC-д EXECUTE-ийг ДАЛД өгдөг.
--    МЕХАНИЗМ (жинхэнэ PostgreSQL 17 дээр хэмжсэн): обьект үүсэх үед
--    PostgreSQL нь дотоод `acldefault()` (функцийн хувьд `{=X/эзэн,
--    эзэн=X/эзэн}`) дээр pg_default_acl-ийн мөрийг НЭМЖ нийлүүлдэг. Schema
--    зааж бичсэн `ALTER DEFAULT PRIVILEGES IN SCHEMA public` нь тусдаа мөр
--    үүсгэдэг тул дотоод анхдагчийг ХАСАЖ ЧАДАХГҮЙ. Хэмжилт: migration-ы
--    дараа мөр нь `f|{service_role=X/app_pg}` болсон (PUBLIC амжилттай
--    хасагдсан) хэр нь шинэ функц `{=X/app_pg,service_role=X/app_pg,
--    app_pg=X/app_pg}` буюу хоёрын НЭГДЭЛ болж, anon EXECUTE = true хэвээр.
--    Зөвхөн schema ЗААХГҮЙ (database-wide, defaclnamespace = 0) мөр л дотоод
--    анхдагчийг ОРЛУУЛНА — тэр нь энэ дүрийн БҮХ SCHEMA-д нөлөөлөх тул энэ
--    migration-ы амласан хамрах хүрээтэй зөрчилдөж, ОРУУЛААГҮЙ.
--    ЖИЧ: дээрх 4-р алхам дахь `... REVOKE ALL ON FUNCTIONS FROM PUBLIC` мөр
--    нь яг энэ шалтгаанаар PUBLIC-ийн хувьд ҮР ДҮНГҮЙ (anon/authenticated-д
--    үр дүнтэй) — тууштай байдлын үүднээс үлдээв.
--    Одоогоор public schema-д функц 0 ширхэг байгаа бөгөөд апп функц
--    үүсгэдэггүй (Drizzle зөвхөн хүснэгт/индекс/constraint үүсгэнэ).
--    ХЭРЭВ ирээдүйд public-д функц нэмбэл тухайн функц дээр нь шууд:
--        REVOKE EXECUTE ON ROUTINE public.<нэр>(...) FROM PUBLIC;
--    `npm run db:grants -- --strict` нь ийм функцийг илрүүлж exit 1 буцаана
--    (жинхэнэ PostgreSQL дээр шалгасан).
--
-- 2. `supabase_admin`-ийн эзэмшлийн default privileges нь public schema-д
--    хэвээр үлдэнэ. `postgres` түүнийг өөрчлөх эрхгүй. Хэрэв платформ өөрөө
--    public-д обьект үүсгэвэл anon/authenticated тэр обьектод эрх авна.
--
-- 3. `service_role` нь бүх хүснэгтэд эрхтэй, `rolbypassrls = true` хэвээр
--    (санаатай). Энэ migration түүнийг хөндөхгүй.
--
-- 5. НӨӨЦ ДАВХАРГА БАЙХГҮЙ. public доторх хүснэгтүүдэд RLS идэвхжээгүй
--    (0/18) бөгөөд `pg_policy` хоосон. Тиймээс ЭНЭ GRANT хаалт нь anon /
--    authenticated-ийн эсрэг ЦОР ГАНЦ хяналт — ард нь өөр хамгаалалт алга.
--    Энэ нь дээрх №2-ыг (платформын үүсгэсэн обьект) зүгээр нэг тэмдэглэл биш,
--    харин гол эрсдэл болгож байна: нэг л дахин GRANT хийгдвэл бүх хүснэгт
--    шууд нээгдэнэ. Тиймээс `npm run db:grants -- --strict` -ийг тогтмол
--    ажиллуулах нь зөвлөмж биш, ШААРДЛАГА.
--    (RLS policy нэмэх нь энд шийдэл биш: апп Supabase Auth ашигладаггүй тул
--    `auth.uid()`-д тулгуурласан policy утгагүй, мөн RLS нь `service_role`
--    болон `postgres`-ийг ч зогсоохгүй — хоёулаа `rolbypassrls = true`.)
--
-- 4. Энэ migration нь PostgreSQL-ийн ЭРХИЙГ өөрчилнө. Supabase Dashboard дахь
--    "Enable Data API" унтраалга бол ТУСДАА давхарга: PostgREST үйлчилгээ
--    ажиллаж, HTTP-ээр нээлттэй эсэхийг шийднэ. Хоёулаа бие даасан.
--    Data API-г дахин асаах нь энд хураасан эрхийг БУЦААХГҮЙ — PostgREST
--    ажиллах боловч anon/authenticated-д обьектын эрх байхгүй тул хүсэлт
--    "permission denied" болно. Харин эрхийг гараар дахин GRANT хийвэл
--    (эсвэл платформ ямар нэг байдлаар GRANT ажиллуулбал) хандалт сэргэнэ.
--    Тиймээс `npm run db:grants -- --strict` -ийг тогтмол ажиллуулна.
