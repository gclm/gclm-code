import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Database } from 'bun:sqlite'

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
`

export function runMigrations(db: Database, migrationsDir: string): void {
  db.exec(MIGRATIONS_TABLE_SQL)

  const applied = new Set(
    db
      .query('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: string }>,
  )

  const appliedVersions = new Set(Array.from(applied, row => row.version))

  const files = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const version = file.split('_')[0] ?? file
    if (appliedVersions.has(version)) {
      continue
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const appliedAt = new Date().toISOString()
    const checksum = String(Bun.hash(sql))

    db.transaction(() => {
      db.exec(sql)
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
      ).run(version, file, appliedAt, checksum)
    })()
  }
}
