import { createDb, type Db } from './client'

export * as schema from './schema'
export type { Db }

declare global {
  // eslint-disable-next-line no-var
  var __vtDb: Db | undefined
}

/**
 * Холболтыг эхний хүсэлт хүртэл үүсгэхгүй (lazy).
 *  - build үед DATABASE_URL байхгүй ч модуль ачаалагдана
 *  - dev: hot-reload бүрт шинэ pool үүсэхгүй
 *  - serverless (Vercel): нэг instance доторх дуудлагууд ижил pool ашиглана
 */
export function getDb(): Db {
  if (!globalThis.__vtDb) globalThis.__vtDb = createDb()
  return globalThis.__vtDb
}

export const db = new Proxy({} as Db, {
  get(_target, property) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = getDb() as any
    const value = instance[property]
    return typeof value === 'function' ? value.bind(instance) : value
  },
  has(_target, property) {
    return Reflect.has(getDb() as object, property)
  },
}) as Db
