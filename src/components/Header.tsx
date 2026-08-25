import { LogOut, Moon, Sun, User } from 'lucide-react'

type Props = {
  dark: boolean
  onToggleDark: () => void
  page: 'sector' | 'breadth' | 'alerts'
  onPage: (p: 'sector' | 'breadth' | 'alerts') => void
  user?: string | null
  onLogout?: () => void
}

export function Header({ dark, onToggleDark, page, onPage, user, onLogout }: Props) {
  const initials = user
    ? user
        .split(/[.\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || user.slice(0, 2).toUpperCase()
    : 'AB'

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
          <button
            type="button"
            onClick={() => onPage('alerts')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              page === 'alerts'
                ? 'text-teal-700 underline decoration-2 underline-offset-8 dark:text-teal-300'
                : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
            }`}
          >
            Alerts
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
            onClick={onToggleDark}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] py-1 pl-1 pr-2 sm:pr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
              {initials}
            </span>
            <span className="hidden max-w-[140px] truncate text-sm sm:inline">
              {user || 'Ashok Bhimaraju'}
            </span>
            <User size={14} className="text-[var(--color-ink-soft)] sm:hidden" />
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign out"
                className="ml-0.5 rounded-full p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
