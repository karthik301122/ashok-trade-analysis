import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onSignIn: () => void
}

export function MarketingLanding({ onSignIn }: Props) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-10%,#ccfbf1_0%,transparent_55%),radial-gradient(900px_500px_at_90%_0%,#e0f2fe_0%,transparent_50%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-slate-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">{APP_NAME}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {APP_TAGLINE}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
        >
          Sign in
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-14">
        <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          {APP_NAME}
        </p>
        <h1 className="mt-3 max-w-2xl text-xl font-medium text-slate-700 sm:text-2xl">
          See what the ASX is doing — sectors, breadth, and pattern setups on one desk.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600">
          Built for self-directed traders and training cohorts who need the same market picture,
          not a different answer in every browser tab.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSignIn}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Open the desk
          </button>
          <a
            href="/how"
            className="rounded-lg border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-white"
          >
            How it works
          </a>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
          <img
            src="/og-desk.png"
            alt="Traders Scope markets desk preview"
            className="w-full"
            width={1200}
            height={630}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {[
              ['Markets', 'Sector heat, rotation, and relative strength across the ASX.'],
              ['Breadth', 'Diffusion and participation so you know if moves are real.'],
              ['Patterns', 'Stage 2 and special setups computed once — identical for everyone.'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="text-sm font-semibold text-teal-800">{t}</div>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <section id="how" className="mt-14 max-w-2xl">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            Built for teaching and for solo desks
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Education firms get one shared scan of the day. Individuals get a fast, mobile-ready
            desk with watchlists and alerts that follow the account — not the laptop. Free accounts
            can explore Markets and Breadth; upgrade for Patterns, alerts, and full desk tools.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/50 px-4 py-8 text-center text-xs text-slate-500">
        <p>
          {APP_NAME} provides market information for education and research. It is not personal
          financial advice. Past pattern behaviour is not a guarantee of future results. Trading
          involves risk of loss.
        </p>
        <p className="mt-3 space-x-3">
          <a href="/terms" className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
            Terms of Use
          </a>
          <a href="/privacy" className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900">
            Privacy Policy
          </a>
        </p>
        <p className="mt-2">© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
      </footer>
    </div>
  )
}
