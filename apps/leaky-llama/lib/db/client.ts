import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { schema } from './schema'

/**
 * The store runs on Postgres. With STORE_DATABASE_URL unset it uses PGlite, a real Postgres
 * compiled to WebAssembly that runs in-process, so local development needs no Docker.
 */
export type StoreDb = PgDatabase<PgQueryResultHKT, typeof schema>

const migrationsFolder = path.join(process.cwd(), 'drizzle')

export async function createPgliteDb(dataDir?: string): Promise<StoreDb> {
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder })
  return db as unknown as StoreDb
}

async function createPostgresDb(url: string): Promise<StoreDb> {
  const client = postgres(url, { max: 5 })
  const db = drizzlePostgres(client, { schema })
  await migratePostgres(db, { migrationsFolder })
  return db as unknown as StoreDb
}

// One database per server process. Next's dev server reloads modules, so keep it on globalThis.
const holder = globalThis as unknown as { __leakyLlamaDb?: Promise<StoreDb> }

export function getDb(): Promise<StoreDb> {
  if (!holder.__leakyLlamaDb) {
    const url = process.env.STORE_DATABASE_URL?.trim()
    holder.__leakyLlamaDb = url
      ? createPostgresDb(url)
      : // One PGlite directory per server process: two servers must never share one.
        createPgliteDb(path.resolve(process.env.STORE_DATA_DIR?.trim() || '.data/pglite'))
    holder.__leakyLlamaDb.catch(() => {
      holder.__leakyLlamaDb = undefined
    })
  }
  return holder.__leakyLlamaDb
}
