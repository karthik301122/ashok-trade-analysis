import { APP_NAME } from '../lib/brand'
import { PRIVACY_SECTIONS, TERMS_SECTIONS, LEGAL_LAST_UPDATED } from '../lib/legalDocs'

type Kind = 'terms' | 'privacy'

type Props = {
  kind: Kind
  onBack: () => void
  onOpenOther: (kind: Kind) => void
}

export function LegalDocumentPage({ kind, onBack, onOpenOther }: Props) {
  const title = kind === 'terms' ? 'Terms of Use' : 'Privacy Policy'
  const sections = kind === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS
  const other: Kind = kind === 'terms' ? 'privacy' : 'terms'
  const otherLabel = kind === 'terms' ? 'Privacy Policy' : 'Terms of Use'

  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_500px_at_0%_0%,#ccfbf1_0%,transparent_50%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-slate-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="font-[family-name:var(--font-display)] text-base font-semibold">
            {APP_NAME}
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-white"
        >
          Back
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Last updated: {LEGAL_LAST_UPDATED}. These documents apply to {APP_NAME} at{' '}
          <a className="underline decoration-slate-400 underline-offset-2" href="https://tradersscope.com/">
            tradersscope.com
          </a>
          .
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-slate-700">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">
                {section.heading}
              </h2>
              {section.paragraphs.map((p) => (
                <p key={p.slice(0, 48)} className="mt-2">
                  {p}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {section.bullets.map((b) => (
                    <li key={b.slice(0, 48)}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-10 text-sm text-slate-600">
          Also see our{' '}
          <button
            type="button"
            className="font-semibold text-teal-800 underline underline-offset-2"
            onClick={() => onOpenOther(other)}
          >
            {otherLabel}
          </button>
          .
        </p>
      </main>
    </div>
  )
}
