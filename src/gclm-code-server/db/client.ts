import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import type { Database } from 'bun:sqlite'
import { readGclmCodeServerEnv, type GclmCodeServerEnv } from '../config/env.js'
import { createSqliteDatabase } from './sqlite.js'
import { runMigrations } from './migrationRunner.js'

export type GclmCodeServerDatabase = {
  db: Database
  env: GclmCodeServerEnv
}

export function createGclmCodeServerDatabase(
  envOverrides?: Partial<GclmCodeServerEnv>,
): GclmCodeServerDatabase {
  const env = {
    ...readGclmCodeServerEnv(),
    ...envOverrides,
  }

  mkdirSync(dirname(env.GCLM_CODE_SERVER_DB_PATH), { recursive: true })

  const db = createSqliteDatabase({
    path: env.GCLM_CODE_SERVER_DB_PATH,
    busyTimeoutMs: env.GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS,
  })

  runMigrations(db, join(import.meta.dir, 'migrations'))

  return { db, env }
}
