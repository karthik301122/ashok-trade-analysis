import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchDeskOhlc } from '../../lib/deskSeries'
import type { OhlcBar } from '../../lib/patterns'
import { formatAud, placePaperOrder } from '../../lib/paperApi'
import { useTradingMode } from '../../lib/tradingMode'

type Props = {
  onPortfolioChange?: () => void
}

export function PaperDayReplay({ onPortfolioChange }: Props) {
  const { setPaperToast, refreshPaperSummary, setMode } = useTradingMode()
  const [ticker, setTicker] = useState('BHP')
  const [bars, setBars] = useState<OhlcBar[]>([])
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(400)
  const [qty, setQty] = useState('10')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const timer = useRef<number | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    setPlaying(false)
    const data = await fetchDeskOhlc(ticker.trim().toUpperCase(), '2024-01-01', { staleOk: true })
    setLoading(false)
    if (!data?.length) {
      setError('Could not load bars for this ticker')
      setBars([])
      return
    }
    // Start ~60 bars from the end so the replay is a recent stretch.
    const start = Math.max(0, data.length - 60)
    setBars(data.slice(start))
    setCursor(0)
  }

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearInterval(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!playing) {
      if (timer.current != null) window.clearInterval(timer.current)
      timer.current = null
      return
    }
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        if (c >= bars.length - 1) {
          setPlaying(false)
          return c
        }
        return c + 1
      })
    }, speedMs)
    return () => {
      if (timer.current != null) window.clearInterval(timer.current)
    }
  }, [playing, bars.length, speedMs])

  const bar = bars[cursor] || null
  const visible = useMemo(() => bars.slice(0, cursor + 1), [bars, cursor])
  const lastClose = bar ? Number(bar.c) : null

  const trade = async (side: 'buy' | 'sell') => {
    if (!ack) {
      setError('Confirm that replay fills hit your shared paper portfolio first.')
      return
    }
    if (!lastClose || lastClose <= 0) return
    setMode('paper')
    const result = await placePaperOrder({
      ticker: ticker.trim().toUpperCase(),
      side,
      qty: Number(qty),
      fillPrice: lastClose,
      source: 'replay',
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPaperToast(
      `Replay ${result.fill.side.toUpperCase()} ${result.fill.qty} ${result.fill.ticker} @ ${formatAud(result.fill.price)}`,
    )
    await refreshPaperSummary()
    onPortfolioChange?.()
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">
          Day replay
        </h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Play recent daily bars and paper-trade at each bar&apos;s close. Same paper cash as Live Paper
          mode.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
        <span>
          I understand replay fills update my shared paper portfolio (A$100k practice account).
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          className="w-28 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          placeholder="Ticker"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load bars'}
        </button>
        <select
          value={speedMs}
          onChange={(e) => setSpeedMs(Number(e.target.value))}
          className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
        >
          <option value={800}>Slow</option>
          <option value={400}>Normal</option>
          <option value={150}>Fast</option>
        </select>
        <button
          type="button"
          disabled={!bars.length || cursor >= bars.length - 1}
          onClick={() => setPlaying((p) => !p)}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          disabled={!bars.length || cursor >= bars.length - 1}
          onClick={() => setCursor((c) => Math.min(bars.length - 1, c + 1))}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
        >
          Step
        </button>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {bar && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm">
            <div className="text-xs font-semibold uppercase text-[var(--color-ink-soft)]">Sim clock</div>
            <div className="mt-1 font-semibold">
              {new Date(bar.t * 1000).toLocaleDateString()} · bar {cursor + 1}/{bars.length}
            </div>
            <div className="mt-2 tabular-nums">
              O {bar.o?.toFixed(2)} · H {bar.h?.toFixed(2)} · L {bar.l?.toFixed(2)} ·{' '}
              <span className="font-semibold">C {Number(bar.c).toFixed(2)}</span>
            </div>
            <div className="mt-3 h-16 flex items-end gap-px">
              {visible.slice(-40).map((b, i) => {
                const h = Math.max(4, ((Number(b.c) - Number(visible[0]?.c || b.c)) / (Number(b.c) || 1) + 1) * 24)
                return (
                  <div
                    key={`${b.t}-${i}`}
                    className="flex-1 rounded-t bg-teal-600/80"
                    style={{ height: `${Math.min(64, Math.abs(h) + 8)}px` }}
                  />
                )
              })}
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-amber-300/80 bg-amber-50/80 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="text-xs font-semibold uppercase text-amber-900 dark:text-amber-100">
              Paper fill at close
            </div>
            <input
              type="number"
              min={0.0001}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg border border-amber-300 px-2 py-1.5 text-sm dark:border-amber-700 dark:bg-amber-950/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void trade('buy')}
                className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white"
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => void trade('sell')}
                className="flex-1 rounded-lg bg-rose-700 py-2 text-sm font-semibold text-white"
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
