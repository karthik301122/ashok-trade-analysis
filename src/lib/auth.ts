export type AuthMe = {
  user: string | null
  authRequired: boolean
}

export type AuthConfig = {
  authRequired: boolean
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch('/api/auth/config', { credentials: 'include' })
    if (!res.ok) {
      return { authRequired: false }
    }
    const json = (await res.json()) as AuthConfig
    return {
      authRequired: Boolean(json.authRequired),
    }
  } catch {
    return { authRequired: false }
  }
}

export async function fetchAuthMe(): Promise<AuthMe> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    const json = (await res.json()) as AuthMe
    if (res.status === 401) {
      return { user: null, authRequired: json.authRequired !== false }
    }
    if (!res.ok) {
      const cfg = await fetchAuthConfig()
      return { user: null, authRequired: cfg.authRequired }
    }
    return {
      user: json.user ?? null,
      authRequired: Boolean(json.authRequired),
    }
  } catch {
    const cfg = await fetchAuthConfig()
    return { user: null, authRequired: cfg.authRequired }
  }
}

export async function login(username: string, password: string): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Login failed' }
    }
    return { ok: true, user: (json as { user: string }).user }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  } catch {
    // ignore
  }
}
