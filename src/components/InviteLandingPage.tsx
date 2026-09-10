import { useEffect, useMemo, useState } from 'react'
import { APP_NAME } from '../lib/brand'
import { resolveBrand } from '../lib/brand'

type InvitePreview = {
  email: string
  orgName?: string | null
  role?: string
  status?: string
  seats?: number
  memberCount?: number
  seatsAvailable?: number
  branding?: {
    productName?: string
    primaryColor?: string
    logoUrl?: string
    supportEmail?: string
  } | null
  token?: string
}

type Props = {
  token: string
  user: string | null
  authChecking: boolean
  onSignIn: () => void
  onJoined?: () => void
}

export function InviteLandingPage({ token, user, authChecking, onSignIn, onJoined }: Props) {
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const res = await fetch(`/api/orgs/invite/${encodeURIComponent(token)}`)
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setErr(json.error || 'Invite not found')
          setInvite(null)
          return
        }
        const inv = json.invite as InvitePreview
        setInvite(inv)
        if (inv?.branding) resolveBrand(inv.branding)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load invite')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const emailMatch = useMemo(() => {
    if (!user || !invite?.email) return false
    return user.trim().toLowerCase() === invite.email.trim().toLowerCase()
  }, [user, invite])

  const canJoin =
    invite &&
    ['pending', 'checkout_started'].includes(String(invite.status || 'pending')) &&
    (invite.seatsAvailable ?? 0) > 0

  const join = async () => {
    if (!token) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/orgs/invite/${encodeURIComponent(token)}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Could not join organisation')
        return
      }
      setMsg('You joined under your school seat. Opening the desk…')
      setInvite((prev) => (prev ? { ...prev, status: 'activated' } : prev))
      onJoined?.()
      window.setTimeout(() => {
        window.location.href = '/'
      }, 800)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Organisation invite
      </p>
      {loading || authChecking ? (
        <p className="mt-4 text-sm text-[var(--color-ink-soft)]">Loading invite…</p>
      ) : err && !invite ? (
        <p className="mt-4 text-sm text-rose-600">{err}</p>
      ) : invite ? (
        <>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold">
            Join {invite.orgName || 'organisation'}
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            Invited email: <strong className="text-[var(--color-ink)]">{invite.email}</strong>
            {invite.role ? ` · role ${invite.role}` : ''}
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Uses a <strong>school seat</strong> (not an individual plan). Seats:{' '}
            {invite.memberCount ?? 0} used · {invite.seatsAvailable ?? 0} available
            {invite.seats != null ? ` of ${invite.seats}` : ''}.
          </p>
          {invite.status === 'activated' && (
            <p className="mt-4 text-sm text-teal-800 dark:text-teal-200">
              This invite is already activated. Open the desk to continue.
            </p>
          )}
          {msg && <p className="mt-3 text-sm text-teal-800 dark:text-teal-200">{msg}</p>}
          {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
          <div className="mt-6 flex flex-wrap gap-2">
            {!user ? (
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Sign in to continue
              </button>
            ) : !emailMatch ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You are signed in as {user}. Sign in as {invite.email} to join.
              </p>
            ) : canJoin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void join()}
                className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {busy ? 'Joining…' : 'Join with school seat'}
              </button>
            ) : (
              <p className="text-sm text-[var(--color-ink-soft)]">
                This invite cannot be used right now ({invite.status || 'unavailable'}
                {(invite.seatsAvailable ?? 0) <= 0 ? ' · no seats left — ask your school to buy seats' : ''}
                ).
              </p>
            )}
            <a
              href="/"
              className="rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold"
            >
              Back to {APP_NAME}
            </a>
          </div>
        </>
      ) : null}
    </div>
  )
}
