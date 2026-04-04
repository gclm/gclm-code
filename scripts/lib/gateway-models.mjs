export function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '')
}

function getPathname(url) {
  try {
    return new URL(url).pathname || ''
  } catch {
    const schemeSep = url.indexOf('://')
    const hostStart = schemeSep >= 0 ? schemeSep + 3 : 0
    const pathStart = url.indexOf('/', hostStart)
    return pathStart >= 0 ? url.slice(pathStart) : ''
  }
}

export function getMappedModelsEndpoint(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl)
  const pathname = getPathname(normalized).replace(/\/+$/, '')

  if (/^\/v\d+$/.test(pathname)) {
    return `${normalized}/models`
  }

  return `${normalized}/v1/models`
}

export function extractModelIds(payload) {
  const listFrom = items =>
    (items || [])
      .map(item => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') return item.id || item.model || item.name || null
        return null
      })
      .filter(Boolean)

  if (Array.isArray(payload)) return listFrom(payload)
  if (!payload || typeof payload !== 'object') return []
  if (Array.isArray(payload.data)) return listFrom(payload.data)
  if (Array.isArray(payload.models)) return listFrom(payload.models)

  return []
}

export async function fetchGatewayModels(baseUrl, apiKey) {
  const endpoint = getMappedModelsEndpoint(baseUrl)
  const res = await fetch(endpoint, { headers: { 'x-api-key': apiKey } })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${endpoint}`)
  }

  const payload = await res.json()
  const models = extractModelIds(payload)

  if (models.length === 0) {
    throw new Error(`No models discovered from ${endpoint}`)
  }

  return { endpoint, models }
}
