import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '..', '..')
const promptDir = join(
  repoRoot,
  'src',
  'utils',
  'permissions',
  'yolo-classifier-prompts',
)

function readPrompt(name: string): string {
  return readFileSync(join(promptDir, name), 'utf8')
}

function getTaggedBody(template: string, tagName: string): string {
  const match = template.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`))
  expect(match).not.toBeNull()
  return match?.[1] ?? ''
}

function expectTaggedBullets(template: string, tagName: string) {
  const body = getTaggedBody(template, tagName)
  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  expect(lines.length).toBeGreaterThan(0)
  for (const line of lines) {
    expect(line.startsWith('- ')).toBe(true)
  }
}

describe('auto mode prompt assets', () => {
  test('system prompt keeps the required placeholder and tool line', () => {
    const systemPrompt = readPrompt('auto_mode_system_prompt.txt')

    expect(systemPrompt).toContain('<permissions_template>')
    expect(systemPrompt).toContain(
      'Use the classify_result tool to report your classification.',
    )
  })

  test('external template keeps replace-style default sections', () => {
    const template = readPrompt('permissions_external.txt')

    expectTaggedBullets(template, 'user_allow_rules_to_replace')
    expectTaggedBullets(template, 'user_deny_rules_to_replace')
    expectTaggedBullets(template, 'user_environment_to_replace')
  })

  test('anthropic template keeps additive empty placeholders', () => {
    const template = readPrompt('permissions_anthropic.txt')

    expect(template).toContain(
      '<user_allow_rules_to_replace></user_allow_rules_to_replace>',
    )
    expect(template).toContain(
      '<user_deny_rules_to_replace></user_deny_rules_to_replace>',
    )
    expect(template).toContain(
      '<user_environment_to_replace></user_environment_to_replace>',
    )
  })

  test('build feature split keeps transcript classifier default and powershell experimental', () => {
    const buildScript = readFileSync(join(repoRoot, 'scripts', 'build.mjs'), 'utf8')

    expect(buildScript).toContain(
      "const defaultFeatures = ['VOICE_MODE', 'TRANSCRIPT_CLASSIFIER', 'NEW_INIT']",
    )
    expect(buildScript).toContain("'POWERSHELL_AUTO_MODE'")
    expect(buildScript).not.toContain(
      "const defaultFeatures = ['VOICE_MODE', 'TRANSCRIPT_CLASSIFIER', 'POWERSHELL_AUTO_MODE']",
    )
  })
})
