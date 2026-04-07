import { describe, expect, test } from 'bun:test'
import {
  hasGatewayVersionSuffix,
  trimGatewayBaseUrl,
} from '../../src/utils/gatewayBaseUrl.ts'

describe('gateway base url helpers', () => {
  test('preserves provider path prefixes while trimming trailing slashes', () => {
    expect(trimGatewayBaseUrl('https://open.bigmodel.cn/api/anthropic/')).toBe(
      'https://open.bigmodel.cn/api/anthropic',
    )
  })

  test('detects trailing version suffixes without rewriting the input', () => {
    expect(hasGatewayVersionSuffix('http://localhost:8086/v1')).toBe(true)
    expect(hasGatewayVersionSuffix('https://example.com/proxy/v2/')).toBe(true)
    expect(
      hasGatewayVersionSuffix('https://open.bigmodel.cn/api/anthropic'),
    ).toBe(false)
  })
})
