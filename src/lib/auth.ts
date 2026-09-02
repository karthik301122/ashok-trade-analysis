export type PatternAlertWatch = {
  ticker: string
  patternIds: string[]
}

export type AuthMe = {
  user: string | null
  authRequired: boolean
  canReceiveAlertEmail?: boolean
  alertEmailOptIn?: boolean
  patternAlertIds?: string[]
  patternAlertWatches?: PatternAlertWatch[]
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
      canReceiveAlertEmail: Boolean(json.canReceiveAlertEmail),
      alertEmailOptIn: Boolean(json.alertEmailOptIn),
      patternAlertIds: Array.isArray(json.patternAlertIds) ? json.patternAlertIds : [],
      patternAlertWatches: Array.isArray(json.patternAlertWatches) ? json.patternAlertWatches : [],
    }
  } catch {
    const cfg = await fetchAuthConfig()
    return { user: null, authRequired: cfg.authRequired }
  }
}

export async function setPatternAlertWatches(
  watches: PatternAlertWatch[],
): Promise<
  { ok: true; patternAlertWatches: PatternAlertWatch[]; patternAlertIds: string[] } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/auth/pattern-alert-prefs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watches }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: (json as { error?: string }).error || 'Could not update pattern alerts',
      }
    }
    const saved = (json as { patternAlertWatches?: PatternAlertWatch[] }).patternAlertWatches
    const ids = (json as { patternAlertIds?: string[] }).patternAlertIds
    return {
      ok: true,
      patternAlertWatches: Array.isArray(saved) ? saved : watches,
      patternAlertIds: Array.isArray(ids) ? ids : [],
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function setPatternAlertIds(
  patternIds: string[],
): Promise<{ ok: true; patternAlertIds: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/pattern-alert-prefs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternIds }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: (json as { error?: string }).error || 'Could not update pattern alerts',
      }
    }
    const saved = (json as { patternAlertIds?: string[] }).patternAlertIds
    return { ok: true, patternAlertIds: Array.isArray(saved) ? saved : patternIds }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function setAlertEmailOptIn(
  optIn: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/alert-email-opt-in', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optIn }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not update email preference' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Network error' }
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
