import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  Crosshair,
  Eraser,
  Layers,
  Minus,
  Pencil,
  Square,
  Trash2,
  TrendingUp,
  Type,
  X,
} from 'lucide-react'
import {
  DRAW_TOOL_CATEGORIES,
  getDrawToolDef,
  toolsForCategory,
  type DrawToolCategoryId,
  type DrawnToolType,
} from '../../lib/patterns/drawToolCatalog'

export type ActiveDrawTool = 'cursor' | 'eraser' | DrawnToolType

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTool: ActiveDrawTool
  onSelectTool: (tool: ActiveDrawTool) => void
  snapEnabled: boolean
  onSnapChange: (v: boolean) => void
  pendingCount: number
  helpText: string
  drawingCount: number
  onClearAll: () => void
}

const CATEGORY_ICONS: Record<DrawToolCategoryId, ReactNode> = {
  lines: <TrendingUp className="h-4 w-4" />,
  channels: <Minus className="h-4 w-4 rotate-90" />,
  pitchforks: <TrendingUp className="h-4 w-4 -rotate-45" />,
  fibonacci: <Layers className="h-4 w-4" />,
  gann: <Square className="h-4 w-4" />,
  patterns: <Square className="h-4 w-4 rotate-45" />,
  elliott: <TrendingUp className="h-4 w-4" />,
  cycles: <Minus className="h-4 w-4" />,
  forecasting: <ArrowUp className="h-4 w-4" />,
  volume: <Layers className="h-4 w-4" />,
  measurers: <Minus className="h-4 w-4" />,
  brushes: <Pencil className="h-4 w-4" />,
  arrows: <ArrowUp className="h-4 w-4" />,
  shapes: <Square className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
}

export function helpForDrawTool(active: ActiveDrawTool, pending: number): string {
  if (active === 'cursor') return 'Crosshair — pan and zoom the chart.'
  if (active === 'eraser') return 'Click a drawing to remove it.'
  const def = getDrawToolDef(active)
  if (!def) return 'Select a drawing tool.'
  if (def.clickCount === -1) {
    if (def.kind === 'brush') return 'Drag to draw. Release to finish.'
    return 'Click to add points. Double-click or Enter to finish.'
  }
  if (def.clickCount === 1) return `Click once on the chart to place ${def.label.toLowerCase()}.`
  if (pending > 0) {
    return `Point ${pending} placed — click point ${pending + 1} of ${def.clickCount} on the chart.`
  }
  return `Click ${def.clickCount} points on the chart for ${def.label.toLowerCase()}.`
}

export function PatternDrawToolbar({
  open,
  onOpenChange,
  activeTool,
  onSelectTool,
  snapEnabled,
  onSnapChange,
  pendingCount,
  helpText,
  drawingCount,
  onClearAll,
}: Props) {
  const [flyout, setFlyout] = useState<DrawToolCategoryId | null>(null)

  useEffect(() => {
    if (open && activeTool === 'cursor') setFlyout('lines')
  }, [open, activeTool])

  if (!open) {
    return (
      <button
        type="button"
        title="Draw tools"
        onClick={() => onOpenChange(true)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 shadow-md transition-colors hover:bg-[var(--color-muted)] text-teal-700 dark:text-teal-300"
      >
        <Pencil className="h-4 w-4" />
        <span className="text-[10px] font-bold uppercase tracking-wide">Draw</span>
      </button>
    )
  }

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-md">
        <div className="flex items-center justify-between gap-1 px-0.5 pb-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Draw
          </span>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false)
              setFlyout(null)
            }}
            className="rounded p-0.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          title="Crosshair"
          onClick={() => {
            onSelectTool('cursor')
            setFlyout(null)
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-md ${
            activeTool === 'cursor' ? 'bg-teal-700 text-white' : 'hover:bg-[var(--color-muted)]'
          }`}
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <div className="my-0.5 h-px bg-[var(--color-border)]" />
        {DRAW_TOOL_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            title={cat.label}
            onClick={() => setFlyout(flyout === cat.id ? null : cat.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-md ${
              flyout === cat.id ? 'bg-teal-700 text-white' : 'hover:bg-[var(--color-muted)]'
            }`}
          >
            {CATEGORY_ICONS[cat.id]}
          </button>
        ))}
        <div className="my-0.5 h-px bg-[var(--color-border)]" />
        <button
          type="button"
          title="Remove one drawing — click a line on the chart"
          onClick={() => {
            onSelectTool('eraser')
            setFlyout(null)
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-md ${
            activeTool === 'eraser' ? 'bg-teal-700 text-white' : 'hover:bg-[var(--color-muted)]'
          }`}
        >
          <Eraser className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Clear all drawings"
          disabled={drawingCount === 0}
          onClick={() => {
            onClearAll()
            setFlyout(null)
          }}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--color-muted)] disabled:opacity-35"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <label
          className="mt-0.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
        >
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => onSnapChange(e.target.checked)}
          />
          Snap
        </label>
      </div>

      {flyout && (
        <div className="max-h-[min(70vh,520px)] w-56 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            {DRAW_TOOL_CATEGORIES.find((c) => c.id === flyout)?.label}
          </div>
          {toolsForCategory(flyout).map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                onSelectTool(tool.id)
                setFlyout(null)
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--color-muted)] ${
                activeTool === tool.id
                  ? 'bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100'
                  : ''
              }`}
            >
              <span>{tool.label}</span>
              {tool.shortcut && (
                <span className="text-[10px] text-[var(--color-ink-soft)]">{tool.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {(helpText || pendingCount > 0) && (
        <div className="max-w-[220px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-[var(--color-ink-soft)] shadow-sm">
          {helpText}
          {pendingCount > 0 && (
            <span className="mt-0.5 block font-mono text-[9px]">
              {pendingCount} point{pendingCount === 1 ? '' : 's'} · Esc cancel · Enter finish
            </span>
          )}
        </div>
      )}
    </div>
  )
}
