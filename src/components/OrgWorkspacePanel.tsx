import { useEffect, useState } from 'react'
import { resolveBrand } from '../lib/brand'

type Org = {
  id: string
  name: string
  seats: number
  role?: string
  branding?: { productName?: string; primaryColor?: string; logoUrl?: string; supportEmail?: string }
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

/** Org seats, branding, watchlists, trainer publishes — Profile extras. */
export function OrgWorkspacePanel() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [pubs, setPubs] = useState<Publication[]>([])
  const [orgName, setOrgName] = useState('')
  const [wlName, setWlName] = useState('My watchlist')
  const [inviteEmail, setInviteEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [stripeConfigured, setStripeConfigured] = useState(false)
  const active = orgs[0]

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
        const p = await fetch(`/api/orgs/${first.id}/publications`, { credentials: 'include' }).then(
          (r) => r.json(),
        )
        setPubs(Array.isArray(p?.publications) ? p.publications : [])
        if (first.branding) resolveBrand(first.branding)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load org tools')
    }
  }

  useEffect(() => {
    void reload()
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
    setMsg(
      json.token
        ? `Invite created. Share token with student (dev): ${json.token}`
        : 'Invite created',
    )
    setInviteEmail('')
  }

  const checkout = async () => {
    if (!active?.id) return
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
  }

  const publishDemo = async () => {
    if (!active?.id) return
    const res = await fetch(`/api/orgs/${active.id}/publications`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'pattern',
        title: 'Today’s Stage 2 focus',
        note: 'Review these names before the open.',
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
    const res = await fetch(`/api/orgs/${active.id}/branding`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branding: {
          productName: active.name,
          primaryColor: '#0f766e',
          supportEmail: '',
        },
      }),
    })
    if (!res.ok) {
      setErr('Branding save failed')
      return
    }
    setMsg('Branding saved')
    await reload()
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
          Seat packs use Stripe. Individuals stay on a normal account until invited.
        </p>
      )}
      {err && <div className="text-sm text-rose-600">{err}</div>}
      {msg && <div className="text-sm text-teal-800 dark:text-teal-200">{msg}</div>}

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
        <div className="space-y-2 text-sm">
          <div>
            Active: <strong>{active.name}</strong> · {active.seats} seats · role {active.role || '—'}
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
              Invite student
            </button>
            <button
              type="button"
              onClick={() => void checkout()}
              className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-800"
            >
              Buy seats (Stripe)
            </button>
            <button
              type="button"
              onClick={() => void saveBranding()}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
            >
              Save branding MVP
            </button>
            <button
              type="button"
              onClick={() => void publishDemo()}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
            >
              Publish setup to class
            </button>
          </div>
          {pubs.length > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                From your trainer
              </div>
              <ul className="mt-2 space-y-1">
                {pubs.map((p) => (
                  <li key={p.id}>
                    <strong>{p.title}</strong>
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
        <ul className="mt-2 space-y-1 text-sm">
          {watchlists.map((w) => (
            <li key={w.id}>
              {w.name} · {w.tickers?.length ?? 0} tickers
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
