import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ToolUseContext } from '../../src/Tool.ts'
import { TaskUpdateTool } from '../../src/tools/TaskUpdateTool/TaskUpdateTool.ts'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/utils/teammate.ts'
import { createTask, getTask, getTaskListId } from '../../src/utils/tasks.ts'

function makeContext(): ToolUseContext {
  let appState = { expandedView: undefined } as Record<string, unknown>

  return {
    abortController: new AbortController(),
    getAppState: () => appState as never,
    setAppState: updater => {
      appState = updater(appState as never) as Record<string, unknown>
    },
  } as unknown as ToolUseContext
}

describe('TaskUpdateTool', () => {
  const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
  const originalAgentTeamsEnv = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  let tempClaudeConfigDir: string

  beforeEach(async () => {
    tempClaudeConfigDir = await mkdtemp(join(tmpdir(), 'task-update-tool-'))
    process.env.CLAUDE_CONFIG_DIR = tempClaudeConfigDir
    clearDynamicTeamContext()
  })

  afterEach(async () => {
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
    if (originalAgentTeamsEnv === undefined) {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
    } else {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = originalAgentTeamsEnv
    }
    clearDynamicTeamContext()

    if (tempClaudeConfigDir) {
      await rm(tempClaudeConfigDir, { recursive: true, force: true })
    }
  })

  test('returns a no-op result for repeated identical status updates', async () => {
    const taskId = await createTask(getTaskListId(), {
      subject: 'Investigate memory pressure',
      description: 'Find the dominant source of heap growth',
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const context = makeContext()
    const first = await TaskUpdateTool.call({ taskId, status: 'in_progress' }, context)
    expect(first.data.success).toBe(true)
    expect(first.data.updatedFields).toEqual(['status'])
    expect(first.data.noOp).toBeUndefined()

    const second = await TaskUpdateTool.call({ taskId, status: 'in_progress' }, context)
    expect(second.data.success).toBe(true)
    expect(second.data.updatedFields).toEqual([])
    expect(second.data.noOp).toBe(true)
    expect(second.data.noOpReason).toContain('already in_progress')

    const rendered = TaskUpdateTool.mapToolResultToToolResultBlockParam(
      second.data,
      'tool-use-1',
    )
    expect(rendered.content).toContain('do not repeat the same TaskUpdate')

    const task = await getTask(getTaskListId(), taskId)
    expect(task?.status).toBe('in_progress')
  })

  test('treats unchanged metadata as no-op but still applies real metadata changes', async () => {
    const taskId = await createTask(getTaskListId(), {
      subject: 'Stabilize transcript growth',
      description: 'Reduce redundant task-state churn',
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
      metadata: { phase: 'observe' },
    })

    const context = makeContext()

    const unchanged = await TaskUpdateTool.call(
      { taskId, metadata: { phase: 'observe' } },
      context,
    )
    expect(unchanged.data.success).toBe(true)
    expect(unchanged.data.noOp).toBe(true)
    expect(unchanged.data.updatedFields).toEqual([])

    const changed = await TaskUpdateTool.call(
      { taskId, metadata: { phase: 'fix' } },
      context,
    )
    expect(changed.data.success).toBe(true)
    expect(changed.data.noOp).toBeUndefined()
    expect(changed.data.updatedFields).toEqual(['metadata'])

    const task = await getTask(getTaskListId(), taskId)
    expect(task?.metadata).toEqual({ phase: 'fix' })
  })

  test('does not swallow dependency updates when status is unchanged', async () => {
    const blockerId = await createTask(getTaskListId(), {
      subject: 'Block downstream verification',
      description: 'Acts as a dependency target',
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })
    const taskId = await createTask(getTaskListId(), {
      subject: 'Keep status but add dependency',
      description: 'Should still count as a real update',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const result = await TaskUpdateTool.call(
      { taskId, status: 'in_progress', addBlocks: [blockerId] },
      makeContext(),
    )
    expect(result.data.success).toBe(true)
    expect(result.data.noOp).toBeUndefined()
    expect(result.data.updatedFields).toEqual(['blocks'])

    const task = await getTask(getTaskListId(), taskId)
    expect(task?.blocks).toEqual([blockerId])
  })

  test('still auto-assigns owner for in-progress swarm tasks even when status is unchanged', async () => {
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
    setDynamicTeamContext({
      agentId: 'researcher@test-team',
      agentName: 'researcher',
      teamName: 'test-team',
      planModeRequired: false,
    })

    const taskId = await createTask(getTaskListId(), {
      subject: 'Claim existing in-progress task',
      description: 'Owner should be inferred from teammate context',
      status: 'in_progress',
      owner: undefined,
      blocks: [],
      blockedBy: [],
    })

    const result = await TaskUpdateTool.call(
      { taskId, status: 'in_progress' },
      makeContext(),
    )
    expect(result.data.success).toBe(true)
    expect(result.data.noOp).toBeUndefined()
    expect(result.data.updatedFields).toEqual(['owner'])

    const task = await getTask(getTaskListId(), taskId)
    expect(task?.owner).toBe('researcher')
  })

  test('treats deleting the last metadata key as a real update', async () => {
    const taskId = await createTask(getTaskListId(), {
      subject: 'Delete last metadata key',
      description: 'Metadata removal should not be mistaken for a no-op',
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
      metadata: { phase: 'observe' },
    })

    const result = await TaskUpdateTool.call(
      { taskId, metadata: { phase: null } },
      makeContext(),
    )
    expect(result.data.success).toBe(true)
    expect(result.data.noOp).toBeUndefined()
    expect(result.data.updatedFields).toEqual(['metadata'])

    const task = await getTask(getTaskListId(), taskId)
    expect(task?.metadata).toEqual({})
  })
})
