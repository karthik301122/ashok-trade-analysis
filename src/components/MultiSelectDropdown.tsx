import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Props = {
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  emptyLabel?: string
  title?: string
  className?: string
}

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  emptyLabel = 'All',
  title,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const buttonLabel =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? value[0]
        : `${value.length} selected`

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt].sort((a, b) => a.localeCompare(b)))
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs font-medium text-[var(--color-ink)] hover:border-violet-400"
        title={title}
      >
        <span className="max-w-[140px] truncate">{buttonLabel}</span>
        <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[200px] max-h-[280px] overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full px-3 py-1.5 text-left text-[11px] font-semibold text-violet-700 hover:bg-[var(--color-muted)] dark:text-violet-300"
          >
            {emptyLabel}
          </button>
          {options.map((opt) => {
            const checked = value.includes(opt)
            return (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-ink)] hover:bg-[var(--color-muted)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt)}
                  className="rounded border-[var(--color-border)]"
                />
                <span className="truncate">{opt}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
