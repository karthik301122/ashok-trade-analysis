import { useMemo } from 'react'
import type { CycleStage, MarketSnapshot } from '../data/types'
import { CYCLE_LABEL } from '../lib/market'

type Props = { snapshot: MarketSnapshot }

const ORDER: CycleStage[] = ['early', 'mid', 'late', 'recession']

export function RotationClock({ snapshot }: Props) {
  const groups = useMemo(() => {
    const map: Record<CycleStage, typeof snapshot.industries> = {
      early: [],
      mid: [],
      late: [],
      recession: [],
    }
    for (const ind of snapshot.industries) map[ind.cycle].push(ind)
    for (const k of ORDER) map[k].sort((a, b) => b.weight - a.weight)
    return map
  }, [snapshot.industries])

  // Place dots on clock by cycle + index
  const dots = useMemo(() => {
    const result: { x: number; y: number; color: string; name: string; r: number }[] = []
    const cx = 160
    const cy = 160
    const ranges: Record<CycleStage, [number, number]> = {
      early: [-20, 70],
      mid: [70, 160],
      late: [160, 250],
      recession: [250, 340],
    }
    for (const stage of ORDER) {
      const list = groups[stage]
      list.forEach((ind, i) => {
        const [a0, a1] = ranges[stage]
        const angle = ((a0 + ((i + 0.5) / Math.max(list.length, 1)) * (a1 - a0)) * Math.PI) / 180
        const radius = 55 + (ind.weight % 5) * 12 + (i % 3) * 8
        result.push({
          x: cx + Math.cos(angle) * Math.min(radius, 130),
          y: cy + Math.sin(angle) * Math.min(radius, 130),
          color: CYCLE_LABEL[stage].color,
          name: ind.name,
          r: 3 + Math.min(ind.weight, 8) * 0.45,
        })
      })
    }
    return result
  }, [groups])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs">
        {ORDER.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CYCLE_LABEL[s].color }} />
            <span className="font-medium">
              {s === 'early' && 'Early Cycle — Accumulate'}
              {s === 'mid' && 'Mid Cycle — Hold / Add'}
              {s === 'late' && 'Late Cycle — Reduce'}
              {s === 'recession' && 'Recession — Exit'}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <svg viewBox="0 0 320 320" className="mx-auto w-full max-w-[320px]">
            <circle cx="160" cy="160" r="148" fill="var(--color-muted)" stroke="var(--color-border)" />
            {/* quadrants */}
            <path d="M160 160 L160 12 A148 148 0 0 1 308 160 Z" fill="#dcfce7" opacity="0.85" />
            <path d="M160 160 L308 160 A148 148 0 0 1 160 308 Z" fill="#dbeafe" opacity="0.85" />
            <path d="M160 160 L160 308 A148 148 0 0 1 12 160 Z" fill="#ffedd5" opacity="0.85" />
            <path d="M160 160 L12 160 A148 148 0 0 1 160 12 Z" fill="#fee2e2" opacity="0.85" />
            <circle cx="160" cy="160" r="36" fill="var(--color-surface)" stroke="var(--color-border)" />
            <text x="160" y="156" textAnchor="middle" className="fill-current" fontSize="10" fontWeight="700">
              ASX
            </text>
            <text x="160" y="170" textAnchor="middle" fill="#6b7280" fontSize="9">
              ROTATION
            </text>
            <text x="230" y="70" fill="#16a34a" fontSize="10" fontWeight="700">
              EARLY
            </text>
            <text x="230" y="250" fill="#2563eb" fontSize="10" fontWeight="700">
              MID
            </text>
            <text x="70" y="250" fill="#ea580c" fontSize="10" fontWeight="700">
              LATE
            </text>
            <text x="70" y="70" fill="#dc2626" fontSize="10" fontWeight="700">
              EXIT
            </text>
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.color} opacity="0.9">
                <title>{d.name}</title>
              </circle>
            ))}
          </svg>
          <p className="mt-2 text-center text-[11px] text-[var(--color-ink-soft)]">
            Dot size ≈ industry weight · Colour = cycle stage · Flow: Early → Mid → Late → Exit → Early
          </p>
        </div>

        <div className="space-y-3">
          {ORDER.map((stage) => (
            <div
              key={stage}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
              style={{ borderLeftWidth: 4, borderLeftColor: CYCLE_LABEL[stage].color }}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
                <div className="text-sm font-semibold">
                  {stage === 'early' && 'Early Cycle — Accumulate'}
                  {stage === 'mid' && 'Mid Cycle — Hold / Add'}
                  {stage === 'late' && 'Late Cycle — Reduce'}
                  {stage === 'recession' && 'Recession — Exit'}
                </div>
                <div className="text-xs text-[var(--color-ink-soft)]">{groups[stage].length} industries</div>
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {groups[stage].map((ind) => (
                  <span
                    key={ind.name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: CYCLE_LABEL[stage].color }}
                    />
                    {ind.name}
                    <span className={ind.perf.m1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {ind.perf.m1 >= 0 ? '↑' : '↓'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
