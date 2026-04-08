export type GclmCodeServerRecordIdPrefix =
  | 'audit'
  | 'bind'
  | 'chid'
  | 'idem'
  | 'perm'
  | 'req'
  | 'sess'

export function createUuidV7Hex(uuid = Bun.randomUUIDv7()): string {
  return uuid.replaceAll('-', '')
}

export function createRecordId(prefix: GclmCodeServerRecordIdPrefix): string {
  return `${prefix}_${createUuidV7Hex()}`
}
