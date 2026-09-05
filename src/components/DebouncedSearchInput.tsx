import { memo, useEffect, useState, type ChangeEvent } from 'react'
import { Search } from 'lucide-react'

type Props = {
  value: string
  onDebouncedChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
  inputClassName?: string
  'aria-label'?: string
}

/**
 * Local-state search box so keystrokes stay responsive while the parent
 * filters a large list on a short debounce.
 */
export const DebouncedSearchInput = memo(function DebouncedSearchInput({
  value,
  onDebouncedChange,
  placeholder = 'Search…',
  debounceMs = 200,
  className = 'relative min-w-[200px] flex-1',
  inputClassName = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500',
  'aria-label': ariaLabel,
}: Props) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  useEffect(() => {
    if (local === value) return
    const t = window.setTimeout(() => onDebouncedChange(local), debounceMs)
    return () => window.clearTimeout(t)
  }, [local, value, debounceMs, onDebouncedChange])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLocal(e.target.value)
  }

  return (
    <div className={className}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)]" />
      <input
        value={local}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClassName}
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  )
})
