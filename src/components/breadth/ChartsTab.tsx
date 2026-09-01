import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import type { MouseHandlerDataParam } from 'recharts'
import type { BreadthBundle } from './breadthMath'

type HoverTip = {
  label?: string | number
  payload?: Array<{ name?: string; value?: number; color?: string }>
}

type ChartSeriesSpec<T extends Record<string, unknown>> = {
  key: keyof T & string
  name: string
  color: string
}

type ChartMouseState = MouseHandlerDataParam

function chartIndexFromState(state: ChartMouseState, data: ReadonlyArray<Record<string, unknown>>): number | undefined {
  const raw = state.activeTooltipIndex ?? state.activeIndex
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const idx = data.findIndex((row) => row.d === raw)
    return idx >= 0 ? idx : undefined
  }
  return undefined
}

const CHART_MARGIN = { top: 8, right: 12, left: 4, bottom: 4 }
const CHART_MARGIN_WITH_LEGEND = { top: 8, right: 12, left: 4, bottom: 28 }

const chartTooltipCursor = { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }

function tipsEqual(a: HoverTip | null, b: HoverTip | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.label !== b.label) return false
  const ap = a.payload ?? []
  const bp = b.payload ?? []
  if (ap.length !== bp.length) return false
  return ap.every((entry, i) => entry.name === bp[i].name && entry.value === bp[i].value)
}

function buildHoverTip<T extends Record<string, unknown>>(
  data: T[],
  labelKey: keyof T & string,
  series: ReadonlyArray<ChartSeriesSpec<T>>,
  index: number | undefined,
  fallbackLabel?: string | number,
): HoverTip | null {
  if (index == null || index < 0 || index >= data.length) return null
  const row = data[index]
  return {
    label: (row[labelKey] as string | number | undefined) ?? fallbackLabel,
    payload: series.map((s) => ({
      name: s.name,
      value: Number(row[s.key]),
      color: s.color,
    })),
  }
}

function useChartHover<T extends Record<string, unknown>>(
  data: T[],
  labelKey: keyof T & string,
  series: ReadonlyArray<ChartSeriesSpec<T>>,
) {
  const [tip, setTip] = useState<HoverTip | null>(null)

  const onMouseMove = useCallback(
    (state: ChartMouseState) => {
      if (!state.isTooltipActive) {
        setTip((prev) => (prev === null ? prev : null))
        return
      }
      const next = buildHoverTip(
        data,
        labelKey,
        series,
        chartIndexFromState(state, data),
        state.activeLabel,
      )
      setTip((prev) => (tipsEqual(prev, next) ? prev : next))
    },
    [data, labelKey, series],
  )

  const onMouseLeave = useCallback(() => setTip((prev) => (prev === null ? prev : null)), [])

  return { tip, onMouseMove, onMouseLeave }
}

function ChartHoverReadout({ tip }: { tip: HoverTip | null }) {
  if (!tip?.payload?.length) {
    return <span className="text-[var(--color-ink-soft)]">Hover chart for values</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      {tip.label != null && tip.label !== '' && (
        <span className="font-semibold text-[var(--color-ink)]">{tip.label}</span>
      )}
      {tip.payload.map((entry) => (
        <span
          key={String(entry.name)}
          className="tabular-nums font-medium"
          style={{ color: entry.color ?? 'var(--color-ink-soft)' }}
        >
          {entry.name}: {entry.value}
        </span>
      ))}
    </div>
  )
}

function ChartPlot({ tip, children }: { tip: HoverTip | null; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-muted)]/40 px-2 text-xs"
        aria-live="polite"
      >
        <ChartHoverReadout tip={tip} />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}

/** Vertical crosshair only — values render in the header strip above the chart. */
function ChartCrosshair() {
  return (
    <Tooltip
      content={() => null}
      cursor={chartTooltipCursor}
      isAnimationActive={false}
      wrapperStyle={{ pointerEvents: 'none', visibility: 'hidden', outline: 'none' }}
    />
  )
}

function ChartCard({
  title,
  subtitle,
  means,
  reading,
  action,
  children,
}: {
  title: string
  subtitle: string
  means: string
  reading: string
  action: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mb-3 text-xs text-[var(--color-ink-soft)]">{subtitle}</p>
      <div className="h-56 w-full overflow-visible">{children}</div>
      <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3 text-sm">
        <p>
          <span className="font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            What this chart means
          </span>{' '}
          — {means}
        </p>
        <p>
          <span className="font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Current reading
          </span>{' '}
          — {reading}
        </p>
        <p>
          <span className="font-bold uppercase tracking-wide text-orange-700 dark:text-orange-400">
            What you should do
          </span>{' '}
          — {action}
        </p>
      </div>
    </div>
  )
}

export function ChartsTab({ bundle }: { bundle: BreadthBundle }) {
  const h = bundle.history
  const advDec = h.dates.map((d, i) => ({
    d,
    Advances: h.advances[i],
    Declines: h.declines[i],
  }))
  const sma20 = h.dates.map((d, i) => ({ d, v: h.above20[i] }))
  const sma50 = h.dates.map((d, i) => ({ d, v: h.above50[i] }))
  const sma200 = h.dates.map((d, i) => ({ d, v: h.above200[i] }))
  const thrust = h.dates.map((d, i) => ({ d, Thrust: h.thrust[i], Ma: h.thrustMa[i] }))
  const near = h.dates.map((d, i) => ({ d, v: h.near52w[i] }))
  const rsi = h.dates.map((d, i) => ({
    d,
    Overbought: h.rsiOb[i],
    Oversold: h.rsiOs[i],
    Neutral: h.rsiNeutral[i],
  }))
  const rsSeries = h.dates.map((d, i) => ({ d, v: h.rs50[i] }))
  const rvolSeries = h.dates.map((d, i) => ({ d, v: h.rvol15[i] }))

  const thrustNow = h.thrust.at(-1) ?? 0.5
  const advNow = bundle.advancing
  const decNow = bundle.declining

  const advHover = useChartHover(advDec, 'd', [
    { key: 'Advances', name: 'Advances', color: '#16a34a' },
    { key: 'Declines', name: 'Declines', color: '#94a3b8' },
  ])
  const sma20Hover = useChartHover(sma20, 'd', [{ key: 'v', name: '20 SMA', color: '#e11d48' }])
  const sma50Hover = useChartHover(sma50, 'd', [{ key: 'v', name: '50 SMA', color: '#db2777' }])
  const sma200Hover = useChartHover(sma200, 'd', [{ key: 'v', name: '200 SMA', color: '#f43f5e' }])
  const thrustHover = useChartHover(thrust, 'd', [
    { key: 'Thrust', name: 'Thrust', color: '#7c3aed' },
    { key: 'Ma', name: '10-MA', color: '#d97706' },
  ])
  const nearHover = useChartHover(near, 'd', [{ key: 'v', name: 'Near 52W High', color: '#2563eb' }])
  const rsiHover = useChartHover(rsi, 'd', [
    { key: 'Overbought', name: 'Overbought', color: '#7c3aed' },
    { key: 'Oversold', name: 'Oversold', color: '#ef4444' },
    { key: 'Neutral', name: 'Neutral', color: '#f59e0b' },
  ])
  const rsHover = useChartHover(rsSeries, 'd', [{ key: 'v', name: 'RS ≥ 50', color: '#0d9488' }])
  const rvolHover = useChartHover(rvolSeries, 'd', [{ key: 'v', name: 'RVOL ≥ 1.5×', color: '#ca8a04' }])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        {bundle.historyKind === 'ohlc-daily'
          ? `Charts use ${bundle.dailyHistory.length} trading sessions reconstructed from stored OHLC bars (~3 months of history).`
          : bundle.historyKind === 'server-daily'
            ? `Charts use ${bundle.dailyHistory.length} daily snapshots from the server (SMA %, advances/declines, RSI, RS, RVOL when recorded).`
            : 'Chart history uses the last ~63 trading sessions from price sparks until enough OHLC history is available.'}
        {' '}
        {bundle.adNet < 0
          ? 'A-D is soft under the surface — be cautious trusting index-level strength right now.'
          : 'Advances are leading — breadth supports index strength for now.'}
      </div>

      <ChartCard
        title="Advances vs Declines"
        subtitle="Daily count of stocks going up vs down"
        means="Compares daily breadth pressure between advancing and declining stocks."
        reading={`${advNow} stocks advancing vs ${decNow} declining today.`}
        action={
          decNow > advNow
            ? 'Declines are leading today — avoid trusting any index bounce until advances lead consistently.'
            : 'Advances lead — dips are more buyable while this persists.'
        }
      >
        <ChartPlot tip={advHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={advDec}
              margin={CHART_MARGIN_WITH_LEGEND}
              onMouseMove={advHover.onMouseMove}
              onMouseLeave={advHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Legend verticalAlign="bottom" height={24} />
            <Line
              type="monotone"
              dataKey="Advances"
              stroke="#16a34a"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="Declines"
              stroke="#94a3b8"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks Above 20-Day SMA"
        subtitle="Short-term participation — 20-day trend"
        means="Short-term participation shows how many stocks are holding a near-term trend."
        reading={`${bundle.pctAbove20}% of stocks are above the 20-day SMA — ${bundle.pctAbove20 < 40 ? 'weak' : bundle.pctAbove20 > 60 ? 'strong' : 'mixed'} reading.`}
        action="Improvement here is usually the first sign of a broader rebound — watch for it to turn up."
      >
        <ChartPlot tip={sma20Hover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sma20}
              margin={CHART_MARGIN}
              onMouseMove={sma20Hover.onMouseMove}
              onMouseLeave={sma20Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="20 SMA" stroke="#e11d48" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks Above 50-Day SMA"
        subtitle="Medium-term participation — 50-day trend"
        means="Medium-term breadth reflects whether the average stock is in a tradable uptrend."
        reading={`${bundle.pctAbove50}% of stocks are above the 50-day SMA — ${bundle.pctAbove50 < 40 ? 'weak' : bundle.pctAbove50 > 60 ? 'strong' : 'neutral'} reading.`}
        action="Trend quality is mixed when this sits mid-range — be selective with medium-term positions."
      >
        <ChartPlot tip={sma50Hover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sma50}
              margin={CHART_MARGIN}
              onMouseMove={sma50Hover.onMouseMove}
              onMouseLeave={sma50Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="50 SMA" stroke="#db2777" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks Above 200-Day SMA"
        subtitle="Long-term participation — structural trend"
        means="Long-term breadth shows whether the market has structural support."
        reading={`${bundle.pctAbove200}% of stocks are above the 200-day SMA — ${bundle.pctAbove200 < 40 ? 'bearish' : bundle.pctAbove200 > 60 ? 'bullish' : 'neutral'} reading.`}
        action="If structural support is mixed, manage risk carefully and prefer leaders still above the 200."
      >
        <ChartPlot tip={sma200Hover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sma200}
              margin={CHART_MARGIN}
              onMouseMove={sma200Hover.onMouseMove}
              onMouseLeave={sma200Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="200 SMA" stroke="#f43f5e" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="Breadth Thrust Indicator"
        subtitle="Advances / (Advances + Declines) — smoothed with 10-day MA"
        means="Measures the share of active stocks advancing. Readings above ~0.615 after oversold periods are classic thrust (bullish). Below ~0.40 can signal capitulation."
        reading={`Thrust at ${thrustNow.toFixed(3)} — ${thrustNow > 0.615 ? 'thrust zone' : thrustNow < 0.4 ? 'capitulation zone' : 'neutral range'}.`}
        action="Range-bound thrust: lean on other breadth signals before sizing up."
      >
        <ChartPlot tip={thrustHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={thrust}
              margin={CHART_MARGIN_WITH_LEGEND}
              onMouseMove={thrustHover.onMouseMove}
              onMouseLeave={thrustHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Legend verticalAlign="bottom" height={24} />
            <Line type="monotone" dataKey="Thrust" stroke="#7c3aed" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Ma" name="10-MA" stroke="#d97706" dot={false} strokeWidth={2} />
          </ComposedChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks Near 52-Week High"
        subtitle="Leadership quality — stocks close to yearly high"
        means="A larger share near 52-week highs means leadership is broadening."
        reading={`${bundle.pctNear52w}% of stocks are trading near their 52-week high (±5%).`}
        action={
          bundle.pctNear52w < 20
            ? 'Few leaders left — stock-picker’s market at best; stay defensive if indexes rise alone.'
            : 'Leadership is healthier — prefer names near highs with sector confirmation.'
        }
      >
        <ChartPlot tip={nearHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={near}
              margin={CHART_MARGIN}
              onMouseMove={nearHover.onMouseMove}
              onMouseLeave={nearHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="Near 52W High" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="RSI Distribution — Overbought vs Oversold vs Neutral"
        subtitle="% stocks RSI(14) above 70, below 30, and in between"
        means="Shows how stretched the universe is: overbought crowds vs oversold washouts."
        reading={`${bundle.pctRsi70}% overbought (RSI ≥ 70) · ${h.rsiOs.at(-1) ?? 0}% oversold (RSI ≤ 30).`}
        action="Oversold dominance can precede bounces, but needs breadth confirmation from advances and SMA %."
      >
        <ChartPlot tip={rsiHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rsi}
              margin={CHART_MARGIN_WITH_LEGEND}
              onMouseMove={rsiHover.onMouseMove}
              onMouseLeave={rsiHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Legend verticalAlign="bottom" height={24} />
            <Line type="monotone" dataKey="Overbought" stroke="#7c3aed" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Oversold" stroke="#ef4444" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Neutral" stroke="#f59e0b" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks with RS ≥ 50"
        subtitle={`RS score vs ASX200 (heuristic) · avg ${bundle.avgRs}`}
        means="Share of names with our RS score ≥ 50 (50 + (3M−index)×2.2). Rising % = leadership broadening beyond a few megacaps."
        reading={`${bundle.pctRs50}% have RS ≥ 50 · ${bundle.pctRs70}% are strong leaders (RS ≥ 70).`}
        action={
          bundle.pctRs50 < 40
            ? 'Leadership is narrow — prefer high-RS names; fade weak relative underperformers.'
            : 'RS breadth is healthy — dips in strong-RS names are more constructive.'
        }
      >
        <ChartPlot tip={rsHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rsSeries}
              margin={CHART_MARGIN}
              onMouseMove={rsHover.onMouseMove}
              onMouseLeave={rsHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="RS ≥ 50" stroke="#0d9488" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>

      <ChartCard
        title="% Stocks with RVOL ≥ 1.5×"
        subtitle={`Unusual volume vs 20-day average · avg RVOL ${bundle.avgRvol}×`}
        means="How many names are trading hotter than normal. Spikes often mark breakouts, news, or distribution."
        reading={`${bundle.pctRvol15}% at ≥1.5× · ${bundle.pctRvol20}% at ≥2× · ${bundle.pctRvol30}% at ≥3×.`}
        action={
          bundle.pctRvol15 > 30
            ? 'Volume is elevated across the board — confirm with price direction before chasing.'
            : 'Quiet tape — breakouts with rising RVOL stand out more.'
        }
      >
        <ChartPlot tip={rvolHover.tip}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rvolSeries}
              margin={CHART_MARGIN}
              onMouseMove={rvolHover.onMouseMove}
              onMouseLeave={rvolHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair />
            <Line type="monotone" dataKey="v" name="RVOL ≥ 1.5×" stroke="#ca8a04" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>
    </div>
  )
}
