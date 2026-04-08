import { describe, expect, test } from 'bun:test'
import { createRecordId, createUuidV7Hex } from '../../src/gclm-code-server/ids.js'

describe('gclm-code-server ids', () => {
  test('creates a hyphenless uuidv7 hex string', () => {
    const id = createUuidV7Hex()

    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(id[12]).toBe('7')
    expect(id[16]).toMatch(/[89ab]/)
  })

  test('creates a prefixed record id', () => {
    const recordId = createRecordId('sess')

    expect(recordId).toMatch(/^sess_[0-9a-f]{32}$/)
    expect(recordId.slice(5 + 12, 5 + 13)).toBe('7')
  })
})
