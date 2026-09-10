// Тест бүр өөрийн in-memory PostgreSQL (PGlite) дээр ажиллана.
process.env.DATABASE_URL = 'pglite://memory'
Object.assign(process.env, { NODE_ENV: 'test' })
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret-1234'
