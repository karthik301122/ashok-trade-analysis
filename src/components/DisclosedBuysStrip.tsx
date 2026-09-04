import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import type { AsxFiling } from './DirectorFilingsPanel'

function formatShares(n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return n.toLocaleString('en-AU')
}

type Props = {
  onOpenTicker?: (ticker: string) => void
}

export function DisclosedBuysStrip({ onOpenTicker }: Props) {
  const [window, setWindow] = useState<'today' | 'week'>('week')
  const [buys, setBuys] = useState<AsxFiling[]>([])
  const [loading, setLoading] = useState(true)
  const [disclaimer, setDisclaimer] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/filings/buys?window=${window}`, { credentials: 'include' })
        if (!res.ok) throw new Error('failed')
        const json = await res.json()
        if (cancelled) return
        setBuys(Array.isArray(json.buys) ? json.buys : [])
        setDisclaimer(json.disclaimer || null)
      } catch {
        if (!cancelled) {
          setBuys([])
          setDisclaimer(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [window])

  return (
    <section className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Largest disclosed buys</h3>
          <p className="text-[10px] text-[var(--color-ink-soft)]">
            {disclaimer || 'Director Appendix 3Y buys — not broker tape.'}
          </p>
        </div>
        <div className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setWindow('today')}
            className={`rounded-md px-2.5 py-1 ${
              window === 'today' ? 'bg-teal-600 text-white' : 'text-[var(--color-ink-soft)]'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setWindow('week')}
            className={`rounded-md px-2.5 py-1 ${
              window === 'week' ? 'bg-teal-600 text-white' : 'text-[var(--color-ink-soft)]'
            }`}
          >
            This week
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Loading ASX filings…</p>
      ) : buys.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          No parsed director buys in this window yet (poll builds history over time).
        </p>
      ) : (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {buys.slice(0, 12).map((b) => (
            <button
              key={b.documentKey}
              type="button"
              onClick={() => onOpenTicker?.(b.ticker)}
              className="min-w-[148px] shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 px-2.5 py-2 text-left hover:border-teal-500"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-bold text-teal-800 dark:text-teal-300">
                  {b.ticker}
                </span>
                {b.pdfUrl && (
                  <a
                    href={b.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[var(--color-ink-soft)] hover:text-teal-600"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--color-ink)]">
                {b.director || 'Director'}
              </div>
              <div className="text-[11px] tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatShares(b.shares)} sh
                {b.considerationAud != null
                  ? ` · $${Math.round(b.considerationAud).toLocaleString('en-AU')}`
                  : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
