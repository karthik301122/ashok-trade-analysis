import { Moon, Sun, User } from 'lucide-react'

type Props = {
  dark: boolean
  onToggleDark: () => void
  page: 'sector' | 'breadth'
  onPage: (p: 'sector' | 'breadth') => void
}

export function Header({ dark, onToggleDark, page, onPage }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight">
              Ashok Trade Analysis
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
              ASX Market Desk
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => onPage('sector')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              page === 'sector'
                ? 'text-teal-700 underline decoration-2 underline-offset-8 dark:text-teal-300'
                : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            Sector Intelligence
          </button>
          <button
            type="button"
            onClick={() => onPage('breadth')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              page === 'breadth'
                ? 'text-teal-700 underline decoration-2 underline-offset-8 dark:text-teal-300'
                : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            Breadth Analysis
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle dark mode"
            onClick={onToggleDark}
            className="rounded-full p-2 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] py-1 pl-1 pr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
              AB
            </span>
            <span className="hidden text-sm sm:inline">Ashok Bhimaraju</span>
            <User size={14} className="text-[var(--color-ink-soft)] sm:hidden" />
          </div>
        </div>
      </div>
    </header>
  )
}
