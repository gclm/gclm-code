export function trimGatewayBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function hasGatewayVersionSuffix(raw: string): boolean {
  const trimmed = trimGatewayBaseUrl(raw)

  try {
    return /\/v\d+$/.test(new URL(trimmed).pathname)
  } catch {
    return /\/v\d+$/.test(trimmed)
  }
}
