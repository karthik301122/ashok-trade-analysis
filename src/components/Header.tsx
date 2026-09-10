import { useEffect, useRef, useState } from 'react'
import { LogOut, Menu, Moon, Sun, User, X } from 'lucide-react'
import { APP_NAME, APP_TAGLINE, getBrand } from '../lib/brand'
import type { AppPage } from '../lib/appPage'

type Props = {
  dark: boolean
  onToggleDark: () => void
  page: AppPage
  onPage: (p: AppPage) => void
  authRequired?: boolean
  user?: string | null
  /** Prefer showing this in the header chip (falls back to login email/username). */
  displayName?: string | null
  onLogout?: () => void
  /** Paid org seat or individual subscription unlocks Patterns / Alerts. */
  fullDeskAccess?: boolean
  onUpgrade?: () => void
}

const NAV: { id: AppPage; label: string; short: string; requiresFullDesk?: boolean }[] = [
  { id: 'sector', label: 'Markets', short: 'Mkt' },
  { id: 'breadth', label: 'Breadth', short: 'Brd' },
  { id: 'special-patterns', label: 'Patterns', short: 'Pat', requiresFullDesk: true },
  { id: 'create-pattern', label: 'Create pattern', short: 'Create', requiresFullDesk: true },
  { id: 'alerts', label: 'Alerts', short: 'Alert', requiresFullDesk: true },
]

function labelInitials(label: string) {
  return (
    label
      .split(/[.@\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || label.slice(0, 2).toUpperCase()
  )
}

export function Header({
  dark,
  onToggleDark,
  page,
  onPage,
  authRequired,
  user,
  displayName,
  onLogout,
  fullDeskAccess = true,
  onUpgrade,
}: Props) {
  const showSession = Boolean(authRequired && user)
  const label = (displayName?.trim() || user || '').trim()
  const initials = label ? labelInitials(label) : ''
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const brand = getBrand()
  const logoSrc = brand.logoUrl?.trim() || '/favicon.svg'

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [page])

  const navItems = NAV.filter((item) => fullDeskAccess || !item.requiresFullDesk)

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:gap-4 sm:px-4">
        <button
          type="button"
          onClick={() => onPage('sector')}
          className="flex min-w-0 shrink items-center gap-2 rounded-lg text-left transition hover:opacity-90 sm:gap-2.5"
        >
          <img src={logoSrc} alt={brand.name} className="h-8 w-8 shrink-0 rounded-lg object-contain sm:h-9 sm:w-9" />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-tight sm:text-[15px]">
              {brand.name}
            </div>
            <div className="hidden text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-soft)] sm:block">
              {brand.poweredBy ? `Powered by ${APP_NAME}` : brand.tagline || APP_TAGLINE}
            </div>
          </div>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
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

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {!fullDeskAccess && onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              className="rounded-lg border border-teal-600 px-2.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:text-teal-200 dark:hover:bg-teal-950/40 sm:text-sm"
            >
              Upgrade
            </button>
          )}
          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-lg p-2 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
                {navItems.map((item) => {
                  const active = page === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onPage(item.id)
                        setMenuOpen(false)
                      }}
                      className={`flex w-full items-center px-3 py-2.5 text-left text-sm font-medium ${
                        active
                          ? 'bg-teal-700 text-white'
                          : 'text-[var(--color-ink)] hover:bg-[var(--color-muted)]'
                      }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
                {!fullDeskAccess && onUpgrade && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpgrade()
                      setMenuOpen(false)
                    }}
                    className="flex w-full items-center px-3 py-2.5 text-left text-sm font-semibold text-teal-800 dark:text-teal-200"
                  >
                    Upgrade desk
                  </button>
                )}
              </div>
            )}
          </div>
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
              <button
                type="button"
                onClick={() => onPage('profile')}
                title={user ? `Profile · ${user}` : 'View profile'}
                aria-current={page === 'profile' ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1 transition hover:bg-[var(--color-muted)] ${
                  page === 'profile' ? 'bg-[var(--color-muted)]' : ''
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden max-w-[140px] truncate text-sm lg:inline">{label}</span>
                <User size={14} className="text-[var(--color-ink-soft)] lg:hidden" />
              </button>
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
