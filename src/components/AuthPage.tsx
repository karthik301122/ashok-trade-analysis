import { useEffect, useState, type FormEvent } from 'react'
import { Lock, UserPlus } from 'lucide-react'
import { fetchAuthConfig, login, register } from '../lib/auth'
import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onSuccess: (user: string) => void
}

type Mode = 'login' | 'register'

export function AuthPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [inviteRequired, setInviteRequired] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await fetchAuthConfig()
      if (cancelled) return
      setRegistrationOpen(cfg.registrationOpen)
      setInviteRequired(cfg.inviteRequired)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result =
      mode === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password, inviteCode.trim() || undefined)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess(result.user)
  }

  const title = mode === 'login' ? 'Sign in' : 'Create account'
  const subtitle =
    mode === 'login'
      ? `${APP_NAME} — ${APP_TAGLINE}`
      : 'Register to access the private desk'

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            {mode === 'login' ? <Lock size={20} /> : <UserPlus size={20} />}
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-[var(--color-ink-soft)]">{subtitle}</p>
          </div>
        </div>

        {registrationOpen && (
          <div className="mb-4 flex rounded-lg border border-[var(--color-border)] p-0.5 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 rounded-md px-3 py-2 font-semibold transition ${
                mode === 'login'
                  ? 'bg-teal-700 text-white'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setError(null)
              }}
              className={`flex-1 rounded-md px-3 py-2 font-semibold transition ${
                mode === 'register'
                  ? 'bg-teal-700 text-white'
                  : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
              }`}
            >
              Register
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Username
            </span>
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Password
            </span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            {mode === 'register' && (
              <p className="text-xs text-[var(--color-ink-soft)]">At least 8 characters</p>
            )}
          </label>

          {mode === 'register' && inviteRequired && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Invite code
              </span>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
              />
            </label>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {busy
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
