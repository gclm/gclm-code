import type { Hello2ccIntentKind, Hello2ccIntentProfile } from './types.js'

const IMPLEMENT_RE =
  /(implement|fix|build|write|create|integrat|patch|修改|实现|接入|集成|补一下|补齐|增强|落代码|编码)/i
const REVIEW_RE = /(review|code review|审查|review 一下|看看风险|检查问题)/i
const VERIFY_RE = /(verify|test|smoke|validate|回归|验证|测试|跑一下)/i
const PLAN_RE = /(plan|design|roadmap|方案|规划|设计|架构|怎么做)/i
const EXPLORE_RE = /(analy[sz]e|investigate|understand|read|look into|原理|分析|看看项目|看一下)/i
const EXTERNAL_SYSTEM_RE =
  /(gateway|api|oauth|remote|web|mcp|feishu|provider|模型|网关|登录|认证|模型列表)/i
const TEAM_RE = /(parallel|multiple agents|multi-agent|swarm|team|gitworker|并行|多 agent|多智能体|团队)/i
const WORKTREE_RE = /(worktree|isolation|isolated|独立 worktree|隔离)/i

function resolvePrimaryIntent(profile: Hello2ccIntentProfile['signals']): Hello2ccIntentKind {
  if (profile.implement) return 'implement'
  if (profile.review) return 'review'
  if (profile.verify) return 'verify'
  if (profile.plan) return 'plan'
  if (profile.explore) return 'explore'
  return 'general'
}

export function analyzeIntentProfile(prompt: string): Hello2ccIntentProfile {
  const normalized = prompt.trim()
  const signals = {
    implement: IMPLEMENT_RE.test(normalized),
    review: REVIEW_RE.test(normalized),
    verify: VERIFY_RE.test(normalized),
    plan: PLAN_RE.test(normalized),
    explore: EXPLORE_RE.test(normalized),
    externalSystem: EXTERNAL_SYSTEM_RE.test(normalized),
    needTeam: TEAM_RE.test(normalized),
    needWorktree: WORKTREE_RE.test(normalized),
  }

  return {
    rawPrompt: normalized,
    primaryIntent: resolvePrimaryIntent(signals),
    signals,
  }
}
