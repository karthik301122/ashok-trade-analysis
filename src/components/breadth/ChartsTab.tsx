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
import { useCallback, useLayoutEffect, useState } from 'react'
import type { TooltipContentProps } from 'recharts'
import type { BreadthBundle } from './breadthMath'

type HoverTip = {
  label?: string | number
  payload?: Array<{ name?: string; value?: number; color?: string }>
}

const CHART_MARGIN = { top: 8, right: 12, left: 4, bottom: 4 }
const CHART_MARGIN_WITH_LEGEND = { top: 8, right: 12, left: 4, bottom: 28 }

const chartTooltipCursor = { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }

function ExternalTooltipBridge({
  active,
  payload,
  label,
  onTip,
}: TooltipContentProps & { onTip: (tip: HoverTip | null) => void }) {
  useLayoutEffect(() => {
    if (active && payload?.length) {
      onTip({
        label,
        payload: payload.map((entry) => ({
          name: entry.name != null ? String(entry.name) : String(entry.dataKey ?? ''),
          value:
            typeof entry.value === 'number'
              ? entry.value
              : Array.isArray(entry.value)
                ? Number(entry.value[0])
                : Number(entry.value),
          color: entry.color ?? entry.stroke,
        })),
      })
    } else {
      onTip(null)
    }
  }, [active, payload, label, onTip])
  return null
}

function useChartHover() {
  const [tip, setTip] = useState<HoverTip | null>(null)
  const onTip = useCallback((t: HoverTip | null) => setTip(t), [])
  const tooltipContent = useCallback(
    (props: TooltipContentProps) => (
      <ExternalTooltipBridge {...props} onTip={onTip} />
    ),
    [onTip],
  )
  const onMouseLeave = useCallback(() => setTip(null), [])
  return { tip, tooltipContent, onMouseLeave }
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
function ChartCrosshair({
  content,
}: {
  content: (props: TooltipContentProps) => ReactNode
}) {
  return (
    <Tooltip
      content={content}
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

  const advHover = useChartHover()
  const sma20Hover = useChartHover()
  const sma50Hover = useChartHover()
  const sma200Hover = useChartHover()
  const thrustHover = useChartHover()
  const nearHover = useChartHover()
  const rsiHover = useChartHover()
  const rsHover = useChartHover()
  const rvolHover = useChartHover()

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
              onMouseLeave={advHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartCrosshair content={advHover.tooltipContent} />
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
              onMouseLeave={sma20Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={sma20Hover.tooltipContent} />
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
              onMouseLeave={sma50Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={sma50Hover.tooltipContent} />
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
              onMouseLeave={sma200Hover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={sma200Hover.tooltipContent} />
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
              onMouseLeave={thrustHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={thrustHover.tooltipContent} />
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
              onMouseLeave={nearHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartCrosshair content={nearHover.tooltipContent} />
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
              onMouseLeave={rsiHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={rsiHover.tooltipContent} />
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
              onMouseLeave={rsHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={rsHover.tooltipContent} />
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
              onMouseLeave={rvolHover.onMouseLeave}
            >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartCrosshair content={rvolHover.tooltipContent} />
            <Line type="monotone" dataKey="v" name="RVOL ≥ 1.5×" stroke="#ca8a04" dot={false} strokeWidth={2} />
          </LineChart>
          </ResponsiveContainer>
        </ChartPlot>
      </ChartCard>
    </div>
  )
}
