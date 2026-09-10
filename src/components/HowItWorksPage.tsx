import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Props = {
  onBack: () => void
  onSignIn?: () => void
}

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
          scans are computed on the server so everyone sees the same picture.
        </p>

        <ol className="mt-10 space-y-6">
          {[
            [
              'Markets & breadth',
              'Sector heat, rotation, and participation — free for signed-in accounts so you can learn the layout.',
            ],
            [
              'Patterns & alerts',
              'Full pattern desk and email alerts unlock with an individual upgrade or a school seat.',
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
      </main>
    </div>
  )
}
