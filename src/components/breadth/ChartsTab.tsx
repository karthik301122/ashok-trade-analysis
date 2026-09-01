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
import type { BreadthBundle } from './breadthMath'

type TooltipCoord = { x?: number; y?: number }
type TooltipRect = { x?: number; y?: number; width?: number; height?: number }

/** Place tooltip above or below the cursor so it does not cover chart lines. */
function offsetChartTooltipPosition(
  coord?: TooltipCoord,
  rect?: TooltipRect,
): { x: number; y: number } {
  const x0 = coord?.x ?? 0
  const y0 = coord?.y ?? 0
  const width = rect?.width ?? 280
  const height = rect?.height ?? 200
  const boxW = 132
  const boxH = 76
  const pad = 8
  let x = x0 - boxW / 2
  x = Math.max(pad, Math.min(x, width - boxW - pad))
  const yAbove = y0 - boxH - 14
  const maxY = height - boxH - pad
  const y = yAbove >= pad ? yAbove : Math.min(y0 + 14, maxY)
  return { x, y }
}

const chartTooltipCursor = { stroke: '#94a3b8', strokeDasharray: '4 4', strokeWidth: 1 }

type ChartTooltipPayload = {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string | number
  coordinate?: TooltipCoord
  viewBox?: TooltipRect
}

function ChartTooltipContent({
  active,
  payload,
  label,
  coordinate,
  viewBox,
}: ChartTooltipPayload) {
  if (!active || !payload?.length) return null
  const rect: TooltipRect = {
    width: viewBox?.width,
    height: viewBox?.height,
  }
  const { x, y } = offsetChartTooltipPosition(coordinate as TooltipCoord, rect)
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs shadow-md"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        pointerEvents: 'none',
        minWidth: '7rem',
      }}
    >
      {label != null && label !== '' && (
        <p className="mb-1 font-semibold text-[var(--color-ink)]">{label}</p>
      )}
      {payload.map((entry) => (
        <p
          key={String(entry.name)}
          className="tabular-nums"
          style={{ color: entry.color ?? 'var(--color-ink-soft)' }}
        >
          {entry.name} : {entry.value}
        </p>
      ))}
    </div>
  )
}

function ChartTooltip() {
  return (
    <Tooltip
      content={<ChartTooltipContent />}
      wrapperStyle={{ pointerEvents: 'none', zIndex: 20, outline: 'none' }}
      cursor={chartTooltipCursor}
      isAnimationActive={false}
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
      <div className="h-56 w-full">{children}</div>
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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={advDec}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Legend />
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
      </ChartCard>

      <ChartCard
        title="% Stocks Above 20-Day SMA"
        subtitle="Short-term participation — 20-day trend"
        means="Short-term participation shows how many stocks are holding a near-term trend."
        reading={`${bundle.pctAbove20}% of stocks are above the 20-day SMA — ${bundle.pctAbove20 < 40 ? 'weak' : bundle.pctAbove20 > 60 ? 'strong' : 'mixed'} reading.`}
        action="Improvement here is usually the first sign of a broader rebound — watch for it to turn up."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sma20}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="20 SMA" stroke="#e11d48" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="% Stocks Above 50-Day SMA"
        subtitle="Medium-term participation — 50-day trend"
        means="Medium-term breadth reflects whether the average stock is in a tradable uptrend."
        reading={`${bundle.pctAbove50}% of stocks are above the 50-day SMA — ${bundle.pctAbove50 < 40 ? 'weak' : bundle.pctAbove50 > 60 ? 'strong' : 'neutral'} reading.`}
        action="Trend quality is mixed when this sits mid-range — be selective with medium-term positions."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sma50}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="50 SMA" stroke="#db2777" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="% Stocks Above 200-Day SMA"
        subtitle="Long-term participation — structural trend"
        means="Long-term breadth shows whether the market has structural support."
        reading={`${bundle.pctAbove200}% of stocks are above the 200-day SMA — ${bundle.pctAbove200 < 40 ? 'bearish' : bundle.pctAbove200 > 60 ? 'bullish' : 'neutral'} reading.`}
        action="If structural support is mixed, manage risk carefully and prefer leaders still above the 200."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sma200}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="200 SMA" stroke="#f43f5e" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Breadth Thrust Indicator"
        subtitle="Advances / (Advances + Declines) — smoothed with 10-day MA"
        means="Measures the share of active stocks advancing. Readings above ~0.615 after oversold periods are classic thrust (bullish). Below ~0.40 can signal capitulation."
        reading={`Thrust at ${thrustNow.toFixed(3)} — ${thrustNow > 0.615 ? 'thrust zone' : thrustNow < 0.4 ? 'capitulation zone' : 'neutral range'}.`}
        action="Range-bound thrust: lean on other breadth signals before sizing up."
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={thrust}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Legend />
            <Line type="monotone" dataKey="Thrust" stroke="#7c3aed" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Ma" name="10-MA" stroke="#d97706" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={near}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="Near 52W High" stroke="#2563eb" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="RSI Distribution — Overbought vs Oversold vs Neutral"
        subtitle="% stocks RSI(14) above 70, below 30, and in between"
        means="Shows how stretched the universe is: overbought crowds vs oversold washouts."
        reading={`${bundle.pctRsi70}% overbought (RSI ≥ 70) · ${h.rsiOs.at(-1) ?? 0}% oversold (RSI ≤ 30).`}
        action="Oversold dominance can precede bounces, but needs breadth confirmation from advances and SMA %."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rsi}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Legend />
            <Line type="monotone" dataKey="Overbought" stroke="#7c3aed" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Oversold" stroke="#ef4444" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="Neutral" stroke="#f59e0b" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rsSeries}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="RS ≥ 50" stroke="#0d9488" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
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
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rvolSeries}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <ChartTooltip />
            <Line type="monotone" dataKey="v" name="RVOL ≥ 1.5×" stroke="#ca8a04" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
