import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

export type AsxFiling = {
  documentKey: string
  ticker: string
  headline: string | null
  kind: string | null
  director: string | null
  side: string
  shares: number | null
  considerationAud: number | null
  announcedAt: number
  dateOfChange: string | null
  pdfUrl: string | null
}

function formatShares(n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString('en-AU')
}

function formatWhen(ts: number) {
  return new Date(ts).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sideLabel(side: string) {
  if (side === 'buy') return 'Buy'
  if (side === 'sell') return 'Sell'
  return 'Change'
}

type Props = {
  ticker: string
}

export function DirectorFilingsPanel({ ticker }: Props) {
  const [filings, setFilings] = useState<AsxFiling[]>([])
  const [loading, setLoading] = useState(true)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/filings/${encodeURIComponent(ticker)}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('failed')
        const json = await res.json()
        if (cancelled) return
        setFilings(Array.isArray(json.filings) ? json.filings : [])
        setDisclaimer(json.disclaimer || null)
      } catch {
        if (!cancelled) {
          setFilings([])
          setDisclaimer(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ticker])

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Director filings (3Y)
        </h4>
        {loading && <span className="text-[10px] text-[var(--color-ink-soft)]">Loading…</span>}
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
        {disclaimer || 'ASX disclosed filings — not live market buyers.'}
      </p>
      {!loading && filings.length === 0 ? (
        <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">No recent Appendix 3X/3Y/3Z found.</p>
      ) : (
        <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
          {filings.slice(0, 8).map((f) => (
            <li
              key={f.documentKey}
              className="flex items-start justify-between gap-2 text-[11px] leading-snug"
            >
              <div className="min-w-0">
                <span
                  className={`mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                    f.side === 'buy'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : f.side === 'sell'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {sideLabel(f.side)}
                </span>
                <span className="font-semibold text-[var(--color-ink)]">
                  {f.director || 'Director'}
                </span>
                <span className="text-[var(--color-ink-soft)]">
                  {' '}
                  · {formatShares(f.shares)} sh
                  {f.considerationAud != null
                    ? ` · $${f.considerationAud.toLocaleString('en-AU')}`
                    : ''}
                </span>
                <div className="text-[10px] text-[var(--color-ink-soft)]">
                  {formatWhen(f.announcedAt)}
                  {f.kind ? ` · ${f.kind}` : ''}
                </div>
              </div>
              {f.pdfUrl && (
                <a
                  href={f.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-teal-700 hover:underline dark:text-teal-300"
                  title="Open ASX PDF"
                >
                  <ExternalLink size={12} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
