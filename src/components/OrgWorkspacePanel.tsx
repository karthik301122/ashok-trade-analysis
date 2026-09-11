import { useEffect, useState } from 'react'
import { resolveBrand } from '../lib/brand'
import { DailyScanPanel } from './DailyScanPanel'

type Org = {
  id: string
  name: string
  seats: number
  role?: string
  billingStatus?: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  branding?: {
    productName?: string
    primaryColor?: string
    logoUrl?: string
    supportEmail?: string
  }
}

type Member = { username: string; role: string; cohort?: string | null; joinedAt?: number }

type Invite = {
  email: string
  role: string
  status: string
  expiresAt?: number
  inviteUrl?: string
  token?: string
}

type Watchlist = { id: string; name: string; tickers: string[] }

type Publication = {
  id: string
  title: string
  note?: string | null
  kind: string
  version: number
  createdAt: number
}

const ROLE_OPTIONS = ['admin', 'trainer', 'student', 'member'] as const

function billingLabel(status?: string) {
  switch (String(status || 'none')) {
    case 'active':
      return { text: 'Active', className: 'text-teal-800 dark:text-teal-200' }
    case 'pending':
      return { text: 'Payment pending', className: 'text-amber-800 dark:text-amber-200' }
    case 'past_due':
      return { text: 'Payment failed / past due', className: 'text-rose-700 dark:text-rose-300' }
    case 'failed':
      return { text: 'Checkout canceled', className: 'text-rose-700 dark:text-rose-300' }
    case 'canceled':
      return { text: 'Canceled', className: 'text-[var(--color-ink-soft)]' }
    default:
      return { text: 'No subscription', className: 'text-[var(--color-ink-soft)]' }
  }
}

function publicInviteUrl(invite: Invite) {
  if (invite.inviteUrl) return invite.inviteUrl
  if (invite.token) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/invite?token=${encodeURIComponent(invite.token)}`
  }
  return null
}

/** Org seats, branding, trainer publishes — Organisation tab (role-specific) or Profile watchlists. */
export function OrgWorkspacePanel({
  layout = 'embedded',
  showWatchlists,
  showOrg = true,
}: {
  layout?: 'page' | 'embedded'
  showWatchlists?: boolean
  showOrg?: boolean
} = {}) {
  const includeWatchlists = showWatchlists ?? layout === 'embedded'
  const [orgs, setOrgs] = useState<Org[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [pubs, setPubs] = useState<Publication[]>([])
  const [orgName, setOrgName] = useState('')
  const [wlName, setWlName] = useState('My watchlist')
  const [wlEditId, setWlEditId] = useState<string | null>(null)
  const [wlTickers, setWlTickers] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<(typeof ROLE_OPTIONS)[number]>('student')
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [pubTitle, setPubTitle] = useState('Today’s Stage 2 focus')
  const [pubNote, setPubNote] = useState('Review these names before the open.')
  const [pubKind, setPubKind] = useState('pattern')
  const [brandForm, setBrandForm] = useState({
    productName: '',
    primaryColor: '#0f766e',
    logoUrl: '',
    supportEmail: '',
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stripeConfigured, setStripeConfigured] = useState(false)
  const [seatCount, setSeatCount] = useState('10')
  const active = orgs[0]
  const bill = billingLabel(active?.billingStatus)
  const roleKey = String(active?.role || '').toLowerCase()
  const canManage = Boolean(active && ['owner', 'admin'].includes(roleKey))
  const isTrainer = Boolean(active && roleKey === 'trainer')
  const isStudent = Boolean(active && !canManage && !isTrainer)
  const canPublish = Boolean(active && ['owner', 'admin', 'trainer'].includes(roleKey))
  const hasSubscription = Boolean(active?.stripeSubscriptionId || active?.stripeCustomerId)
  const showBuySeats =
    canManage &&
    (!active?.billingStatus ||
      active.billingStatus === 'none' ||
      active.billingStatus === 'canceled' ||
      active.billingStatus === 'failed' ||
      (active.billingStatus === 'pending' && !active.stripeSubscriptionId))

  const roleLabel = !active
    ? null
    : canManage
      ? roleKey === 'admin'
        ? 'Admin'
        : 'Owner'
      : isTrainer
        ? 'Trainer'
        : 'Student'

  const roleBlurb = !active
    ? 'Create a school organisation to buy seats and invite students, or join with an invite from your school.'
    : canManage
      ? 'Buy seats, invite students, manage roles and branding, and publish to your class.'
      : isTrainer
        ? 'Publish notes and daily focus for your class. Roster is view-only — ask an owner to change roles or seats.'
        : 'Your school seat unlocks the desk. Read trainer publications and the daily scan here.'

  const pageTitle =
    !showOrg
      ? 'Watchlists'
      : layout === 'page'
        ? !active
          ? 'Organisation'
          : canManage
            ? 'Organisation · Owner'
            : isTrainer
              ? 'Organisation · Trainer'
              : 'Organisation · Student'
        : 'Organisations & watchlists'

  const reload = async () => {
    setErr(null)
    try {
      const [o, w, cfg] = await Promise.all([
        fetch('/api/orgs', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/watchlists', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/auth/config', { credentials: 'include' }).then((r) => r.json()),
      ])
      setStripeConfigured(Boolean(cfg?.stripeConfigured))
      setOrgs(Array.isArray(o?.orgs) ? o.orgs : [])
      setWatchlists(Array.isArray(w?.watchlists) ? w.watchlists : [])
      const first = Array.isArray(o?.orgs) ? o.orgs[0] : null
      if (first?.id) {
        const [detail, inv, p] = await Promise.all([
          fetch(`/api/orgs/${first.id}`, { credentials: 'include' }).then((r) => r.json()),
          canManageRoles(first)
            ? fetch(`/api/orgs/${first.id}/invites`, { credentials: 'include' }).then((r) =>
                r.json(),
              )
            : Promise.resolve({ invites: [] }),
          fetch(`/api/orgs/${first.id}/publications`, { credentials: 'include' }).then((r) =>
            r.json(),
          ),
        ])
        setMembers(Array.isArray(detail?.members) ? detail.members : [])
        setInvites(Array.isArray(inv?.invites) ? inv.invites : [])
        setPubs(Array.isArray(p?.publications) ? p.publications : [])
        const b = first.branding || detail?.org?.branding || {}
        setBrandForm({
          productName: b.productName || first.name || '',
          primaryColor: b.primaryColor || '#0f766e',
          logoUrl: b.logoUrl || '',
          supportEmail: b.supportEmail || '',
        })
        if (first.branding || b.productName) resolveBrand(b)
      } else {
        setMembers([])
        setInvites([])
        setPubs([])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load org tools')
    }
  }

  function canManageRoles(org: Org | null) {
    return Boolean(org && ['owner', 'admin'].includes(String(org.role || '')))
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!active?.seats || active.seats < 1) return
    setSeatCount(String(active.seats))
  }, [active?.id, active?.seats])

  const createOrg = async () => {
    setMsg(null)
    setErr(null)
    const res = await fetch('/api/orgs', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName.trim() || 'My school' }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'Could not create organisation')
      return
    }
    setOrgName('')
    setMsg('Organisation created')
    await reload()
  }

  const createWatchlist = async () => {
    const res = await fetch('/api/watchlists', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wlName.trim() || 'Watchlist', tickers: [] }),
    })
    if (!res.ok) {
      setErr('Could not create watchlist')
      return
    }
    setMsg('Watchlist created')
    await reload()
  }

  const saveWatchlistTickers = async (id: string) => {
    const tickers = wlTickers
      .split(/[\s,;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
    const res = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    })
    if (!res.ok) {
      setErr('Could not save watchlist tickers')
      return
    }
    setMsg('Watchlist updated')
    setWlEditId(null)
    await reload()
  }

  const invite = async () => {
    if (!active?.id || !inviteEmail.trim()) return
    const res = await fetch(`/api/orgs/${active.id}/invites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'Invite failed')
      return
    }
    const url = json.invite?.inviteUrl || publicInviteUrl(json.invite || {})
    setLastInviteUrl(url)
    if (url) void copyLink(url)
    setMsg(url ? 'Invite created. Link copied — email sent if SMTP is configured.' : 'Invite created')
    setInviteEmail('')
    await reload()
  }

  const inviteCsv = async (file: File | null) => {
    if (!active?.id || !file) return
    const text = await file.text()
    const res = await fetch(`/api/orgs/${active.id}/invites/csv`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text, role: inviteRole }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'CSV invite failed')
      return
    }
    const n = Array.isArray(json.created) ? json.created.length : 0
    const e = Array.isArray(json.errors) ? json.errors.length : 0
    setMsg(`CSV invites: ${n} created${e ? `, ${e} failed` : ''}`)
    await reload()
  }

  const revoke = async (email: string) => {
    if (!active?.id) return
    const res = await fetch(`/api/orgs/${active.id}/invites/revoke`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setErr(json.error || 'Revoke failed')
      return
    }
    setMsg(`Revoked invite for ${email}`)
    await reload()
  }

  const removeMemberUser = async (username: string) => {
    if (!active?.id) return
    if (!window.confirm(`Remove ${username} from the organisation?`)) return
    const res = await fetch(`/api/orgs/${active.id}/members/remove`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'Remove failed')
      return
    }
    setMsg(`Removed ${username}`)
    await reload()
  }

  const changeRole = async (username: string, role: string) => {
    if (!active?.id) return
    const res = await fetch(`/api/orgs/${active.id}/members/role`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErr(json.error || 'Role update failed')
      return
    }
    setMsg(`Updated role for ${username}`)
    await reload()
  }

  const checkout = async () => {
    if (!active?.id) return
    const seats = Math.floor(Number(seatCount))
    if (!Number.isFinite(seats) || seats < 1) {
      setErr('Enter at least 1 seat')
      return
    }
    if (seats > 500) {
      setErr('Seat count cannot exceed 500 — contact support for larger schools')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/orgs/${active.id}/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seats,
          successUrl: `${window.location.origin}/?billing=success`,
          cancelUrl: `${window.location.origin}/?billing=cancel`,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(
          json.error ||
            'Checkout unavailable — set STRIPE_SECRET_KEY and STRIPE_PRICE_ORG_SEATS, then retry',
        )
        return
      }
      if (json.url) window.location.href = json.url
    } finally {
      setBusy(false)
    }
  }

  const abandonCheckout = async () => {
    if (!active?.id) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/orgs/${active.id}/checkout/abandon`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Could not clear checkout status')
        return
      }
      setMsg('Checkout marked as canceled')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const openBillingPortal = async () => {
    if (!active?.id) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/orgs/${active.id}/billing-portal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: `${window.location.origin}/` }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Could not open billing portal')
        return
      }
      if (json.url) window.location.href = json.url
    } finally {
      setBusy(false)
    }
  }

  const cancelSubscription = async () => {
    if (!active?.id) return
    const ok = window.confirm(
      'Cancel subscription at the end of the current billing period? You keep access until then. You can also manage this in the billing portal.',
    )
    if (!ok) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/orgs/${active.id}/cancel-subscription`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediately: false }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Could not cancel subscription')
        return
      }
      setMsg(
        json.cancelAtPeriodEnd
          ? 'Cancellation scheduled — access continues until the period ends. Confirm in Manage billing if needed.'
          : 'Subscription cancellation requested.',
      )
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const publishDoc = async () => {
    if (!active?.id) return
    const res = await fetch(`/api/orgs/${active.id}/publications`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: pubKind.trim() || 'pattern',
        title: pubTitle.trim() || 'Untitled',
        note: pubNote.trim() || null,
        payload: { patternId: 'stage-2' },
      }),
    })
    if (!res.ok) {
      setErr('Publish failed (trainer/owner role required)')
      return
    }
    setMsg('Published to cohort')
    await reload()
  }

  const saveBranding = async () => {
    if (!active?.id) return
    const branding = {
      productName: brandForm.productName.trim() || active.name,
      primaryColor: brandForm.primaryColor.trim() || '#0f766e',
      logoUrl: brandForm.logoUrl.trim() || '',
      supportEmail: brandForm.supportEmail.trim() || '',
    }
    const res = await fetch(`/api/orgs/${active.id}/branding`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branding }),
    })
    if (!res.ok) {
      setErr('Branding save failed')
      return
    }
    resolveBrand(branding)
    setMsg('Branding saved')
    await reload()
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setMsg('Invite link copied')
    } catch {
      setLastInviteUrl(url)
      setMsg('Copy failed — link shown below')
    }
  }

  return (
    <section
      className={
        layout === 'page'
          ? 'space-y-5'
          : 'mt-8 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
      }
    >
      <div className={layout === 'page' ? 'space-y-2' : undefined}>
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold sm:text-xl">
          {pageTitle}
        </h2>
        {layout === 'page' && roleLabel && active && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-teal-700/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">
              {roleLabel}
            </span>
            <span className="text-[var(--color-ink-soft)]">{active.name}</span>
            {canManage && (
              <span className="text-[var(--color-ink-soft)]">· {active.seats} seats</span>
            )}
          </div>
        )}
        {showOrg && (
          <p className="text-sm text-[var(--color-ink-soft)]">
            {!stripeConfigured && layout !== 'page'
              ? 'Organisations and seat billing are coming soon on this environment. Watchlists below still work on your account.'
              : roleBlurb}
          </p>
        )}
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}
      {msg && <div className="text-sm text-teal-800 dark:text-teal-200">{msg}</div>}
      {lastInviteUrl && canManage && (
        <div className="break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-xs">
          {lastInviteUrl}
        </div>
      )}

      {showOrg && (
        <>
          {stripeConfigured && !active && (
            <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <div className="text-sm font-semibold">Start a school organisation</div>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Owners buy seats and invite students. If you were invited, open your invite link and
                sign in with the same email.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Organisation name"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void createOrg()}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Create org
                </button>
              </div>
            </div>
          )}

          {!stripeConfigured && layout === 'page' && (
            <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-3 text-sm text-[var(--color-ink-soft)]">
              Organisation billing is not configured on this environment yet.
            </p>
          )}

          {stripeConfigured && active && isStudent && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm">
                <div>
                  School: <strong>{active.name}</strong>
                </div>
                <div className={`mt-1 font-medium ${bill.className}`}>
                  Seat: {bill.text === 'Active' ? 'Active school seat' : bill.text}
                </div>
                <p className="mt-2 text-[var(--color-ink-soft)]">
                  Billing and invites are managed by your school owner — you do not need an
                  individual subscription.
                </p>
              </div>
              <DailyScanPanel />
              {pubs.length > 0 ? (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    From your trainer
                  </div>
                  <ul className="mt-2 space-y-2 text-sm">
                    {pubs.map((p) => (
                      <li key={p.id}>
                        <strong>{p.title}</strong>
                        {p.kind ? ` · ${p.kind}` : ''}
                        {p.note ? ` — ${p.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  No class publications yet. Check back after your trainer posts.
                </p>
              )}
            </div>
          )}

          {stripeConfigured && active && isTrainer && (
            <div className="space-y-4 text-sm">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div>
                  Active: <strong>{active.name}</strong> · role trainer
                </div>
                <p className="mt-1 text-[var(--color-ink-soft)]">
                  Seats and billing stay with the organisation owner.
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                  Publish to class
                </div>
                <input
                  value={pubTitle}
                  onChange={(e) => setPubTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                />
                <input
                  value={pubNote}
                  onChange={(e) => setPubNote(e.target.value)}
                  placeholder="Note"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                />
                <input
                  value={pubKind}
                  onChange={(e) => setPubKind(e.target.value)}
                  placeholder="kind (pattern, daily-scan, …)"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void publishDoc()}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                >
                  Publish
                </button>
              </div>

              {pubs.length > 0 && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    Recent publications
                  </div>
                  <ul className="mt-2 space-y-1">
                    {pubs.map((p) => (
                      <li key={p.id}>
                        <strong>{p.title}</strong>
                        {p.kind ? ` · ${p.kind}` : ''}
                        {p.note ? ` — ${p.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {members.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    Class roster (view only)
                  </div>
                  <ul className="space-y-1">
                    {members.map((m) => (
                      <li key={m.username}>
                        {m.username} · {m.role}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {stripeConfigured && active && canManage && (
            <div className="space-y-4 text-sm">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div>
                  Active: <strong>{active.name}</strong> · {active.seats} seats · role{' '}
                  {active.role || '—'}
                </div>
                <div className={`mt-1 font-medium ${bill.className}`}>Billing: {bill.text}</div>
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                  Invite people
                </div>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  Invite as student or trainer. After they join, you can change roles in Members
                  below.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="person@school.edu"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as (typeof ROLE_OPTIONS)[number])
                    }
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void invite()}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                  >
                    Invite + email
                  </button>
                  <label className="cursor-pointer rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
                    CSV upload
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      className="hidden"
                      onChange={(e) => void inviteCsv(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
                {invites.length > 0 && (
                  <ul className="space-y-1 rounded-lg border border-[var(--color-border)] p-3">
                    {invites.slice(0, 40).map((inv) => (
                      <li
                        key={`${inv.email}-${inv.expiresAt}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>
                          {inv.email} · {inv.status} · {inv.role}
                        </span>
                        <span className="flex gap-2">
                          {['pending', 'checkout_started'].includes(inv.status) && (
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-700"
                              onClick={() => void revoke(inv.email)}
                            >
                              Revoke
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                  Members
                </div>
                <p className="text-xs text-[var(--color-ink-soft)]">
                  Role dropdown (including trainer) appears for each person after they accept the
                  invite and join — not while the invite is still pending.
                </p>
                {members.length > 0 ? (
                  <ul className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
                    {members.map((m) => (
                      <li key={m.username} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[10rem] font-medium">{m.username}</span>
                        {m.role === 'owner' ? (
                          <span className="text-xs text-[var(--color-ink-soft)]">owner</span>
                        ) : (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => void changeRole(m.username, e.target.value)}
                              className="rounded border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-2 py-1 text-xs"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                              {!ROLE_OPTIONS.includes(m.role as (typeof ROLE_OPTIONS)[number]) && (
                                <option value={m.role}>{m.role}</option>
                              )}
                            </select>
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-700"
                              onClick={() => void removeMemberUser(m.username)}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    No members yet besides you once invites are accepted.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                {showBuySeats && (
                  <>
                    <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                      Seats
                      <input
                        type="number"
                        min={1}
                        max={500}
                        step={1}
                        value={seatCount}
                        onChange={(e) => setSeatCount(e.target.value)}
                        className="w-24 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm font-semibold text-[var(--color-ink)]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void checkout()}
                      className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                    >
                      Buy seats (Stripe)
                    </button>
                  </>
                )}
                {canManage &&
                  active.billingStatus === 'pending' &&
                  !active.stripeSubscriptionId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void abandonCheckout()}
                      className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60 dark:border-rose-800 dark:text-rose-200"
                    >
                      Mark checkout canceled
                    </button>
                  )}
                {hasSubscription && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void openBillingPortal()}
                      className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                    >
                      Manage billing
                    </button>
                    {active.billingStatus !== 'canceled' && active.stripeSubscriptionId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void cancelSubscription()}
                        className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60 dark:border-rose-800 dark:text-rose-200"
                      >
                        Cancel subscription
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                  Branding
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={brandForm.productName}
                    onChange={(e) => setBrandForm((b) => ({ ...b, productName: e.target.value }))}
                    placeholder="Product name"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={brandForm.primaryColor}
                    onChange={(e) => setBrandForm((b) => ({ ...b, primaryColor: e.target.value }))}
                    placeholder="#0f766e"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={brandForm.logoUrl}
                    onChange={(e) => setBrandForm((b) => ({ ...b, logoUrl: e.target.value }))}
                    placeholder="Logo URL"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm sm:col-span-2"
                  />
                  <input
                    value={brandForm.supportEmail}
                    onChange={(e) => setBrandForm((b) => ({ ...b, supportEmail: e.target.value }))}
                    placeholder="Support email"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm sm:col-span-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void saveBranding()}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                >
                  Save branding
                </button>
              </div>

              {canPublish && (
                <div className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    Publish to class
                  </div>
                  <input
                    value={pubTitle}
                    onChange={(e) => setPubTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={pubNote}
                    onChange={(e) => setPubNote(e.target.value)}
                    placeholder="Note"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <input
                    value={pubKind}
                    onChange={(e) => setPubKind(e.target.value)}
                    placeholder="kind (pattern, daily-scan, …)"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void publishDoc()}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
                  >
                    Publish
                  </button>
                </div>
              )}

              {pubs.length > 0 && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    Publications
                  </div>
                  <ul className="mt-2 space-y-1">
                    {pubs.map((p) => (
                      <li key={p.id}>
                        <strong>{p.title}</strong>
                        {p.kind ? ` · ${p.kind}` : ''}
                        {p.note ? ` — ${p.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {includeWatchlists && (
        <div
          className={
            showOrg
              ? 'border-t border-[var(--color-border)] pt-4'
              : 'space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5'
          }
        >
          <div className="text-sm font-semibold">Watchlists</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={wlName}
              onChange={(e) => setWlName(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createWatchlist()}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
            >
              New list
            </button>
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            {watchlists.map((w) => (
              <li key={w.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {w.name} · {w.tickers?.length ?? 0} tickers
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-teal-800 dark:text-teal-200"
                    onClick={() => {
                      setWlEditId(w.id)
                      setWlTickers((w.tickers || []).join(', '))
                    }}
                  >
                    Edit tickers
                  </button>
                </div>
                {wlEditId === w.id && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={wlTickers}
                      onChange={(e) => setWlTickers(e.target.value)}
                      placeholder="BHP, CBA, WES"
                      className="min-w-[12rem] flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void saveWatchlistTickers(w.id)}
                      className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                )}
              </li>
            ))}
            {!watchlists.length && (
              <li className="text-[var(--color-ink-soft)]">No watchlists yet</li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}
