import { Sparkline } from '../Sparkline'

type Props = {
  adNet: number
  adHistory: number[]
  advancing: number
  declining: number
}

export function ADSummation({ adNet, adHistory, advancing, declining }: Props) {
  const falling = adHistory.length > 1 && adHistory.at(-1)! < adHistory.at(-2)!
  const abs = Math.abs(adNet)
  const maxRef = Math.max(abs, 50)
  const pct = Math.min(50, (abs / maxRef) * 50)

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">A-D Summation</h3>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Advances {advancing} · Declines {declining} (today vs prior close)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${falling ? 'text-rose-600' : 'text-emerald-600'}`}>
            {falling ? 'Falling' : 'Rising'}
          </span>
          <Sparkline
            values={adHistory.length ? adHistory : [0, adNet]}
            width={72}
            height={24}
            positive={!falling}
          />
        </div>
      </div>

      <div className="relative h-3 rounded-full bg-[var(--color-muted)]">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--color-border)]" />
        {adNet < 0 ? (
          <div
            className="absolute top-0 bottom-0 rounded-l-full bg-rose-500"
            style={{ right: '50%', width: `${pct}%` }}
          />
        ) : (
          <div
            className="absolute top-0 bottom-0 rounded-r-full bg-emerald-500"
            style={{ left: '50%', width: `${pct}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        <span>Net Negative</span>
        <span className={`text-sm tabular-nums ${adNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {adNet > 0 ? '+' : ''}
          {adNet.toLocaleString()}
        </span>
        <span>Net Positive</span>
      </div>
    </div>
  )
}
