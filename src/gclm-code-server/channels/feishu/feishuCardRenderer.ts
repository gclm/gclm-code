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

export function renderFeishuSessionCard(input: RenderFeishuSessionCardInput): string {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: 'markdown',
      content: `**状态**\n${truncate(input.summary, 600)}`,
    },
    {
      tag: 'note',
      elements: [
        { tag: 'plain_text', content: `Session: ${input.sessionId}` },
        ...(input.requestId
          ? [{ tag: 'plain_text', content: `Request: ${input.requestId}` }]
          : []),
        ...(input.updatedAt
          ? [{ tag: 'plain_text', content: `Updated: ${input.updatedAt}` }]
          : []),
      ],
    },
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

  return JSON.stringify({
    schema: '2.0',
    config: {
      wide_screen_mode: true,
      update_multi: true,
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
  })
}
