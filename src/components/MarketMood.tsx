type Props = {
  bullish: number
  neutral: number
  bearish: number
}

export function MarketMood({ bullish, neutral, bearish }: Props) {
  const total = bullish + neutral + bearish || 1
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Market Mood
      </div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div className="flex h-full w-full">
          <div className="bg-emerald-500" style={{ width: `${(bullish / total) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(neutral / total) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(bearish / total) * 100}%` }} />
        </div>
      </div>
      <div className="flex gap-2 text-xs font-semibold tabular-nums">
        <span className="text-emerald-600">↑ {bullish}</span>
        <span className="text-amber-600">→ {neutral}</span>
        <span className="text-rose-600">↓ {bearish}</span>
      </div>
    </div>
  )
}
