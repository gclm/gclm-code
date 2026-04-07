import { describe, expect, test } from 'bun:test'
import {
  roughTokenCountEstimation,
} from '../../src/services/tokenEstimation.ts'

describe('roughTokenCountEstimation', () => {
  test('returns 0 for empty string', () => {
    expect(roughTokenCountEstimation('')).toBe(0)
  })

  test('estimates ~4 chars/token for pure ASCII', () => {
    const ascii = 'Hello, this is a test of the emergency broadcast system.'
    // 65 chars / 4 ≈ 16
    expect(roughTokenCountEstimation(ascii)).toBe(Math.round(ascii.length / 4))
  })

  test('estimates ~1.5 chars/token for pure CJK (Chinese)', () => {
    // 100 Chinese characters → ~100/1.5 ≈ 67 tokens
    const chinese = '你'.repeat(100)
    const result = roughTokenCountEstimation(chinese)
    // Should be significantly higher than the old estimate (100/4 = 25)
    expect(result).toBeGreaterThan(40) // ~67
    expect(result).toBeLessThanOrEqual(100)
  })

  test('estimates ~1.5 chars/token for pure Japanese (Hiragana)', () => {
    const hiragana = 'あ'.repeat(100)
    const result = roughTokenCountEstimation(hiragana)
    expect(result).toBeGreaterThan(40)
  })

  test('estimates ~1.5 chars/token for pure Korean (Hangul)', () => {
    const hangul = '한'.repeat(100)
    const result = roughTokenCountEstimation(hangul)
    expect(result).toBeGreaterThan(40)
  })

  test('gives intermediate result for mixed CJK + ASCII', () => {
    const mixed = 'A'.repeat(50) + '你'.repeat(50) // 50/50 mix, 100 chars total
    const result = roughTokenCountEstimation(mixed)
    // Pure ASCII would be 25, pure CJK would be ~67, mixed should be in between
    expect(result).toBeGreaterThan(25)
    expect(result).toBeLessThan(67)
  })

  test('CJK estimate is 2-3x higher than old fixed 4 estimate', () => {
    const chinese = '这是一个关于代码压缩的测试用例，用于验证中文内容在自动压缩时是否能够正确估算 token 数量。'
    const oldEstimate = Math.round(chinese.length / 4)
    const newEstimate = roughTokenCountEstimation(chinese)
    // The new estimate should be significantly higher
    expect(newEstimate).toBeGreaterThan(oldEstimate * 1.5)
  })

  test('respects explicit bytesPerToken override for JSON', () => {
    const jsonContent = '{"key": "value", "nested": {"data": 123}}'
    // bytesPerToken=2 should bypass CJK detection
    const result = roughTokenCountEstimation(jsonContent, 2)
    expect(result).toBe(Math.round(jsonContent.length / 2))
  })

  test('CJK detection works with content longer than sample size', () => {
    // Create content that starts with ASCII but is mostly CJK
    // The sample (first 2000 chars) is pure ASCII, so CJK ratio = 0
    const asciiPrefix = 'x'.repeat(2000)
    const chineseBody = '你'.repeat(5000)
    const longContent = asciiPrefix + chineseBody

    // The sample is pure ASCII, so the estimate will use the default ratio
    const result = roughTokenCountEstimation(longContent)
    // Should be close to the default 4 chars/token estimate for the full length
    // since the sample (first 2000) is pure ASCII
    const defaultEstimate = Math.round(longContent.length / 4)
    expect(result).toBe(defaultEstimate)
  })

  test('CJK detection works when CJK is at the start', () => {
    const chinesePrefix = '你'.repeat(500)
    const asciiSuffix = 'x'.repeat(500)
    const content = chinesePrefix + asciiSuffix
    const result = roughTokenCountEstimation(content)
    // Sample detects CJK, so estimate should be higher than chars/4
    const defaultEstimate = Math.round(content.length / 4)
    expect(result).toBeGreaterThan(defaultEstimate)
  })
})

describe('roughTokenCountEstimation - compact integration scenarios', () => {
  test('Chinese conversation triggers compact earlier than before', () => {
    // Simulate a conversation that would be ~50K tokens in reality
    // Old estimate: 200K chars / 4 = 50K tokens (at threshold)
    // New estimate should be higher → triggers earlier
    const chineseConversation = '用户请求修改代码中的错误处理逻辑。助手分析了 src/utils/error.ts 文件，发现需要添加 try-catch 块来捕获异步操作中的异常。'.repeat(200)
    const estimate = roughTokenCountEstimation(chineseConversation)
    // Should be well above the old estimate
    const oldEstimate = Math.round(chineseConversation.length / 4)
    expect(estimate).toBeGreaterThan(oldEstimate)
  })

  test('Mixed code + Chinese comments are handled correctly', () => {
    const mixed = `
// 这是一个重要的工具函数
function calculateTotal(items: Item[]): number {
  // 计算所有项目的总金额
  return items.reduce((sum, item) => sum + item.price, 0)
}

// 错误处理：如果输入为空则返回零
function safeCalculate(items: Item[] | null): number {
  if (!items || items.length === 0) {
    return 0
  }
  return calculateTotal(items)
}
`.repeat(10)
    const estimate = roughTokenCountEstimation(mixed)
    const oldEstimate = Math.round(mixed.length / 4)
    // Mixed content should give a higher estimate than pure ASCII assumption
    expect(estimate).toBeGreaterThan(oldEstimate)
  })
})
