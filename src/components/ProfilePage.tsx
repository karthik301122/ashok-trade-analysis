import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, UserRound } from 'lucide-react'
import {
  changePassword,
  fetchProfile,
  requestPasswordReset,
  updateProfile,
} from '../lib/auth'

type Props = {
  user: string
  onUserChange: (user: string) => void
}

export function ProfilePage({ user, onUserChange }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState(user)
  const [canEdit, setCanEdit] = useState(true)
  const [canEmailReset, setCanEmailReset] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)
  const [profileBusy, setProfileBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passMsg, setPassMsg] = useState<string | null>(null)
  const [passErr, setPassErr] = useState<string | null>(null)
  const [passBusy, setPassBusy] = useState(false)

  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetErr, setResetErr] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const result = await fetchProfile()
      if (cancelled) return
      if (!result.ok) {
        setProfileErr(result.error)
        setLoading(false)
        return
      }
      setUsername(result.user)
      setDisplayName(result.displayName || '')
      setCanEdit(result.canEditProfile)
      setCanEmailReset(result.canReceiveAlertEmail)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setProfileErr(null)
    setProfileMsg(null)
    setProfileBusy(true)
    const result = await updateProfile({ username: username.trim(), displayName: displayName.trim() })
    setProfileBusy(false)
    if (!result.ok) {
      setProfileErr(result.error)
      return
    }
    onUserChange(result.user)
    setUsername(result.user)
    setDisplayName(result.displayName || '')
    setCanEdit(result.canEditProfile)
    setCanEmailReset(result.canReceiveAlertEmail)
    setProfileMsg('Profile saved')
  }

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPassErr(null)
    setPassMsg(null)
    if (newPassword !== confirmPassword) {
      setPassErr('New passwords do not match')
      return
    }
    setPassBusy(true)
    const result = await changePassword(currentPassword, newPassword)
    setPassBusy(false)
    if (!result.ok) {
      setPassErr(result.error)
      return
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPassMsg(result.message)
  }

  const sendResetLink = async () => {
    setResetErr(null)
    setResetMsg(null)
    setResetBusy(true)
    const result = await requestPasswordReset(user)
    setResetBusy(false)
    if (!result.ok) {
      setResetErr(result.error)
      return
    }
    setResetMsg(result.message)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
        <p className="text-sm text-[var(--color-ink-soft)]">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
          Your profile
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Update your name, username, and password. Forgot-password emails go to your login email.
        </p>
      </div>

      <form
        onSubmit={saveProfile}
        className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UserRound size={16} className="text-teal-700 dark:text-teal-300" />
          Account
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Name
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500 disabled:opacity-60"
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Username / email
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!canEdit}
            autoComplete="username"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500 disabled:opacity-60"
            required
          />
          <span className="text-xs text-[var(--color-ink-soft)]">
            Use an email address if you want password-reset links by mail.
          </span>
        </label>
        {!canEdit && (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            This account is managed by the server and cannot be edited in the app.
          </p>
        )}
        {profileErr && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {profileErr}
          </div>
        )}
        {profileMsg && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            {profileMsg}
          </div>
        )}
        <button
          type="submit"
          disabled={!canEdit || profileBusy}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {profileBusy ? 'Saving…' : 'Save profile'}
        </button>
      </form>

      <form
        onSubmit={savePassword}
        className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} className="text-teal-700 dark:text-teal-300" />
          Change password
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Current password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500 disabled:opacity-60"
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            New password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500 disabled:opacity-60"
            required
            minLength={8}
          />
          <span className="text-xs text-[var(--color-ink-soft)]">
            Min 8 characters, with upper, lower, number, and symbol
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Confirm new password
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2.5 text-sm outline-none focus:border-teal-500 disabled:opacity-60"
            required
            minLength={8}
          />
        </label>
        {passErr && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {passErr}
          </div>
        )}
        {passMsg && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            {passMsg}
          </div>
        )}
        <button
          type="submit"
          disabled={!canEdit || passBusy}
          className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {passBusy ? 'Updating…' : 'Update password'}
        </button>
      </form>

      {canEmailReset && (
        <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Email reset link</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Send a one-hour password reset link to <span className="font-medium text-[var(--color-ink)]">{user}</span>.
          </p>
          {resetErr && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {resetErr}
            </div>
          )}
          {resetMsg && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
              {resetMsg}
            </div>
          )}
          <button
            type="button"
            disabled={resetBusy}
            onClick={() => void sendResetLink()}
            className="rounded-lg border border-teal-600 px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60 dark:text-teal-200 dark:hover:bg-teal-950/40"
          >
            {resetBusy ? 'Sending…' : 'Email reset link'}
          </button>
        </div>
      )}
    </div>
  )
}
