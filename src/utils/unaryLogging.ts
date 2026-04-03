import {
  type SafeEventValue,
  logEvent,
} from 'src/services/analytics/index.js'

export type CompletionType =
  | 'str_replace_single'
  | 'str_replace_multi'
  | 'write_file_single'
  | 'tool_use_single'

type LogEvent = {
  completion_type: CompletionType
  event: 'accept' | 'reject' | 'response'
  metadata: {
    language_name: string | Promise<string>
    message_id: string
    platform: string
    hasFeedback?: boolean
  }
}

export async function logUnaryEvent(event: LogEvent): Promise<void> {
  logEvent('tengu_unary_event', {
    event:
      event.event as SafeEventValue,
    completion_type:
      event.completion_type as SafeEventValue,
    language_name: (await event.metadata
      .language_name) as SafeEventValue,
    message_id: event.metadata
      .message_id as SafeEventValue,
    platform: event.metadata
      .platform as SafeEventValue,
    ...(event.metadata.hasFeedback !== undefined && {
      hasFeedback: event.metadata.hasFeedback,
    }),
  })
}
