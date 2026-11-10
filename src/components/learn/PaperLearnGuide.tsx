type Section = {
  title: string
  body: string[]
  steps?: string[]
  doesNot?: string[]
}

const SECTIONS: Section[] = [
  {
    title: 'What is Paper mode?',
    body: [
      'TradersScope has two ways to look at the same ASX desk: Live and Paper.',
      'Live is for watching real market data, breadth, and (with an upgrade) patterns. You are not sending orders to a broker from this app.',
      'Paper is a practice switch. When Paper is on, Buy and Sell actions use fake money on a practice account that starts at A$100,000. Prices come from the same desk data you see in Markets and charts — not from a real brokerage.',
      'Your paper cash, holdings, and trade history are saved on your signed-in account. They are separate from anyone else’s practice account.',
    ],
  },
  {
    title: 'How to turn Paper on',
    body: [
      'Sign in, then use the Live | Paper control in the header.',
      'When Paper is active you will see a clear Paper badge / banner so you do not confuse practice fills with live research.',
      'You can open a stock from Markets or a chart and place a paper market buy or sell. You can also trade from the Learn → Portfolio tab.',
    ],
    steps: [
      'Sign in to your account.',
      'Click Paper in the header toggle.',
      'Open Markets (or a stock chart) and use Trade / Buy / Sell, or go to Learn → Portfolio.',
      'Watch cash, holdings, and P&L update on the Learn hub and in the header equity chip.',
    ],
    doesNot: [
      'Does not send real orders to a broker.',
      'Does not unlock paid Patterns / Create / Alerts by itself.',
      'Does not support limit, stop, or short-sell orders yet — market buy/sell only.',
    ],
  },
  {
    title: 'Learn hub — Portfolio',
    body: [
      'The Portfolio tab is your practice account statement: cash left, value of holdings, total equity, and total profit or loss versus the A$100,000 start.',
      'You can place a simple market buy or sell here by ticker and quantity. Fills use the desk’s latest available price for that name.',
      'Reset clears holdings and trades and restores starting cash. Use this when you want a clean lesson or a new scenario.',
    ],
    steps: [
      'Open Learn in the top navigation.',
      'Stay on Portfolio (default).',
      'Enter a ticker and quantity, choose Buy or Sell, submit.',
      'Optional: Reset portfolio if you want to start over at A$100,000.',
    ],
    doesNot: [
      'Does not charge real money.',
      'Does not include brokerage fees or slippage modelling.',
    ],
  },
  {
    title: 'Session replay',
    body: [
      'Session replay lets you “play back” a trading day (or a recent daily stretch) bar by bar, then practice buying and selling as the simulated clock moves.',
      'By default it loads intraday bars (5 minutes, 15 minutes, or 1 hour) for a session date you choose. You see open / high / low / close and a small candle strip.',
      'Every fill goes into the same shared paper portfolio as Markets Paper trading. Confirm the checkbox before trading so you know practice cash will change.',
      'If intraday data is missing for that day, use Daily fallback to replay the last ~60 daily bars instead.',
    ],
    steps: [
      'Open Learn → Session replay.',
      'Tick the acknowledgement that fills update your paper portfolio.',
      'Pick a ticker, session date, and interval (5m / 15m / 1h).',
      'Click Load session (or Daily fallback).',
      'Use Play / Pause / Step, then Buy or Sell at the current bar’s close.',
    ],
    doesNot: [
      'Is not a full professional charting package.',
      'Does not guarantee intraday history for every ticker and date (provider limits apply).',
      'Does not create a separate “replay-only” wallet — it shares your paper account.',
    ],
  },
  {
    title: 'Risk sizing',
    body: [
      'Risk sizing answers: “If I risk X% of my account between my entry and my stop, how many shares should I buy?”',
      'You enter account size (often your paper equity), risk percent, entry price, and stop price for a long trade. The tool computes share count and notional size.',
      'You can then place a paper buy for that sized quantity so the lesson sticks with a real (practice) fill.',
    ],
    steps: [
      'Open Learn → Risk sizing.',
      'Enter ticker, account A$, risk %, entry, and stop (entry must be above stop for a long).',
      'Read the suggested share count.',
      'Optional: paper-buy that size into your practice portfolio.',
    ],
    doesNot: [
      'Does not place a real stop-loss order at the broker.',
      'Does not size short trades.',
      'Does not replace your own risk rules — it is a calculator plus optional practice fill.',
    ],
  },
  {
    title: 'Pattern drill',
    body: [
      'Pattern drill is a quick quiz using names that already appeared in the desk’s daily pattern scan.',
      'Before you choose, you see the ticker and context (sector, relative strength, relative volume, RSI, last price) — but not the pattern name or its bullish / bearish / neutral tag.',
      'You pick Buy, Skip, or Sell / avoid. Then the drill reveals the pattern and scores you against the official bias: bullish → Buy, bearish → Sell / avoid, neutral → Skip.',
      'Skip is only correct for neutral patterns. After reveal you may optionally paper-buy a quantity you choose.',
    ],
    steps: [
      'Open Learn → Pattern drill.',
      'Read the hidden-pattern context for the ticker.',
      'Choose Buy, Skip, or Sell / avoid.',
      'Review whether you matched the bias, then Next hit or Paper buy.',
    ],
    doesNot: [
      'Is not financial advice and is not a guarantee that the bias will be profitable.',
      'Does not replace opening the full chart before a real decision.',
      'Needs the daily pattern job to have hits; otherwise you will see an empty-state message.',
    ],
  },
  {
    title: 'What-if',
    body: [
      'What-if is a read-only calculator: “If I had bought this many shares on this date, what would that position be worth at today’s desk price?”',
      'It loads history, takes the close on (or just before) your buy date as the entry, and marks the position to the latest desk close.',
      'You can override the buy price if you want to model a different entry. Nothing is written to your paper portfolio.',
    ],
    steps: [
      'Open Learn → What-if.',
      'Enter ticker, buy date, and quantity (buy price optional).',
      'Click Mark to market.',
      'Read cost, current value, and profit or loss.',
    ],
    doesNot: [
      'Does not place paper or live trades.',
      'Does not include dividends, fees, or corporate actions beyond simple price history.',
    ],
  },
]

const GLOSSARY: { term: string; def: string }[] = [
  {
    term: 'Ticker',
    def: 'Short code for a listed company (for example BHP). On this desk ASX names are usually written without “.AX”.',
  },
  {
    term: 'Fill',
    def: 'When a practice buy or sell is accepted at a price. In Paper mode the fill uses desk prices (or a simulator’s bar close).',
  },
  {
    term: 'Mark',
    def: 'The current price used to value a holding. Unrealized P&L compares your average cost to the mark.',
  },
  {
    term: 'P&L',
    def: 'Profit and loss — how much you are ahead or behind. Total P&L on Portfolio is versus your starting A$100,000.',
  },
  {
    term: 'Equity',
    def: 'Cash plus the market value of holdings. This is your practice account’s total size.',
  },
  {
    term: 'Stop',
    def: 'A price where you plan to exit if the trade goes against you. Risk sizing uses the distance from entry to stop to pick share count.',
  },
  {
    term: 'Bias',
    def: 'Whether a scanned pattern is tagged bullish (up-leaning), bearish (down-leaning), or neutral. Used to score the Pattern drill.',
  },
  {
    term: 'Session',
    def: 'A trading day window. Session replay plays bars from that day so you can practice decisions in time order.',
  },
]

export function PaperLearnGuide() {
  return (
    <div className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Learn guide
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
          This page explains Paper mode and every Learn tool in plain language. You do not need prior
          trading experience — start here, then try each tab with fake money only.
        </p>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-2 border-t border-[var(--color-border)] pt-4">
          <h4 className="font-[family-name:var(--font-display)] text-base font-semibold">
            {s.title}
          </h4>
          {s.body.map((p) => (
            <p key={p.slice(0, 48)} className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
              {p}
            </p>
          ))}
          {s.steps && s.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Step by step
              </p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink)]">
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {s.doesNot && s.doesNot.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                What it does not do
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-soft)]">
                {s.doesNot.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      <section className="space-y-2 border-t border-[var(--color-border)] pt-4">
        <h4 className="font-[family-name:var(--font-display)] text-base font-semibold">
          Glossary
        </h4>
        <dl className="space-y-3">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt className="text-sm font-semibold">{g.term}</dt>
              <dd className="text-sm text-[var(--color-ink-soft)]">{g.def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
