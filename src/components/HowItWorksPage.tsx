import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onBack: () => void
  onSignIn?: () => void
}

const PRACTICE_TOOLS: { title: string; body: string; steps: string[] }[] = [
  {
    title: 'Paper mode (Live | Paper)',
    body: 'A practice switch in the header. When Paper is on, buys and sells use fake A$100,000 on the same desk prices you see in Markets — not a real broker. Your practice cash and holdings are saved on your signed-in account.',
    steps: [
      'Sign in and click Paper in the header.',
      'Trade from Markets rows, a stock chart, or Learn → Portfolio.',
      'Watch equity and P&L on the Learn hub.',
    ],
  },
  {
    title: 'Portfolio',
    body: 'Your practice account statement: cash, holdings, equity, total P&L, and recent trades. Reset restores starting cash when you want a clean lesson.',
    steps: [
      'Open Learn → Portfolio.',
      'Enter a ticker and quantity; Buy or Sell at the desk last price.',
      'Optional: Reset to A$100,000.',
    ],
  },
  {
    title: 'Session replay',
    body: 'Play back an ASX session bar by bar (5m / 15m / 1h, or daily fallback). Practice buying and selling as the simulated clock moves. Fills update the same shared paper portfolio.',
    steps: [
      'Open Learn → Session replay and confirm the shared-portfolio checkbox.',
      'Pick ticker, date, and interval; Load session.',
      'Play or step through bars; Buy/Sell at the current close.',
    ],
  },
  {
    title: 'Risk sizing',
    body: 'Answers “how many shares if I risk X% of my account between entry and stop?” for a long trade, then optionally paper-buys that size.',
    steps: [
      'Enter account size, risk %, entry, and stop.',
      'Read the suggested share count.',
      'Optional: place a paper buy for that size.',
    ],
  },
  {
    title: 'Pattern drill',
    body: 'A quiz from the desk pattern scan. You see ticker context first; pattern name and bias stay hidden until you choose Buy, Skip, or Sell/avoid. Scoring follows official bias (bullish→Buy, bearish→Sell, neutral→Skip).',
    steps: [
      'Choose Buy, Skip, or Sell/avoid.',
      'Reveal to see if you matched the bias.',
      'Optional: paper-buy; then Next hit.',
    ],
  },
  {
    title: 'What-if',
    body: 'Read-only calculator: if you had bought on a past date, what is the position worth at the latest desk close? Entry uses that date’s close (override allowed). Does not place trades.',
    steps: [
      'Enter ticker, buy date, and quantity.',
      'Click Mark to market.',
      'Read cost, value, and P&L.',
    ],
  },
]

export function HowItWorksPage({ onBack, onSignIn }: Props) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-10%,#ccfbf1_0%,transparent_55%),radial-gradient(900px_500px_at_90%_0%,#e0f2fe_0%,transparent_50%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-slate-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-teal-800 hover:underline">
          ← Back
        </button>
        {onSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Sign in
          </button>
        )}
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{APP_TAGLINE}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
          How {APP_NAME} works
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          One shared ASX desk for trainers and self-directed traders. Markets, breadth, and pattern
          scans are computed on the server so everyone sees the same picture. Paper mode and Learn
          tools let you practice with fake money before (or instead of) using a real broker.
        </p>

        <ol className="mt-10 space-y-6">
          {[
            [
              'Markets & breadth',
              'Sector heat, rotation, and participation — free for signed-in accounts so you can learn the layout.',
            ],
            [
              'Paper mode & Learn',
              'Switch Live / Paper in the header to practice with fake A$100,000 on desk prices. The Learn hub adds a full beginner guide, session replay, risk sizing, pattern drills, and what-if tools — not real brokerage.',
            ],
            [
              'Patterns & alerts',
              'Full pattern desk and email alerts unlock with an individual upgrade or a school seat. Paper mode does not bypass those gates.',
            ],
            [
              'Schools & cohorts',
              'Educators buy seats, invite students by email (pay-to-join), publish daily scans, and brand the desk.',
            ],
            [
              'Watchlists',
              'Save ticker lists on your account and highlight them on the Markets table while you work.',
            ],
          ].map(([t, d]) => (
            <li key={t} className="rounded-xl border border-slate-200 bg-white/80 p-5">
              <div className="text-sm font-semibold text-teal-800">{t}</div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ol>

        <section className="mt-12">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Practice tools (Paper & Learn)
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Sign in, open <strong>Learn</strong>, and start with the in-app <strong>Guide</strong> tab
            for the longest walkthrough. Below is a public summary of every practice feature — written
            for someone who has never traded before.
          </p>
          <div className="mt-6 space-y-4">
            {PRACTICE_TOOLS.map((tool) => (
              <article
                key={tool.title}
                className="rounded-xl border border-slate-200 bg-white/80 p-5"
              >
                <h3 className="text-sm font-semibold text-teal-800">{tool.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.body}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quick steps
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  {tool.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-600">
            Glossary tip: a <em>fill</em> is when a practice buy/sell is accepted at a price;{' '}
            <em>equity</em> is cash plus holdings; <em>bias</em> is whether a scanned pattern is tagged
            bullish, bearish, or neutral.
          </p>
        </section>
      </main>
    </div>
  )
}
