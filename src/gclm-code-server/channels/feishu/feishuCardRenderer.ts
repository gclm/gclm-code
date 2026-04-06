export type FeishuCardHeaderTemplate =
  | 'blue'
  | 'green'
  | 'orange'
  | 'red'
  | 'purple'
  | 'indigo'
  | 'yellow'
  | 'turquoise'
  | 'grey'

export type FeishuCardAction = {
  label: string
  action: string
  style?: 'default' | 'primary' | 'danger'
  value?: Record<string, string>
}

export type RenderFeishuSessionCardInput = {
  title: string
  stage:
    | 'accepted'
    | 'running'
    | 'permission_pending'
    | 'permission_resolved'
    | 'session_ready'
    | 'completed'
    | 'failed'
    | 'interrupted'
  summary: string
  sessionId: string
  requestId?: string
  updatedAt?: string
  bodyMarkdown?: string
  actions?: FeishuCardAction[]
}

type FeishuCardElement = Record<string, unknown>

type BuildFeishuCardInput = {
  header?: {
    template: FeishuCardHeaderTemplate
    title: string
  }
  summary?: string
  elements: FeishuCardElement[]
}

function templateForStage(stage: RenderFeishuSessionCardInput['stage']): FeishuCardHeaderTemplate {
  switch (stage) {
    case 'permission_pending':
      return 'orange'
    case 'failed':
      return 'red'
    case 'completed':
    case 'session_ready':
    case 'permission_resolved':
      return 'green'
    case 'interrupted':
      return 'grey'
    default:
      return 'blue'
  }
}

function labelForStage(stage: RenderFeishuSessionCardInput['stage']): string {
  switch (stage) {
    case 'accepted':
      return '已接收'
    case 'running':
      return '处理中'
    case 'permission_pending':
      return '等待权限'
    case 'permission_resolved':
      return '权限已处理'
    case 'session_ready':
      return '会话可继续'
    case 'completed':
      return '已完成'
    case 'failed':
      return '执行失败'
    case 'interrupted':
      return '已中断'
  }
}

function buttonTypeForStyle(style: FeishuCardAction['style']): string {
  switch (style) {
    case 'primary':
      return 'primary_filled'
    case 'danger':
      return 'danger'
    default:
      return 'default'
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(maxLength - 1, 1))}…`
}

export function buildFeishuCard(input: BuildFeishuCardInput): string {
  const card: Record<string, unknown> = {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
      update_multi: true,
      ...(input.summary
        ? {
            summary: {
              content: truncate(input.summary, 120),
            },
          }
        : {}),
    },
    body: {
      elements: input.elements,
    },
  }

  if (input.header) {
    card.header = {
      template: input.header.template,
      title: {
        tag: 'plain_text',
        content: input.header.title,
      },
    }
  }

  return JSON.stringify(card)
}

function buildFacts(input: RenderFeishuSessionCardInput): FeishuCardElement {
  const facts = [
    {
      label: '阶段',
      value: labelForStage(input.stage),
    },
    {
      label: 'Session',
      value: input.sessionId,
    },
    ...(input.requestId ? [{ label: 'Request', value: input.requestId }] : []),
    ...(input.updatedAt ? [{ label: 'Updated', value: input.updatedAt }] : []),
  ]

  return {
    tag: 'column_set',
    flex_mode: 'none',
    background_style: 'default',
    columns: facts.map(fact => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      vertical_align: 'top',
      elements: [
        {
          tag: 'markdown',
          content: `**${fact.label}**\n${truncate(fact.value, 120)}`,
        },
      ],
    })),
  }
}

export function createFeishuStreamingCardDefinition(
  input: RenderFeishuSessionCardInput,
): Record<string, unknown> {
  const content = truncate((input.bodyMarkdown?.trim() || input.summary).trim(), 3500)
  const elements: FeishuCardElement[] = [
    {
      tag: 'markdown',
      content,
      element_id: 'content',
    },
    { tag: 'hr' },
    buildFacts(input),
  ]

  if (input.actions?.length) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'column_set',
      flex_mode: 'flow',
      columns: input.actions.map(action => ({
        tag: 'column',
        width: 'auto',
        vertical_align: 'top',
        elements: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: action.label,
            },
            type: buttonTypeForStyle(action.style),
            behaviors: [
              {
                type: 'callback',
                value: {
                  action: action.action,
                  ...(action.value ?? {}),
                },
              },
            ],
          },
        ],
      })),
    })
  }

  return {
    schema: '2.0',
    config: {
      wide_screen_mode: true,
      update_multi: true,
      streaming_mode: true,
      summary: {
        content: truncate(`${labelForStage(input.stage)} · ${input.summary}`, 120),
      },
      streaming_config: {
        print_frequency_ms: { default: 50 },
        print_step: { default: 2 },
      },
    },
    header: {
      template: templateForStage(input.stage),
      title: {
        tag: 'plain_text',
        content: input.title,
      },
    },
    body: {
      elements,
    },
  }
}

export function renderFeishuSessionCard(input: RenderFeishuSessionCardInput): string {
  const elements: FeishuCardElement[] = [
    {
      tag: 'markdown',
      content: `**${labelForStage(input.stage)}**\n${truncate(input.summary, 600)}`,
    },
    buildFacts(input),
  ]

  if (input.bodyMarkdown?.trim()) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'markdown',
      content: truncate(input.bodyMarkdown.trim(), 3500),
    })
  }

  if (input.actions?.length) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'column_set',
      flex_mode: 'flow',
      columns: input.actions.map(action => ({
        tag: 'column',
        width: 'auto',
        vertical_align: 'top',
        elements: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: action.label,
            },
            type: buttonTypeForStyle(action.style),
            behaviors: [
              {
                type: 'callback',
                value: {
                  action: action.action,
                  ...(action.value ?? {}),
                },
              },
            ],
          },
        ],
      })),
    })
  }

  return buildFeishuCard({
    header: {
      template: templateForStage(input.stage),
      title: input.title,
    },
    summary: `${labelForStage(input.stage)} · ${input.summary}`,
    elements,
  })
}
