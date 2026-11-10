import { useEffect, useRef, useState } from 'react'
import { fetchDeskIntraday, fetchDeskOhlc, type OhlcBar } from '../../lib/deskSeries'
import { formatAud, placePaperOrder } from '../../lib/paperApi'
import { useTradingMode } from '../../lib/tradingMode'

type Props = {
  onPortfolioChange?: () => void
}

type ReplayInterval = '5m' | '15m' | '1h'
type ReplayMode = 'intraday' | 'daily'

function lastWeekdayIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1)
  }
  // If "today" UTC is still weekend-adjusted; prefer previous weekday when early
  if (d.getTime() > Date.now()) {
    d.setUTCDate(d.getUTCDate() - 1)
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() - 1)
    }
  }
  return d.toISOString().slice(0, 10)
}

/** Wide UTC window covering an ASX calendar session (AEST/AEDT). */
function sessionFetchRange(dateIso: string): { fromTs: number; toTs: number } {
  const dayStartUtc = Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 1000)
  return {
    fromTs: dayStartUtc - 14 * 3600,
    toTs: dayStartUtc + 14 * 3600,
  }
}

function sydneyDateIso(tsSec: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(tsSec * 1000))
}

function formatSessionClock(tsSec: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(tsSec * 1000))
}

function CandleStrip({ bars, cursor }: { bars: OhlcBar[]; cursor: number }) {
  const visible = bars.slice(0, cursor + 1)
  const windowBars = visible.slice(-48)
  if (!windowBars.length) return null
  let min = Infinity
  let max = -Infinity
  for (const b of windowBars) {
    min = Math.min(min, Number(b.l), Number(b.c), Number(b.o))
    max = Math.max(max, Number(b.h), Number(b.c), Number(b.o))
  }
  const span = Math.max(max - min, 1e-6)
  const h = 72

  return (
    <div className="mt-3 flex h-[72px] items-end gap-px">
      {windowBars.map((b, i) => {
        const o = Number(b.o)
        const c = Number(b.c)
        const hi = Number(b.h)
        const lo = Number(b.l)
        const up = c >= o
        const bodyTop = ((Math.max(o, c) - min) / span) * h
        const bodyBot = ((Math.min(o, c) - min) / span) * h
        const wickTop = ((hi - min) / span) * h
        const wickBot = ((lo - min) / span) * h
        const isLast = i === windowBars.length - 1
        return (
          <div key={`${b.t}-${i}`} className="relative flex-1" style={{ height: h }}>
            <div
              className={`absolute left-1/2 w-px -translate-x-1/2 ${
                up ? 'bg-emerald-600/70' : 'bg-rose-600/70'
              } ${isLast ? 'opacity-100' : 'opacity-80'}`}
              style={{ bottom: wickBot, height: Math.max(2, wickTop - wickBot) }}
            />
            <div
              className={`absolute left-0 right-0 rounded-[1px] ${
                up ? 'bg-emerald-600' : 'bg-rose-600'
              } ${isLast ? 'ring-1 ring-amber-400' : ''}`}
              style={{
                bottom: bodyBot,
                height: Math.max(2, bodyTop - bodyBot),
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

export function PaperDayReplay({ onPortfolioChange }: Props) {
  const { setPaperToast, refreshPaperSummary, setMode } = useTradingMode()
  const [ticker, setTicker] = useState('BHP')
  const [sessionDate, setSessionDate] = useState(() => lastWeekdayIso())
  const [interval, setIntervalPref] = useState<ReplayInterval>('5m')
  const [mode, setReplayMode] = useState<ReplayMode>('intraday')
  const [bars, setBars] = useState<OhlcBar[]>([])
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(400)
  const [qty, setQty] = useState('10')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const timer = useRef<number | null>(null)

  const loadIntraday = async () => {
    setLoading(true)
    setError(null)
    setPlaying(false)
    const { fromTs, toTs } = sessionFetchRange(sessionDate)
    const data = await fetchDeskIntraday(ticker.trim().toUpperCase(), interval, fromTs, toTs)
    setLoading(false)
    if (!data?.bars?.length) {
      setError(
        `No ${interval} bars for ${ticker.toUpperCase()} on ${sessionDate}. Try another date/interval, or load daily bars.`,
      )
      setBars([])
      setReplayMode('intraday')
      return
    }
    const sessionBars = data.bars.filter((b) => sydneyDateIso(b.t) === sessionDate)
    const useBars = sessionBars.length >= 5 ? sessionBars : data.bars
    setBars(useBars)
    setCursor(0)
    setReplayMode('intraday')
  }

  const loadDailyFallback = async () => {
    setLoading(true)
    setError(null)
    setPlaying(false)
    const data = await fetchDeskOhlc(ticker.trim().toUpperCase(), '2024-01-01', { staleOk: true })
    setLoading(false)
    if (!data?.length) {
      setError('Could not load daily bars for this ticker')
      setBars([])
      return
    }
    const start = Math.max(0, data.length - 60)
    setBars(data.slice(start))
    setCursor(0)
    setReplayMode('daily')
    setError(null)
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

  const title = mode === 'daily' ? 'Session replay (daily fallback)' : 'Session replay'

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Play an ASX session (intraday bars) and paper-trade at each bar&apos;s close. Fills hit the
          same shared paper cash as Live Paper mode.
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
        <input
          type="date"
          value={sessionDate}
          onChange={(e) => setSessionDate(e.target.value)}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
        />
        <select
          value={interval}
          onChange={(e) => setIntervalPref(e.target.value as ReplayInterval)}
          className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-sm"
        >
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
        </select>
        <button
          type="button"
          onClick={() => void loadIntraday()}
          disabled={loading}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load session'}
        </button>
        <button
          type="button"
          onClick={() => void loadDailyFallback()}
          disabled={loading}
          className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
        >
          Daily fallback
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
              {mode === 'intraday'
                ? formatSessionClock(bar.t)
                : new Date(bar.t * 1000).toLocaleDateString()}{' '}
              · bar {cursor + 1}/{bars.length}
              {mode === 'intraday' ? ` · ${interval}` : ' · daily'}
            </div>
            <div className="mt-2 tabular-nums">
              O {Number(bar.o).toFixed(2)} · H {Number(bar.h).toFixed(2)} · L{' '}
              {Number(bar.l).toFixed(2)} · <span className="font-semibold">C {Number(bar.c).toFixed(2)}</span>
            </div>
            <CandleStrip bars={bars} cursor={cursor} />
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
