import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Lock, Mail } from 'lucide-react'
import {
  login,
  register,
  requestPasswordReset,
  resendRegistrationOtp,
  resetPasswordWithToken,
  verifyRegistration,
} from '../lib/auth'
import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onSuccess: (user: string) => void
}

type Mode = 'signin' | 'register' | 'otp' | 'forgot' | 'reset'

function readResetTokenFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('reset')?.trim() || ''
  } catch {
    return ''
  }
}

function clearResetTokenFromUrl() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('reset')) return
    url.searchParams.delete('reset')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  } catch {
    // ignore
  }
}

export function AuthPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>(() => (readResetTokenFromUrl() ? 'reset' : 'signin'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [resetToken, setResetToken] = useState(() => readResetTokenFromUrl())
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const token = readResetTokenFromUrl()
    if (token) {
      setResetToken(token)
      setMode('reset')
    }
  }, [])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setInfo(null)
    setOtp('')
    if (next !== 'reset') {
      setConfirmPassword('')
    }
  }

  const submitSignIn = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await login(username.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess(result.user)
  }

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await register(name.trim(), email.trim(), password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPendingEmail(result.email)
    setInfo(result.message)
    setMode('otp')
  }

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await verifyRegistration(pendingEmail, otp.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSuccess(result.user)
  }

  const resendOtp = async () => {
    setError(null)
    setBusy(true)
    const result = await resendRegistrationOtp(pendingEmail)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
  }

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await requestPasswordReset(email.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
  }

  const submitReset = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (!resetToken) {
      setError('Missing reset token. Open the link from your email again.')
      return
    }
    setBusy(true)
    const result = await resetPasswordWithToken(resetToken, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    clearResetTokenFromUrl()
    setPassword('')
    setConfirmPassword('')
    setInfo(result.message)
    setMode('signin')
  }

  const title =
    mode === 'signin'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : mode === 'otp'
          ? 'Verify email'
          : mode === 'forgot'
            ? 'Forgot password'
            : 'Reset password'

  const icon =
    mode === 'otp' || mode === 'forgot' ? (
      <Mail size={20} />
    ) : mode === 'reset' ? (
      <KeyRound size={20} />
    ) : (
      <Lock size={20} />
    )

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            {icon}
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-[var(--color-ink-soft)]">
              {APP_NAME} — {APP_TAGLINE}
            </p>
          </div>
        </div>

        {mode === 'signin' && (
          <form onSubmit={submitSignIn} className="space-y-4">
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
            {info && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
              <button
                type="button"
                className="text-[var(--color-ink-soft)] hover:underline"
                onClick={() => switchMode('register')}
              >
                Create an account
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="space-y-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Enter the email for your account. If it exists, we will send a reset link.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
              />
            </label>
            {info && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
                {info}
              </div>
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
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <p className="text-center text-sm text-[var(--color-ink-soft)]">
              <button
                type="button"
                className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                onClick={() => switchMode('signin')}
              >
                Back to sign in
              </button>
            </p>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} className="space-y-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Choose a new password for your account.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
                minLength={8}
              />
              <span className="text-xs text-[var(--color-ink-soft)]">
                Min 8 characters, with upper, lower, number, and symbol
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
                minLength={8}
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
              {busy ? 'Saving…' : 'Update password'}
            </button>
            <p className="text-center text-sm text-[var(--color-ink-soft)]">
              <button
                type="button"
                className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                onClick={() => {
                  clearResetTokenFromUrl()
                  switchMode('signin')
                }}
              >
                Back to sign in
              </button>
            </p>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={submitRegister} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Name
              </span>
              <input
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
                required
                minLength={8}
              />
              <span className="text-xs text-[var(--color-ink-soft)]">
                Min 8 characters, with upper, lower, number, and symbol
              </span>
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
              {busy ? 'Sending code…' : 'Continue'}
            </button>

            <p className="text-center text-sm text-[var(--color-ink-soft)]">
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-teal-700 hover:underline dark:text-teal-300"
                onClick={() => switchMode('signin')}
              >
                Sign in
              </button>
            </p>
          </form>
        )}

        {mode === 'otp' && (
          <form onSubmit={submitOtp} className="space-y-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Enter the 6-digit code we sent to{' '}
              <span className="font-semibold text-[var(--color-ink)]">{pendingEmail}</span>.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Verification code
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-center text-lg font-semibold tracking-[0.35em] outline-none focus:border-teal-500"
                required
                minLength={6}
                maxLength={6}
                placeholder="••••••"
              />
            </label>

            {info && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
                {info}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {busy ? 'Verifying…' : 'Verify and create account'}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                disabled={busy}
                className="font-semibold text-teal-700 hover:underline disabled:opacity-60 dark:text-teal-300"
                onClick={() => void resendOtp()}
              >
                Resend code
              </button>
              <button
                type="button"
                className="text-[var(--color-ink-soft)] hover:underline"
                onClick={() => switchMode('register')}
              >
                Edit details
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
