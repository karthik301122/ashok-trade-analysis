export function HowToReadTab() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          How to read ASX market breadth
        </h3>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Breadth asks: is the average stock participating, or is the index being carried by a few
          heavyweights? Strong indexes with weak breadth often fail; strong breadth usually leads
          durable rallies.
        </p>
      </div>

      {(
        [
          [
            'SMA breadth',
            'Percent of stocks above the 20 / 50 / 200-day moving averages. Rising % = more names in uptrends. Falling % while the ASX200 rises = narrow leadership.',
          ],
          [
            'RSI breadth',
            'Share of stocks with RSI(14) above 50 (positive momentum), 60 (strong), or 70 (overbought). Oversold clusters can mark washouts; crowded overbought readings warn of pullback risk.',
          ],
          [
            'RS score (how we calculate it)',
            'Not an IBD-style percentile rank. Each stock gets rs = clamp(50 + (3M return − ASX200 3M) × 2.2), bounded roughly 1–99. RS ≥ 50 means the name beat the index over ~3 months on that heuristic — nothing more.',
          ],
          [
            'RS breadth',
            '% of stocks with RS ≥ 50 (beating the index on our score). Rising RS breadth = leadership broadening; falling = index may be carried by a few heavyweights.',
          ],
          [
            'Mood labels',
            'Rule-based, not AI. Score = ±1 for each of: 1M > 0, 3M > 0, vs ASX200 3M > 0, above 50-day MA. Score ≥ 2 → bullish; ≤ −2 → bearish; else neutral.',
          ],
          [
            'Cycle stages (Rotation Clock)',
            'Heuristic ladder on excess return vs index + MA flags (early / mid / late / recession). Useful for scanning, not a calibrated regime model.',
          ],
          [
            'Relative volume (RVOL)',
            'Today’s volume ÷ 20-day average. % of stocks ≥ 1.5× / 2× / 3× shows how widespread unusual activity is. High RVOL with rising prices often marks accumulation; with falling prices can mark distribution.',
          ],
          [
            'Advances vs declines',
            'Daily count of stocks up vs down. Prefer advances leading before trusting a bounce. A-D summation tracks the cumulative gap.',
          ],
          [
            'Breadth thrust',
            'Advances ÷ (advances + declines). Spikes after weak periods can kick off new bull legs. Very low readings can mark panic.',
          ],
          [
            'Near 52-week highs',
            'Leadership quality. Many stocks near highs = healthy bull. Indexes up with few near highs = fragile rally.',
          ],
          [
            'Universes',
            'Membership sets live in indexMembers.json. Default build is weight-rank proxy (npm run build:members). Pass INDEX_ASX200_CSV for official ASX200 tickers; other buckets may still be weight-ranked.',
          ],
          [
            'Server cache',
            'OHLCV bars, breadth daily points, and the full-market snapshot live in SQLite (data/asx.sqlite). Run npm run snapshot (or wait for background build). SPA prefers a fresh snapshot instead of crawling ~2k tickers in the browser.',
          ],
          [
            'This month pulse',
            'Live calendar-month framing from current returns only. It is not multi-year seasonality statistics.',
          ],
          [
            'Pattern scanner',
            'Only detectors we actually run are listed (~36 names). Harmonics and many textbook chart patterns are not implemented yet.',
          ],
        ] as const
      ).map(([t, b]) => (
        <div
          key={t}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <h4 className="font-semibold">{t}</h4>
          <p className="mt-1 text-[var(--color-ink-soft)]">{b}</p>
        </div>
      ))}
    </div>
  )
}
