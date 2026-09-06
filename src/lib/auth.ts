export type PatternAlertWatch = {
  ticker: string
  patternIds: string[]
}

export type AuthMe = {
  user: string | null
  displayName?: string | null
  authRequired: boolean
  canReceiveAlertEmail?: boolean
  alertEmailOptIn?: boolean
  /** Email only when pattern score is at or above this % (default 80). */
  alertEmailMinScore?: number
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
    const minScore = Number(json.alertEmailMinScore)
    return {
      user: json.user ?? null,
      displayName: json.displayName ?? null,
      authRequired: Boolean(json.authRequired),
      canReceiveAlertEmail: Boolean(json.canReceiveAlertEmail),
      alertEmailOptIn: Boolean(json.alertEmailOptIn),
      alertEmailMinScore: Number.isFinite(minScore) ? Math.max(60, Math.min(100, Math.round(minScore))) : 80,
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
  minScore?: number,
): Promise<
  { ok: true; alertEmailMinScore?: number } | { ok: false; error: string }
> {
  try {
    const body: { optIn: boolean; minScore?: number } = { optIn }
    if (minScore != null) body.minScore = minScore
    const res = await fetch('/api/auth/alert-email-opt-in', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not update email preference' }
    }
    const saved = Number((json as { alertEmailMinScore?: number }).alertEmailMinScore)
    return {
      ok: true,
      alertEmailMinScore: Number.isFinite(saved) ? saved : minScore,
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function setAlertEmailMinScore(
  minScore: number,
): Promise<{ ok: true; alertEmailMinScore: number } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/alert-email-opt-in', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minScore }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not update email threshold' }
    }
    const saved = Number((json as { alertEmailMinScore?: number }).alertEmailMinScore)
    return {
      ok: true,
      alertEmailMinScore: Number.isFinite(saved) ? saved : minScore,
    }
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

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<
  { ok: true; email: string; message: string; expiresInSec?: number } | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Registration failed' }
    }
    return {
      ok: true,
      email: (json as { email: string }).email,
      message: (json as { message?: string }).message || 'Check your email for a code',
      expiresInSec: (json as { expiresInSec?: number }).expiresInSec,
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function verifyRegistration(
  email: string,
  otp: string,
): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/verify-registration', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Verification failed' }
    }
    return { ok: true, user: (json as { user: string }).user }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function resendRegistrationOtp(
  email: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/resend-registration-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not resend code' }
    }
    return {
      ok: true,
      message: (json as { message?: string }).message || 'Code resent',
    }
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

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not send reset email' }
    }
    return {
      ok: true,
      message: (json as { message?: string }).message || 'Check your email for a reset link',
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not reset password' }
    }
    return {
      ok: true,
      message: (json as { message?: string }).message || 'Password updated',
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export type ProfileInfo = {
  user: string
  displayName: string | null
  canEditProfile: boolean
  canReceiveAlertEmail: boolean
}

export async function fetchProfile(): Promise<
  { ok: true } & ProfileInfo | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/auth/profile', { credentials: 'include' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not load profile' }
    }
    return {
      ok: true,
      user: String((json as { user?: string }).user || ''),
      displayName: (json as { displayName?: string | null }).displayName ?? null,
      canEditProfile: Boolean((json as { canEditProfile?: boolean }).canEditProfile),
      canReceiveAlertEmail: Boolean((json as { canReceiveAlertEmail?: boolean }).canReceiveAlertEmail),
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function updateProfile(input: {
  username?: string
  displayName?: string
}): Promise<{ ok: true } & ProfileInfo | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not update profile' }
    }
    return {
      ok: true,
      user: String((json as { user?: string }).user || ''),
      displayName: (json as { displayName?: string | null }).displayName ?? null,
      canEditProfile: Boolean((json as { canEditProfile?: boolean }).canEditProfile),
      canReceiveAlertEmail: Boolean((json as { canReceiveAlertEmail?: boolean }).canReceiveAlertEmail),
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (json as { error?: string }).error || 'Could not change password' }
    }
    return {
      ok: true,
      message: (json as { message?: string }).message || 'Password updated',
    }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}
