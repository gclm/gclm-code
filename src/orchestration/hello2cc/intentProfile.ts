import type {
  Hello2ccIntentKind,
  Hello2ccIntentProfile,
  Hello2ccIntentSignals,
  PromptEnvelope,
} from './types.js'

// ── Lexicons ──

const ACTION_RE = [
  { key: 'implement' as const, re: /(?:implement|fix|build|write|create|integrat|patch|修改|实现|接入|增强|落代码|编码|refactor)/i },
  { key: 'review' as const, re: /(?:review|code\s*review|审查|检查问题|audit)/i },
  { key: 'verify' as const, re: /(?:verify|test|smoke|validate|回归|验证|测试|跑一下|regression)/i },
  { key: 'plan' as const, re: /(?:plan|design|roadmap|方案|规划|设计|架构|proposal|architect)/i },
  { key: 'compare' as const, re: /(?:compare|trade\s*off|difference|对比|权衡|vs\.?\b|versus)/i },
  { key: 'release' as const, re: /(?:release|publish|tag\b|release\s*notes?|changelog|发布)/i },
  { key: 'research' as const, re: /(?:investigat|debug|分析|看一下|root[\s-]?cause|研究)/i },
  { key: 'explain' as const, re: /(?:explain|walk\s*through|原理|解释|怎么工作的|为什么)/i },
  { key: 'current_info' as const, re: /(?:latest|recently?|news|当前|最新消息|最新)/i },
]

const COLLAB_RE = /(?:parallel|multiple\s*agents|multi[\s-]?agent|swarm|team|gitworker|并行|多\s*agent|多智能体|团队|hand[\s-]?off|交接)/i
const WORKTREE_RE = /(?:worktree|isolat|独立\s*worktree|隔离)/i
const CONTINUATION_RE = /(?:continue|resume|follow[\s-]?up|pick\s*up|carry\s*on|继续|接着)/i
const EXTERNAL_SYSTEM_RE = /(?:gateway|api|oauth|remote|mcp|feishu|provider|模型|网关|登录|认证|模型列表)/i
const QUESTION_RE = /[?？]|(?:\bhow\b|\bwhy\b|\bwhat\b|\bwhich\b|\bcan\b|\bdoes\b)/i
const STRUCTURED_ARTIFACT_RE = /`[^`]+`|(?:[A-Za-z]:[\\/]|(?:^|[\s(`])[./~]?[\w./-]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?))?|[#@][\w.-]+|\b\d+(?:\.\d+){1,}\b/i
const PATH_RE = /(?:[A-Za-z]:[\\/]|(?:^|[\s(`])[./~]?[\w./-]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?))/g
const DIFF_RE = /(?:^|\n)(?:diff --git|@@ |--- [^\n]|\+\+\+ [^\n])/m
const CODE_FENCE_RE = /```[\s\S]*?```/u
const LINE_REF_RE = /:\d+(?::\d+)?\b|#L\d+(?:C\d+)?\b/u
const ARCHITECTURE_RE = /(?:architecture|architectural|approach|strategy|trade[\s-]?off|design\s*choice)/i
const DECISION_RE = /(?:which\s+(?:one|approach|option)|\bchoose\b|\bdecision\b|\bbetter\b|pros?\s*and\s*cons?)/i

function analyzePromptEnvelope(prompt: string): PromptEnvelope {
  const raw = prompt
  const charCount = Array.from(raw.replace(/\s+/g, '')).length
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length
  const clauses = raw.split(/[.!?;:。！？；：,，、\n]+/u).map(l => l.trim()).filter(Boolean).length

  const structuredArtifact = STRUCTURED_ARTIFACT_RE.test(raw)
  const pathArtifacts = (raw.match(PATH_RE) || []).length
  const reviewArtifact = DIFF_RE.test(raw) || (CODE_FENCE_RE.test(raw) && (LINE_REF_RE.test(raw) || pathArtifacts > 0))
  const broadArtifactQuestion = raw.includes('?') || raw.includes('？')
    ? (!reviewArtifact && !LINE_REF_RE.test(raw) && !DIFF_RE.test(raw) && (pathArtifacts >= 2 || (structuredArtifact && (lines >= 2 || clauses >= 3))))
    : false
  const targetedArtifactQuestion = (raw.includes('?') || raw.includes('？'))
    ? (!reviewArtifact && (LINE_REF_RE.test(raw) || DIFF_RE.test(raw) || ((structuredArtifact || pathArtifacts > 0) && !broadArtifactQuestion)))
    : false
  const repoArtifactHeavy = structuredArtifact && (pathArtifacts >= 2 || LINE_REF_RE.test(raw) || DIFF_RE.test(raw))
  const structuralComplexity = charCount >= 48 || lines >= 2 || clauses >= 3 || structuredArtifact || raw.includes('\n')

  return {
    charCount,
    lineCount: lines,
    clauseCount: clauses,
    questionLike: raw.includes('?') || raw.includes('？'),
    listLike: /(?:^|\n)(?:\d+\. |- |\* )/u.test(raw),
    structuredArtifact,
    knownSurfaceMentioned: false,
    structuralComplexity,
    pathArtifactCount: pathArtifacts,
    targetedArtifactQuestion,
    broadArtifactQuestion,
    reviewArtifact,
    repoArtifactHeavy,
    optionPairLike: /(?<![:\\])[\p{L}\p{N}][\p{L}\p{N}#+._-]{1,40}\/[\p{L}\p{N}][\p{L}\p{N}#+._-]{1,40}(?![\\/])/u.test(raw),
  }
}

function matchAction(text: string): string | null {
  for (const { key, re } of ACTION_RE) {
    if (re.test(text)) return key
  }
  return null
}

function deriveArtifactSignals(text: string, envelope: PromptEnvelope): { review: boolean; research: boolean } {
  const reviewArtifact = !ACTION_RE.find(a => a.key === 'review')?.re.test(text)
    && envelope.questionLike
    && envelope.reviewArtifact
    && !ACTION_RE.find(a => a.key === 'plan')?.re.test(text)

  const researchFromArtifact = !ACTION_RE.find(a => a.key === 'research')?.re.test(text)
    && envelope.broadArtifactQuestion
    && !ACTION_RE.find(a => a.key === 'compare')?.re.test(text)
    && !ACTION_RE.find(a => a.key === 'plan')?.re.test(text)
    && !reviewArtifact

  return {
    review: !!ACTION_RE.find(a => a.key === 'review')?.re.test(text) || !!reviewArtifact,
    research: !!ACTION_RE.find(a => a.key === 'research')?.re.test(text) || !!researchFromArtifact,
  }
}

function deriveWorkflowSignals(text: string, envelope: PromptEnvelope, artifactSignals: { review: boolean; research: boolean }): { implement: boolean; release: boolean; workflowContinuation: boolean; boundedImplementation: boolean } {
  const hasAction = (key: string) => ACTION_RE.find(a => a.key === key)?.re.test(text)

  const release = !!hasAction('release')

  const continuityDrivenImplement = !hasAction('implement')
    && !release
    && !envelope.questionLike
    && !hasAction('compare')
    && !artifactSignals.review
    && !envelope.repoArtifactHeavy

  const boundedArtifactExecution = !hasAction('implement')
    && !release
    && !envelope.questionLike
    && !hasAction('compare')
    && !artifactSignals.review
    && !artifactSignals.research
    && envelope.repoArtifactHeavy

  return {
    implement: !!hasAction('implement') || continuityDrivenImplement || boundedArtifactExecution,
    release,
    workflowContinuation: CONTINUATION_RE.test(text),
    boundedImplementation: boundedArtifactExecution,
  }
}

function derivePlanningSignals(text: string, envelope: PromptEnvelope, workflowSignals: { implement: boolean }, artifactSignals: { review: boolean; research: boolean }): { plan: boolean; decisionHeavy: boolean; complex: boolean } {
  const hasAction = (key: string) => ACTION_RE.find(a => a.key === key)?.re.test(text)

  const planningProbeShape = !hasAction('plan')
    && !hasAction('compare')
    && !artifactSignals.review
    && !workflowSignals.implement
    && envelope.questionLike
    && (envelope.listLike || envelope.lineCount >= 2 || envelope.clauseCount >= 3)

  const architectureLike = ARCHITECTURE_RE.test(text)

  return {
    plan: !!hasAction('plan') || planningProbeShape || (architectureLike && !envelope.questionLike),
    decisionHeavy: envelope.questionLike && (hasAction('compare') || ARCHITECTURE_RE.test(text) || DECISION_RE.test(text)),
    complex: envelope.structuralComplexity || architectureLike,
  }
}

function resolvePrimaryIntent(signals: Hello2ccIntentSignals): Hello2ccIntentKind {
  if (signals.compare) return 'compare'
  if (signals.release) return 'release'
  if (signals.review) return 'review'
  if (signals.verify) return 'verify'
  if (signals.plan) return 'plan'
  if (signals.research) return 'research'
  if (signals.explain) return 'explain'
  if (signals.capability) return 'capability'
  if (signals.currentInfo) return 'current_info'
  if (signals.implement) return 'implement'
  return 'general'
}

export function analyzeIntentProfile(prompt: string): Hello2ccIntentProfile {
  const normalized = prompt.trim()
  const envelope = analyzePromptEnvelope(normalized)
  const artifactSignals = deriveArtifactSignals(normalized, envelope)
  const workflowSignals = deriveWorkflowSignals(normalized, envelope, artifactSignals)
  const planningSignals = derivePlanningSignals(normalized, envelope, workflowSignals, artifactSignals)

  const hasExplicitAction = (key: string) => ACTION_RE.find(a => a.key === key)?.re.test(normalized)

  const signals: Hello2ccIntentSignals = {
    implement: workflowSignals.implement,
    review: artifactSignals.review,
    verify: !!hasExplicitAction('verify'),
    plan: planningSignals.plan,
    explore: !!hasExplicitAction('research') || artifactSignals.research,
    compare: !!hasExplicitAction('compare'),
    release: workflowSignals.release,
    explain: !!hasExplicitAction('explain'),
    research: artifactSignals.research,
    currentInfo: !!hasExplicitAction('current_info'),
    capability: envelope.questionLike && !workflowSignals.implement && !artifactSignals.review && !workflowSignals.release,
    externalSystem: EXTERNAL_SYSTEM_RE.test(normalized),
    needTeam: COLLAB_RE.test(normalized),
    needWorktree: WORKTREE_RE.test(normalized),
    continuation: CONTINUATION_RE.test(normalized),
    boundedImplementation: workflowSignals.boundedImplementation,
    workflowContinuation: workflowSignals.workflowContinuation,
    decisionHeavy: planningSignals.decisionHeavy,
    claudeGuide: false,
    complex: planningSignals.complex,
    lexiconGuided: !!ACTION_RE.find(a => a.re.test(normalized)) || COLLAB_RE.test(normalized) || WORKTREE_RE.test(normalized),
    questionIntent: envelope.questionLike,
  }

  return {
    rawPrompt: normalized,
    primaryIntent: resolvePrimaryIntent(signals),
    signals,
    envelope,
  }
}
