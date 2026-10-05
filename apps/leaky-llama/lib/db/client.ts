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
 * compiled to WebAssembly that runs in-process, so local development needs no Docker. Hosted, it
 * uses Render Postgres: PGlite needs about 900 MB of memory, more than a Starter instance has.
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

const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/

/**
 * The store's own database inside the Postgres instance `url` points at, created on first start.
 * Hosted, one Render Postgres instance serves both the console and the store: in separate
 * databases, their tables and migration histories never mix. Returns the store's own URL.
 */
export async function ensureDatabase(url: string, name: string): Promise<string> {
  if (!DATABASE_NAME.test(name)) throw new Error(`STORE_DATABASE_NAME is not a plain name: ${name}`)
  const target = new URL(url)
  if (target.pathname === `/${name}`) return url
  const admin = postgres(url, { max: 1 })
  try {
    const found = await admin`select 1 from pg_database where datname = ${name}`
    if (found.length === 0) {
      await admin.unsafe(`create database ${name}`).catch((error: { code?: string }) => {
        // Another process got there first: the database exists, which is all we need.
        if (error.code !== '42P04') throw error
      })
    }
  } finally {
    await admin.end()
  }
  target.pathname = `/${name}`
  return target.toString()
}

// One database per server process. Next's dev server reloads modules, so keep it on globalThis.
const holder = globalThis as unknown as { __leakyLlamaDb?: Promise<StoreDb> }

export function getDb(): Promise<StoreDb> {
  if (!holder.__leakyLlamaDb) {
    const url = process.env.STORE_DATABASE_URL?.trim()
    const name = process.env.STORE_DATABASE_NAME?.trim()
    holder.__leakyLlamaDb = url
      ? (name ? ensureDatabase(url, name) : Promise.resolve(url)).then(createPostgresDb)
      : // One PGlite directory per server process: two servers must never share one.
        createPgliteDb(
          path.resolve(
            /* turbopackIgnore: true */ process.env.STORE_DATA_DIR?.trim() || '.data/pglite',
          ),
        )
    holder.__leakyLlamaDb.catch(() => {
      holder.__leakyLlamaDb = undefined
    })
  }
  return holder.__leakyLlamaDb
}
