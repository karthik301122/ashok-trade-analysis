import { useEffect, useState } from 'react'

type DailyScanDoc = {
  id: string
  title: string
  note?: string | null
  kind: string
  payload?: {
    asOf?: string
    summary?: string
    topPatterns?: { patternId: string; count: number }[]
    breadth?: { loaded?: number | null; failed?: number | null }
  }
  createdAt?: number
  updatedAt?: number
}

/** Student-facing branded daily scan on Patterns. */
export function DailyScanPanel() {
  const [docs, setDocs] = useState<DailyScanDoc[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const orgsRes = await fetch('/api/orgs', { credentials: 'include' })
        const orgsJson = await orgsRes.json().catch(() => ({}))
        const orgs = Array.isArray(orgsJson?.orgs) ? orgsJson.orgs : []
        const first = orgs[0]
        if (!first?.id) {
          if (!cancelled) setDocs([])
          return
        }
        const pubRes = await fetch(`/api/orgs/${first.id}/publications`, { credentials: 'include' })
        const pubJson = await pubRes.json().catch(() => ({}))
        if (cancelled) return
        const all = Array.isArray(pubJson?.publications) ? pubJson.publications : []
        setDocs(all.filter((p: DailyScanDoc) => p.kind === 'daily-scan').slice(0, 3))
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Could not load daily scan')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (err) {
    return (
      <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        {err}
      </div>
    )
  }
  if (!docs.length) return null

  const latest = docs[0]
  const payload = latest.payload || {}

  return (
    <section className="mb-4 rounded-xl border border-teal-200/80 bg-teal-50/60 p-4 dark:border-teal-900 dark:bg-teal-950/30">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-200">
        From your trainer · daily scan
      </div>
      <h3 className="mt-1 font-[family-name:var(--font-display)] text-base font-semibold">
        {latest.title}
      </h3>
      {(payload.summary || latest.note) && (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{payload.summary || latest.note}</p>
      )}
      {Array.isArray(payload.topPatterns) && payload.topPatterns.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {payload.topPatterns.slice(0, 8).map((p) => (
            <li
              key={p.patternId}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs font-medium"
            >
              {p.patternId} · {p.count}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
