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
            'RS breadth',
            'Relative strength vs ASX200. % with RS ≥ 50 means more names are beating the index. Rising RS breadth = leadership broadening; falling = index may be carried by a few heavyweights.',
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
            'ASX 200 / 500 are weight-rank proxies (top names by weight in our universe). Mid Cap = ranks 201–500; Small Cap = thinner names. Official index membership may differ slightly.',
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
