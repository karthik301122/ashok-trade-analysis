import { useEffect, useState } from 'react'
import { fetchServerPatternHits, type ServerPatternHit } from '../../lib/patternScanApi'
import { formatAud, placePaperOrder } from '../../lib/paperApi'
import { useTradingMode } from '../../lib/tradingMode'

type Props = {
  onPortfolioChange?: () => void
}

type Choice = 'buy' | 'skip' | 'sell'

function pickHit(hits: ServerPatternHit[]): ServerPatternHit | null {
  if (!hits.length) return null
  return hits[Math.floor(Math.random() * Math.min(hits.length, 40))] || null
}

function normalizeBias(raw: string | undefined): 'bullish' | 'bearish' | 'neutral' {
  const b = (raw || '').toLowerCase()
  if (b === 'bullish' || b === 'bearish' || b === 'neutral') return b
  return 'neutral'
}

function expectedChoice(bias: 'bullish' | 'bearish' | 'neutral'): Choice {
  if (bias === 'bullish') return 'buy'
  if (bias === 'bearish') return 'sell'
  return 'skip'
}

function biasExplanation(bias: 'bullish' | 'bearish' | 'neutral'): string {
  if (bias === 'bullish') {
    return 'This pattern is tagged bullish — the drill expects Buy as the matching practice choice.'
  }
  if (bias === 'bearish') {
    return 'This pattern is tagged bearish — the drill expects Sell / avoid as the matching practice choice.'
  }
  return 'This pattern is tagged neutral — the drill expects Skip (no directional edge assumed).'
}

export function PaperPatternDrill({ onPortfolioChange }: Props) {
  const { setMode, setPaperToast, refreshPaperSummary } = useTradingMode()
  const [hit, setHit] = useState<ServerPatternHit | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [matched, setMatched] = useState<boolean | null>(null)
  const [score, setScore] = useState({ right: 0, total: 0 })
  const [qty, setQty] = useState('10')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadNext = async () => {
    setLoading(true)
    setError(null)
    setRevealed(false)
    setChoice(null)
    setMatched(null)
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

  const decide = (c: Choice) => {
    if (!hit || revealed) return
    const bias = normalizeBias(hit.bias)
    const expected = expectedChoice(bias)
    const good = c === expected
    setChoice(c)
    setMatched(good)
    setRevealed(true)
    setScore((s) => ({ right: s.right + (good ? 1 : 0), total: s.total + 1 }))
  }

  const paperBuy = async () => {
    if (!hit?.ticker) return
    const n = Number(qty)
    if (!Number.isFinite(n) || n <= 0) {
      setError('Enter a positive share quantity')
      return
    }
    setMode('paper')
    const result = await placePaperOrder({
      ticker: hit.ticker,
      side: 'buy',
      qty: n,
      source: 'pattern_drill',
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPaperToast(`Drill BUY ${result.fill.qty} ${result.fill.ticker} @ ${formatAud(result.fill.price)}`)
    await refreshPaperSummary()
    onPortfolioChange?.()
  }

  const bias = hit ? normalizeBias(hit.bias) : null

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
            Pattern drill
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            See a desk name with context only — choose buy / skip / sell, then reveal the pattern
            bias. Optional paper fill.
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
            {[hit.name, hit.sector, hit.industry].filter(Boolean).join(' · ') || 'ASX name'}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums">
            {Number.isFinite(hit.rs) && <span>RS {Number(hit.rs).toFixed(0)}</span>}
            {Number.isFinite(hit.relativeVolume) && (
              <span>RVOL {Number(hit.relativeVolume).toFixed(2)}</span>
            )}
            {Number.isFinite(hit.rsi) && <span>RSI {Number(hit.rsi).toFixed(0)}</span>}
            {Number.isFinite(hit.lastPrice) && (
              <span>Last {Number(hit.lastPrice).toFixed(2)}</span>
            )}
          </div>

          {!revealed ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-[var(--color-ink-soft)]">
                Pattern name and bias are hidden until you choose.
              </p>
              <div className="flex flex-wrap gap-2">
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
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                You chose <strong>{choice}</strong>
                {matched != null && (
                  <>
                    {' '}
                    —{' '}
                    <span className={matched ? 'text-emerald-700' : 'text-rose-700'}>
                      {matched ? 'matched' : 'missed'}
                    </span>{' '}
                    expected <strong>{bias ? expectedChoice(bias) : '—'}</strong>.
                  </>
                )}
              </p>
              <p>
                Pattern: <strong>{hit.patternName || hit.patternId || 'special'}</strong>
                {bias ? ` · bias ${bias}` : ''}
                {hit.score != null ? ` · score ${Number(hit.score).toFixed(0)}` : ''}
                {hit.confirmed ? ' · confirmed' : ''}
              </p>
              {bias && <p className="text-[var(--color-ink-soft)]">{biasExplanation(bias)}</p>}
              <p className="text-xs text-[var(--color-ink-soft)]">
                Educational only — always check the chart and your plan before a real decision.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">
                    Qty
                  </span>
                  <input
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-20 rounded-lg border border-[var(--color-border)] px-2 py-1.5"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void paperBuy()}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Paper buy
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
