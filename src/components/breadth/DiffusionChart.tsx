import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LineData, Time } from 'lightweight-charts'
import type { OhlcBar } from '../../lib/yahoo'

/** Fixed chart stack height */
const CHART_HEIGHT_PX = 560
const INDEX_PANE_PX = Math.round(CHART_HEIGHT_PX * 0.42)
const BREADTH_PANE_PX = CHART_HEIGHT_PX - INDEX_PANE_PX

type Props = {
  indexBars: OhlcBar[]
  indexLabel: string
  indicatorLabel: string
  indicatorSeries: LineData<Time>[]
  indicatorColor?: string
  currentValue: number
  scale: 'percent' | 'thrust'
  referenceLevels: number[]
}

function timeToDayLabel(time: Time): string {
  if (typeof time === 'string' && time.length >= 10) {
    const d = new Date(`${time.slice(0, 10)}T12:00:00Z`)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
    }
    return time.slice(0, 10)
  }
  if (typeof time === 'number' && Number.isFinite(time)) {
    return new Date(time * 1000).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
  }
  return ''
}

function timeToSortKey(time: Time): number {
  if (typeof time === 'string' && time.length >= 10) {
    return Date.parse(`${time.slice(0, 10)}T12:00:00Z`)
  }
  if (typeof time === 'number' && Number.isFinite(time)) return time * 1000
  return 0
}

function dayKeyFromUnix(t: number): string {
  return new Date(t * 1000).toISOString().slice(0, 10)
}

export function DiffusionChart({
  indexBars,
  indexLabel,
  indicatorLabel,
  indicatorSeries,
  indicatorColor = '#22c55e',
  currentValue,
  scale,
  referenceLevels,
}: Props) {
  const indexData = indexBars
    .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c))
    .map((b) => ({
      key: dayKeyFromUnix(b.t),
      d: new Date(b.t * 1000).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }),
      index: b.c,
      sort: b.t,
    }))
    .sort((a, b) => a.sort - b.sort)

  const breadthData = indicatorSeries
    .filter((p) => typeof p.value === 'number' && !Number.isNaN(p.value))
    .map((p) => ({
      key:
        typeof p.time === 'string'
          ? p.time.slice(0, 10)
          : dayKeyFromUnix(p.time as number),
      d: timeToDayLabel(p.time),
      v: p.value,
      sort: timeToSortKey(p.time),
    }))
    .sort((a, b) => a.sort - b.sort)

  const valueLabel =
    scale === 'percent' ? `${currentValue.toFixed(1)}%` : currentValue.toFixed(3)

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] lg:rounded-none lg:border-0"
      style={{ height: CHART_HEIGHT_PX }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs">
        <div className="font-semibold text-[var(--color-ink-soft)]">
          {indexLabel}
          <span className="ml-2 text-[var(--color-ink)]">Daily</span>
        </div>
        <div className="font-semibold text-[var(--color-ink-soft)]">
          {indicatorLabel}
          <span className="ml-2 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {valueLabel}
          </span>
        </div>
      </div>

      <div
        className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ height: INDEX_PANE_PX }}
      >
        {indexData.length < 2 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--color-ink-soft)]">
            ASX 200 index line unavailable — breadth chart below still uses your selected universe.
          </div>
        ) : (
          <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={1}>
              <LineChart data={indexData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="d" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="index"
                name={indexLabel}
                stroke="#f97316"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{ height: BREADTH_PANE_PX }} className="bg-[var(--color-surface)]">
        {breadthData.length < 2 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[var(--color-ink-soft)]">
            Not enough breadth history to chart yet.
          </div>
        ) : (
          <div className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={1}>
              <LineChart data={breadthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="d" tick={{ fontSize: 10 }} minTickGap={24} />
              <YAxis
                domain={scale === 'percent' ? [0, 100] : ['auto', 'auto']}
                tick={{ fontSize: 10 }}
                width={40}
              />
              <Tooltip />
              {referenceLevels.map((level) => (
                <ReferenceLine
                  key={level}
                  y={level}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              ))}
              <Line
                type="monotone"
                dataKey="v"
                name={indicatorLabel}
                stroke={indicatorColor}
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
