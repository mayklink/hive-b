const STORAGE_KEY = 'hive-web-auth'

interface WebAuthConfig {
  serverUrl: string
  apiKey: string
}

export function getWebAuth(): WebAuthConfig | null {
  // Check URL params first (for deep linking)
  // Supports: ?server=...&key=... OR ?apiKey=... (defaults server to current origin)
  const params = new URLSearchParams(window.location.search)
  const server = params.get('server')
  const key = params.get('key') || params.get('apiKey')
  if (key) {
    const config = { serverUrl: server || window.location.origin, apiKey: key }
    saveWebAuth(config)
    // Clean URL
    const url = new URL(window.location.href)
    url.searchParams.delete('server')
    url.searchParams.delete('key')
    url.searchParams.delete('apiKey')
    window.history.replaceState({}, '', url.toString())
    return config
  }

  // Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as WebAuthConfig
  } catch {
    return null
  }
}

export function saveWebAuth(config: WebAuthConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearWebAuth(): void {
  localStorage.removeItem(STORAGE_KEY)
}
