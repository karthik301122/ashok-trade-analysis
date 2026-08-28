export type AuthMe = {
  user: string | null
  authRequired: boolean
}

export type AuthConfig = {
  authRequired: boolean
  registrationOpen: boolean
  inviteRequired: boolean
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch('/api/auth/config', { credentials: 'include' })
    if (!res.ok) {
      return { authRequired: false, registrationOpen: false, inviteRequired: false }
    }
    const json = (await res.json()) as AuthConfig
    return {
      authRequired: Boolean(json.authRequired),
      registrationOpen: Boolean(json.registrationOpen),
      inviteRequired: Boolean(json.inviteRequired),
    }
  } catch {
    return { authRequired: false, registrationOpen: false, inviteRequired: false }
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
      return { user: null, authRequired: false }
    }
    return {
      user: json.user ?? null,
      authRequired: Boolean(json.authRequired),
    }
  } catch {
    // Dev without middleware / offline — don't block the UI
    return { user: null, authRequired: false }
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

export async function register(
  username: string,
  password: string,
  inviteCode?: string,
): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, inviteCode }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Registration failed' }
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
