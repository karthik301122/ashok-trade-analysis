import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, LayoutGrid } from 'lucide-react'
import type { BreadthBundle } from './breadthMath'
import { UNIVERSES, type UniverseId } from './breadthMath'
import { DiffusionChart } from './DiffusionChart'
import {
  DIFFUSION_GROUPS,
  type DiffusionIndicatorId,
  buildDiffusionSeries,
  currentDiffusionValue,
  diffusionGroupForIndicator,
  diffusionReferenceLevels,
  findDiffusionIndicator,
} from './diffusionIndicators'
import type { Time } from 'lightweight-charts'
import {
  coerceIndexBar,
  coerceIndexBars,
  fetchIndexBarsForChart,
  type BreadthDailyPoint,
  type BreadthIndexBar,
} from '../../lib/breadthApi'

type Props = {
  bundle: BreadthBundle
  chartHistory: BreadthDailyPoint[]
  indexBars: BreadthIndexBar[]
  historyLoading: boolean
  universeId: UniverseId
  onUniverseChange: (id: UniverseId) => void
  onOpenClassic?: () => void
}

const MIN_INDEX_BARS = 2

type OhlcBar = BreadthIndexBar

function timeToUnix(time: Time): number {
  if (typeof time === 'number' && Number.isFinite(time)) return time
  if (typeof time === 'string' && time.length >= 10) {
    return Math.floor(new Date(`${time.slice(0, 10)}T12:00:00Z`).getTime() / 1000)
  }
  return 0
}

function noonUtcFromUnix(t: number): number {
  const day = new Date(t * 1000).toISOString().slice(0, 10)
  return Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 1000)
}

function normalizeIndexBarsForChart(bars: OhlcBar[]): OhlcBar[] {
  const byDay = new Map<string, OhlcBar>()
  for (const raw of bars) {
    const b = coerceIndexBar(raw)
    if (!b) continue
    const day = new Date(b.t * 1000).toISOString().slice(0, 10)
    byDay.set(day, { ...b, t: noonUtcFromUnix(b.t) })
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t)
}

function filterIndexToSeries(indexBars: OhlcBar[], seriesTimes: number[]): OhlcBar[] {
  const normalized = normalizeIndexBarsForChart(indexBars)
  if (!normalized.length) return []
  if (!seriesTimes.length) return normalized.slice(-63)
  const min = Math.min(...seriesTimes)
  const max = Math.max(...seriesTimes)
  const pad = 5 * 86400
  const filtered = normalized.filter((b) => b.t >= min - pad && b.t <= max + pad)
  return filtered.length ? filtered : normalized.slice(-63)
}

export function DiffusionIndicatorsView({
  bundle,
  chartHistory,
  indexBars: serverIndexBars,
  historyLoading,
  universeId,
  onUniverseChange,
  onOpenClassic,
}: Props) {
  const [indicatorId, setIndicatorId] = useState<DiffusionIndicatorId>('sma-20')
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(['sma']))
  const [fallbackIndexBars, setFallbackIndexBars] = useState<OhlcBar[]>([])

  const def = findDiffusionIndicator(indicatorId)
  const indicatorSeries = useMemo(
    () => buildDiffusionSeries(bundle, indicatorId),
    [bundle, indicatorId],
  )
  const seriesTimes = useMemo(
    () => indicatorSeries.map((p) => timeToUnix(p.time)).filter((t) => t > 0),
    [indicatorSeries],
  )

  const indexBars = useMemo<OhlcBar[]>(
    () => {
      const server = coerceIndexBars(serverIndexBars)
      return server.length ? server : fallbackIndexBars
    },
    [serverIndexBars, fallbackIndexBars],
  )

  useEffect(() => {
    setFallbackIndexBars([])
  }, [universeId])

  useEffect(() => {
    if (historyLoading) return
    const serverBars = coerceIndexBars(serverIndexBars)
    if (serverBars.length >= MIN_INDEX_BARS) return
    if (fallbackIndexBars.length >= MIN_INDEX_BARS) return
    const probe = filterIndexToSeries(
      serverBars.length ? serverBars : fallbackIndexBars,
      seriesTimes,
    )
    if (probe.length >= MIN_INDEX_BARS) return
    let cancelled = false
    const earliest = chartHistory[0]?.day ?? bundle.dailyHistory[0]?.day
    const from =
      earliest && earliest.length === 10
        ? new Date(`${earliest}T00:00:00Z`)
        : new Date(Date.now() - 120 * 86400 * 1000)
    from.setUTCDate(from.getUTCDate() - 10)
    const fromIso = from.toISOString().slice(0, 10)
    void fetchIndexBarsForChart(fromIso).then((bars) => {
      if (!cancelled) setFallbackIndexBars(bars)
    })
    return () => {
      cancelled = true
    }
  }, [
    historyLoading,
    serverIndexBars,
    fallbackIndexBars.length,
    seriesTimes,
    chartHistory,
    bundle.dailyHistory,
  ])

  const alignedIndex = useMemo(
    () => filterIndexToSeries(indexBars, seriesTimes),
    [indexBars, seriesTimes],
  )

  const universeLabel = UNIVERSES.find((u) => u.id === universeId)?.label ?? universeId
  const currentVal = currentDiffusionValue(bundle, indicatorId)
  const refLevels = diffusionReferenceLevels(def.scale)

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex min-h-[560px] flex-col gap-3 lg:flex-row lg:gap-0">
      <aside className="w-full shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] lg:w-64 lg:rounded-none lg:rounded-l-xl lg:border-r lg:border-y">
        <div className="border-b border-[var(--color-border)] px-3 py-2.5">
          <h2 className="text-sm font-bold tracking-tight">Diffusion Indicators</h2>
          <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
            Index + breadth overlay · dashed lines at {def.scale === 'percent' ? '10 / 20 / 80 / 90' : 'thrust zones'}
          </p>
        </div>
        <nav className="max-h-[420px] overflow-y-auto p-1.5">
          {DIFFUSION_GROUPS.map((group) => {
            const open = openGroups.has(group.id)
            return (
              <div key={group.id} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {group.label}
                </button>
                {open && (
                  <ul className="mb-1 ml-1 space-y-0.5 border-l-2 border-[var(--color-border)] pl-2">
                    {group.indicators.map((ind) => {
                      const active = indicatorId === ind.id
                      return (
                        <li key={ind.id}>
                          <button
                            type="button"
                            onClick={() => setIndicatorId(ind.id)}
                            className={`w-full rounded-md px-2 py-1.5 text-left text-[11px] leading-snug transition ${
                              active
                                ? 'border-l-2 border-sky-500 bg-sky-50 font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-100'
                                : 'text-[var(--color-ink)] hover:bg-[var(--color-muted)]'
                            }`}
                          >
                            {ind.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </nav>
        {onOpenClassic && (
          <div className="border-t border-[var(--color-border)] p-2">
            <button
              type="button"
              onClick={onOpenClassic}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-[11px] font-semibold text-[var(--color-ink-soft)] hover:border-teal-400 hover:text-[var(--color-ink)]"
            >
              <LayoutGrid size={12} />
              Classic breadth view
            </button>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-2 lg:rounded-r-xl lg:border lg:border-l-0 lg:border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 lg:px-3 lg:pt-2">
          <div>
            <h3 className="text-sm font-bold">
              {diffusionGroupForIndicator(indicatorId)} · {def.label}
            </h3>
            <p className="text-[11px] text-[var(--color-ink-soft)]">
              {bundle.historyKind === 'ohlc-daily'
                ? `${bundle.dailyHistory.length} sessions from stored OHLC`
                : bundle.historyKind === 'server-daily'
                  ? `${bundle.dailyHistory.length} daily snapshots`
                  : 'Spark proxy until OHLC history fills in'}
            </p>
          </div>
          <select
            value={universeId}
            onChange={(e) => onUniverseChange(e.target.value as UniverseId)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold"
            title={UNIVERSES.find((u) => u.id === universeId)?.hint ?? 'Universe'}
          >
            {UNIVERSES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {historyLoading ? (
          <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink-soft)]">
            Loading {universeLabel} breadth history…
          </div>
        ) : indicatorSeries.length < 2 ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 text-center text-sm text-[var(--color-ink-soft)]">
            <p>Not enough history yet for {universeLabel}.</p>
            <p className="text-xs">
              Open Markets so the server snapshot builds, or wait for daily breadth points to accumulate.
            </p>
          </div>
        ) : (
          <DiffusionChart
            key={`${universeId}-${indicatorId}`}
            indexBars={alignedIndex}
            indexLabel="ASX 200 Index"
            indicatorLabel={`${def.label} · ${universeLabel}`}
            indicatorSeries={indicatorSeries}
            currentValue={currentVal}
            scale={def.scale}
            referenceLevels={refLevels}
          />
        )}
      </div>
    </div>
  )
}
