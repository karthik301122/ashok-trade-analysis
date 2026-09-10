import { useEffect, useState } from 'react'
import { resolveBrand } from '../lib/brand'

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

/** Org seats, branding, watchlists, trainer publishes — Profile extras. */
export function OrgWorkspacePanel() {
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
  const active = orgs[0]
  const bill = billingLabel(active?.billingStatus)
  const canManage = Boolean(active && ['owner', 'admin'].includes(String(active.role || '')))
  const canPublish = Boolean(
    active && ['owner', 'admin', 'trainer'].includes(String(active.role || '')),
  )
  const hasSubscription = Boolean(active?.stripeSubscriptionId || active?.stripeCustomerId)
  const showBuySeats =
    canManage &&
    (!active?.billingStatus ||
      active.billingStatus === 'none' ||
      active.billingStatus === 'canceled')

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
      body: JSON.stringify({ email: inviteEmail.trim(), role: 'student' }),
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
      body: JSON.stringify({ csv: text, role: 'student' }),
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
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/orgs/${active.id}/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seats: 50,
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
    <section className="mt-8 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
        Organisations & watchlists
      </h2>
      {!stripeConfigured ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          Organisations and seat billing are coming soon on this environment. Watchlists below still
          work on your account.
        </p>
      ) : (
        <p className="text-sm text-[var(--color-ink-soft)]">
          Buy seats for your school, then invite students — they join under an org seat (no
          individual plan). Solo traders use Upgrade for an individual subscription. Manage billing
          anytime via Stripe.
        </p>
      )}
      {err && <div className="text-sm text-rose-600">{err}</div>}
      {msg && <div className="text-sm text-teal-800 dark:text-teal-200">{msg}</div>}
      {lastInviteUrl && (
        <div className="break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-xs">
          {lastInviteUrl}
        </div>
      )}

      {stripeConfigured && (
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
      )}

      {stripeConfigured && active && (
        <div className="space-y-4 text-sm">
          <div>
            Active: <strong>{active.name}</strong> · {active.seats} seats · role {active.role || '—'}
          </div>
          <div className={`text-sm font-medium ${bill.className}`}>Billing: {bill.text}</div>

          {canManage && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                Invite students
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="student@school.edu"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
                />
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
          )}

          {canManage && members.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                Members
              </div>
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
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {showBuySeats && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkout()}
                className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
              >
                Buy seats (Stripe)
              </button>
            )}
            {canManage && hasSubscription && (
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

          {canManage && (
            <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
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
          )}

          {canPublish && (
            <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
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
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                From your trainer
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

      <div className="border-t border-[var(--color-border)] pt-4">
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
    </section>
  )
}
