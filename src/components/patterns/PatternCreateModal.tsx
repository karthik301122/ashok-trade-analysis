import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { PatternCategoryId } from '../../lib/patterns'
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { PatternCreatePanel } from './PatternCreatePanel'

type Props = {
  ticker: string
  name?: string
  mode?: 'create' | 'draw-save'
  initialDraw?: {
    tools: DrawnTool[]
    timeframe: 'daily' | 'weekly'
  }
  onClose: () => void
  onSaved?: (category: PatternCategoryId) => void
}

export function PatternCreateModal({
  ticker,
  name,
  mode = 'create',
  initialDraw,
  onClose,
  onSaved,
}: Props) {
  const drawSave = mode === 'draw-save' && initialDraw

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const modal = (
    <div
      className="fixed inset-0 z-[110] isolate flex flex-col bg-[var(--color-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label={drawSave ? 'Save drawn pattern' : 'Create my pattern'}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-teal-900 dark:text-teal-100">
            {drawSave ? 'Save drawn pattern' : 'Create my pattern'}
          </h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {ticker}
            {name ? ` · ${name}` : ''} · Private pattern on this device · scans full ASX when saved
          </p>
          {drawSave && (
            <p className="mt-0.5 text-[10px] text-teal-700 dark:text-teal-300">
              Lines from the chart will be saved as the scan rules.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-muted)]"
        >
          <X size={16} />
          Close
        </button>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <PatternCreatePanel
          variant="studio"
          ticker={ticker}
          drawTools={initialDraw?.tools ?? []}
          onDrawToolsChange={() => {}}
          drawTimeframe={initialDraw?.timeframe ?? 'daily'}
          onDrawTimeframeChange={() => {}}
          drawSaveMode={Boolean(drawSave)}
          onSaved={(category) => {
            onSaved?.(category)
            onClose()
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
