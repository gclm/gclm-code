import { z } from 'zod/v4'

const feishuMessageContentSchema = z
  .object({
    text: z.string().optional(),
  })
  .passthrough()

export const feishuUrlVerificationSchema = z.object({
  type: z.literal('url_verification'),
  challenge: z.string(),
})

export const feishuMessageEventSchema = z.object({
  schema: z.literal('2.0').optional(),
  header: z.object({
    event_id: z.string().optional(),
    event_type: z.string(),
    tenant_key: z.string().optional(),
    create_time: z.string().optional(),
  }),
  event: z.object({
    sender: z.object({
      sender_id: z.object({
        open_id: z.string().optional(),
        union_id: z.string().optional(),
        user_id: z.string().optional(),
      }),
      tenant_key: z.string().optional(),
    }),
    message: z
      .object({
        message_id: z.string().optional(),
        chat_id: z.string().optional(),
        message_type: z.string().optional(),
        content: z.string().optional(),
      })
      .optional(),
  }),
})

export const feishuActionPayloadSchema = z.object({
  open_id: z.string().optional(),
  user_id: z.string().optional(),
  tenant_key: z.string().optional(),
  token: z.string().optional(),
  action: z
    .object({
      value: z.record(z.string(), z.unknown()).optional(),
      name: z.string().optional(),
      tag: z.string().optional(),
    })
    .optional(),
})

export type FeishuUrlVerificationPayload = z.infer<
  typeof feishuUrlVerificationSchema
>
export type FeishuMessageEventPayload = z.infer<typeof feishuMessageEventSchema>
export type FeishuActionPayload = z.infer<typeof feishuActionPayloadSchema>

export function parseFeishuTextContent(
  rawContent: string | undefined,
): string | undefined {
  if (!rawContent) {
    return undefined
  }

  try {
    const parsed = JSON.parse(rawContent)
    const content = feishuMessageContentSchema.safeParse(parsed)
    return content.success ? content.data.text?.trim() || undefined : undefined
  } catch {
    return undefined
  }
}
