import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema } from './schema'

/**
 * Postgres is where a run goes after it finishes. Nothing in the engine needs a database to
 * run, so the CLI works with no DATABASE_URL at all; the console is what reads these tables.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 5 })
  return { db: drizzle(client, { schema }), client }
}

export type Database = ReturnType<typeof createDb>['db']
