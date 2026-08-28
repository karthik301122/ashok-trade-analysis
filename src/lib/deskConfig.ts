/**
 * Client-visible desk config from /api/health.
 */
export type DeskServerConfig = {
  productionMode: boolean
  browserUniverseFetch: boolean
  isAdmin: boolean
  provider?: string
}

const DEFAULT_CONFIG: DeskServerConfig = {
  productionMode: false,
  browserUniverseFetch: true,
  isAdmin: false,
}

export async function fetchDeskServerConfig(
  signal?: AbortSignal,
): Promise<DeskServerConfig> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), 8000)
  const linked = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal
  try {
    const res = await fetch('/api/health', { credentials: 'include', signal: linked })
    if (!res.ok) return DEFAULT_CONFIG
    const j = (await res.json()) as Partial<DeskServerConfig> & { provider?: string }
    return {
      productionMode: Boolean(j.productionMode),
      browserUniverseFetch: Boolean(j.browserUniverseFetch),
      isAdmin: Boolean(j.isAdmin),
      provider: typeof j.provider === 'string' ? j.provider : undefined,
    }
  } catch {
    return DEFAULT_CONFIG
  } finally {
    clearTimeout(timer)
  }
}
