import { getDynamicConfig_CACHED_MAY_BE_STALE } from './growthbook.js'

// Mangled name kept for compatibility with existing cached config keys.
const SINK_KILLSWITCH_CONFIG_NAME = 'tengu_frond_boric'

export type SinkName = 'datadog' | 'firstParty'

/**
 * Runtime config that disables individual legacy sink integrations.
 * Shape: { datadog?: boolean, firstParty?: boolean }
 */
export function isSinkKilled(sink: SinkName): boolean {
  const config = getDynamicConfig_CACHED_MAY_BE_STALE<
    Partial<Record<SinkName, boolean>>
  >(SINK_KILLSWITCH_CONFIG_NAME, {})

  return config?.[sink] === true
}
