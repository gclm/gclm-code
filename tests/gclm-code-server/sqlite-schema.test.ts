import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildIdempotencyKey,
  ChannelIdentityRepository,
  createGclmCodeServerDatabase,
  IdempotencyRepository,
  PermissionRepository,
  SessionBindingRepository,
  SessionRepository,
} from '../../src/gclm-code-server/index.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('gclm-code-server sqlite bootstrap', () => {
  test('runs initial migrations and persists core records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-'))
    tempDirs.push(dir)

    const { db } = createGclmCodeServerDatabase({
      GCLM_CODE_SERVER_DB_PATH: join(dir, 'server.db'),
      GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: 250,
    })

    const sessionRepository = new SessionRepository(db)
    const channelIdentityRepository = new ChannelIdentityRepository(db)
    const sessionBindingRepository = new SessionBindingRepository(db)
    const permissionRepository = new PermissionRepository(db)
    const idempotencyRepository = new IdempotencyRepository(db)

    sessionRepository.insert({
      id: 'sess_1',
      status: 'running',
      ownerUserId: 'user_1',
      sourceChannel: 'web',
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
    })

    channelIdentityRepository.upsert({
      id: 'ident_1',
      userId: 'user_1',
      provider: 'feishu',
      providerUserId: 'ou_xxx',
      tenantScope: 'tenant_a',
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
    })

    sessionBindingRepository.insert({
      id: 'bind_1',
      sessionId: 'sess_1',
      channelIdentityId: 'ident_1',
      userId: 'user_1',
      bindingType: 'owner',
      isPrimary: true,
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
    })

    permissionRepository.insert({
      id: 'perm_1',
      sessionId: 'sess_1',
      toolName: 'Bash',
      toolUseId: 'toolu_1',
      status: 'pending',
      scope: 'once',
      inputJson: '{"cmd":"pwd"}',
      requestedAt: '2026-04-06T00:00:00.000Z',
      createdAt: '2026-04-06T00:00:00.000Z',
      updatedAt: '2026-04-06T00:00:00.000Z',
    })

    const idem = buildIdempotencyKey({
      provider: 'feishu',
      payloadHash: 'abc123',
    })

    idempotencyRepository.upsert({
      id: 'idem_1',
      provider: 'feishu',
      idempotencyKey: idem.idempotencyKey,
      keySource: idem.keySource,
      payloadHash: 'abc123',
      status: 'processing',
      firstSeenAt: '2026-04-06T00:00:00.000Z',
      lastSeenAt: '2026-04-06T00:00:00.000Z',
    })

    expect(sessionRepository.findById('sess_1')?.status).toBe('running')
    expect(
      channelIdentityRepository.findByProviderIdentity({
        provider: 'feishu',
        providerUserId: 'ou_xxx',
        tenantScope: 'tenant_a',
      })?.userId,
    ).toBe('user_1')
    expect(
      sessionBindingRepository.findByIdentityAndSession({
        channelIdentityId: 'ident_1',
        sessionId: 'sess_1',
      })?.bindingType,
    ).toBe('owner')
    expect(permissionRepository.findPendingBySession('sess_1')).toHaveLength(1)
    expect(
      idempotencyRepository.findByProviderAndKey({
        provider: 'feishu',
        idempotencyKey: 'feishu:payload:abc123',
      })?.keySource,
    ).toBe('payload_hash_derived')
  })
})
