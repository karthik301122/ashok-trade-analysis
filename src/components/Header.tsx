import { LogOut, Moon, Sun, User } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '../lib/brand'

type Page = 'sector' | 'breadth' | 'alerts' | 'special-patterns'

type Props = {
  dark: boolean
  onToggleDark: () => void
  page: Page
  onPage: (p: Page) => void
  authRequired?: boolean
  user?: string | null
  onLogout?: () => void
}

const NAV: { id: Page; label: string }[] = [
  { id: 'sector', label: 'Markets' },
  { id: 'breadth', label: 'Breadth' },
  { id: 'special-patterns', label: 'Patterns' },
  { id: 'alerts', label: 'Alerts' },
]

export function Header({ dark, onToggleDark, page, onPage, authRequired, user, onLogout }: Props) {
  const showSession = Boolean(authRequired && user)
  const initials = user
    ? user
        .split(/[.\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || user.slice(0, 2).toUpperCase()
    : ''

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
        <button
          type="button"
          onClick={() => onPage('sector')}
          className="flex shrink-0 items-center gap-2.5 rounded-lg text-left transition hover:opacity-90"
        >
          <img src="/favicon.svg" alt="Traders Scope" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight">
              {APP_NAME}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-soft)]">
              {APP_TAGLINE}
            </div>
          </div>
        </button>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const active = page === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPage(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-600'
                    : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <nav className="flex items-center gap-0.5 sm:hidden">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPage(item.id)}
                aria-current={page === item.id ? 'page' : undefined}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                  page === item.id ? 'bg-teal-700 text-white' : 'text-[var(--color-ink-soft)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            aria-label={dark ? 'Light mode' : 'Dark mode'}
            onClick={onToggleDark}
            className="rounded-lg p-2 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {showSession && (
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] py-1 pl-1 pr-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="hidden max-w-[120px] truncate text-sm md:inline">{user}</span>
              <User size={14} className="text-[var(--color-ink-soft)] md:hidden" />
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  title="Sign out"
                  className="rounded-full p-1.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
                >
                  <LogOut size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
