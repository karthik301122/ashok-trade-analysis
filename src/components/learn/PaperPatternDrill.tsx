import { useEffect, useState } from 'react'
import { fetchServerPatternHits, type ServerPatternHit } from '../../lib/patternScanApi'
import { formatAud, placePaperOrder } from '../../lib/paperApi'
import { useTradingMode } from '../../lib/tradingMode'

type Props = {
  onPortfolioChange?: () => void
}

function pickHit(hits: ServerPatternHit[]): ServerPatternHit | null {
  if (!hits.length) return null
  return hits[Math.floor(Math.random() * Math.min(hits.length, 40))] || null
}

export function PaperPatternDrill({ onPortfolioChange }: Props) {
  const { setMode, setPaperToast, refreshPaperSummary } = useTradingMode()
  const [hit, setHit] = useState<ServerPatternHit | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [choice, setChoice] = useState<'buy' | 'skip' | 'sell' | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadNext = async () => {
    setLoading(true)
    setError(null)
    setRevealed(false)
    setChoice(null)
    const payload = await fetchServerPatternHits('latest')
    setLoading(false)
    if (!payload?.hits?.length || payload.pending) {
      setError('No server pattern hits yet — try again after the daily pattern job.')
      setHit(null)
      return
    }
    setHit(pickHit(payload.hits))
  }

  useEffect(() => {
    void loadNext()
  }, [])

  const decide = (c: 'buy' | 'skip' | 'sell') => {
    if (!hit || revealed) return
    setChoice(c)
    setRevealed(true)
    // Heuristic: bullish-ish names → buy is "better"; otherwise skip is fine. Educational only.
    const name = `${hit.patternName || hit.patternId || ''} ${hit.kind || ''}`.toLowerCase()
    const bullish = /surge|breakout|up|bull|long|accumulation|stage\s*2/.test(name)
    const good = c === 'skip' || (bullish ? c === 'buy' : c === 'sell')
    setScore((s) => ({ right: s.right + (good ? 1 : 0), total: s.total + 1 }))
  }

  const paperBuy = async () => {
    if (!hit?.ticker) return
    setMode('paper')
    const result = await placePaperOrder({
      ticker: hit.ticker,
      side: 'buy',
      qty: 10,
      source: 'pattern_drill',
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPaperToast(`Drill BUY 10 ${result.fill.ticker} @ ${formatAud(result.fill.price)}`)
    await refreshPaperSummary()
    onPortfolioChange?.()
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
            Pattern drill
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            See a live desk pattern hit, choose buy / skip / sell, then reveal. Optional paper fill.
          </p>
        </div>
        <div className="text-sm font-semibold tabular-nums text-[var(--color-ink-soft)]">
          Score {score.right}/{score.total}
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--color-ink-soft)]">Loading hits…</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {hit && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
          <div className="text-lg font-semibold">{hit.ticker}</div>
          <div className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Pattern: {hit.patternName || hit.patternId || hit.kind || 'special'}
            {hit.score != null ? ` · score ${Number(hit.score).toFixed(0)}` : ''}
            {hit.lastPrice != null ? ` · last ${Number(hit.lastPrice).toFixed(2)}` : ''}
          </div>
          {!revealed ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => decide('buy')}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => decide('skip')}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => decide('sell')}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Sell / avoid
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                You chose <strong>{choice}</strong>. This is a learning prompt — always check the
                chart and your plan before a real decision.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void paperBuy()}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Paper buy 10 shares
                </button>
                <button
                  type="button"
                  onClick={() => void loadNext()}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold"
                >
                  Next hit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
