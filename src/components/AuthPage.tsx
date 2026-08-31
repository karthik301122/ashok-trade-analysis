import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { login } from '../lib/auth'
import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onSuccess: (user: string) => void
}

export function AuthPage({ onSuccess }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const result = await login(username.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess(result.user)
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Lock size={20} />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              Sign in
            </h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {APP_NAME} — {APP_TAGLINE}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Email or username
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
              required
            />
          </label>

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
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
