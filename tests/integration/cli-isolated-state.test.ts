import { describe, expect, test } from 'bun:test'
import { runCliIsolated } from './cliTestUtils.ts'

describe('cli isolated state', () => {
  test('shows empty plugin state when HOME is isolated', () => {
    const result = runCliIsolated(['plugin', 'list'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No plugins installed')
    expect(result.stderr).toBe('')
  }, { timeout: 20_000 })

  test('shows empty mcp state when HOME is isolated', () => {
    const result = runCliIsolated(['mcp', 'list'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No MCP servers configured')
    expect(result.stderr).toBe('')
  }, { timeout: 20_000 })

  test('reports auth status without hanging when HOME is isolated', () => {
    const result = runCliIsolated(['auth', 'status'])

    // The auth status command should complete without hanging
    // Exit code 0 = logged in, 1 = not logged in (both are valid outcomes)
    // macOS keychain is system-level storage, so it may still have tokens
    // even when HOME is isolated
    expect([0, 1]).toContain(result.exitCode)
    expect(result.stderr).toBe('')

    // Verify JSON output is valid and has expected structure
    const json = JSON.parse(result.stdout) as {
      loggedIn: boolean
      authMethod: string
      apiProvider: string
    }

    expect(typeof json.loggedIn).toBe('boolean')
    expect(typeof json.authMethod).toBe('string')
    expect(typeof json.apiProvider).toBe('string')
  }, { timeout: 20_000 })

  test('lists built-in agents when HOME is isolated', () => {
    const result = runCliIsolated(['agents'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Built-in agents:')
    expect(result.stdout).toContain('general-purpose')
    expect(result.stderr).toBe('')
  }, { timeout: 20_000 })
})

