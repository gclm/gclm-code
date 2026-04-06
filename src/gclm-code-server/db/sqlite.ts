import { Database } from 'bun:sqlite'

export type SqliteConnectionOptions = {
  path: string
  busyTimeoutMs: number
}

export function createSqliteDatabase(
  options: SqliteConnectionOptions,
): Database {
  const db = new Database(options.path, { create: true })
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA temp_store = MEMORY;')
  db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs};`)
  return db
}
