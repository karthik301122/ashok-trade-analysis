import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  Crosshair,
  Eraser,
  Layers,
  Magnet,
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

type SidebarGroupId = 'lines' | 'fib' | 'patterns' | 'forecast' | 'shapes' | 'text'

type SidebarGroup = {
  id: SidebarGroupId
  label: string
  icon: ReactNode
  categories: DrawToolCategoryId[]
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: 'lines',
    label: 'Trend lines',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    categories: ['lines', 'channels', 'pitchforks'],
  },
  {
    id: 'fib',
    label: 'Fibonacci & Gann',
    icon: <Layers className="h-3.5 w-3.5" />,
    categories: ['fibonacci', 'gann'],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    icon: <Square className="h-3.5 w-3.5 rotate-45" />,
    categories: ['patterns', 'elliott', 'cycles'],
  },
  {
    id: 'forecast',
    label: 'Forecast & measure',
    icon: <ArrowUp className="h-3.5 w-3.5" />,
    categories: ['forecasting', 'volume', 'measurers'],
  },
  {
    id: 'shapes',
    label: 'Brushes & shapes',
    icon: <Pencil className="h-3.5 w-3.5" />,
    categories: ['brushes', 'arrows', 'shapes'],
  },
  {
    id: 'text',
    label: 'Text & notes',
    icon: <Type className="h-3.5 w-3.5" />,
    categories: ['text'],
  },
]

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

function groupForTool(tool: ActiveDrawTool): SidebarGroupId | null {
  if (tool === 'cursor' || tool === 'eraser') return null
  const def = getDrawToolDef(tool)
  if (!def) return null
  return SIDEBAR_GROUPS.find((g) => g.categories.includes(def.category))?.id ?? null
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

const btn = (active: boolean) =>
  `flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
    active ? 'bg-teal-700 text-white' : 'hover:bg-[var(--color-muted)]'
  }`

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
  const [flyout, setFlyout] = useState<SidebarGroupId | null>(null)
  const activeGroup = groupForTool(activeTool)

  useEffect(() => {
    if (open && activeTool === 'cursor' && !flyout) setFlyout('lines')
  }, [open, activeTool, flyout])

  const flyoutSections = useMemo(() => {
    const group = SIDEBAR_GROUPS.find((g) => g.id === flyout)
    if (!group) return []
    return group.categories.map((catId) => ({
      id: catId,
      label: DRAW_TOOL_CATEGORIES.find((c) => c.id === catId)?.label ?? catId,
      tools: toolsForCategory(catId),
    }))
  }, [flyout])

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
    <div className="flex max-h-[calc(100%-0.5rem)] items-start gap-1">
      <div className="flex max-h-full w-9 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
        <div className="flex shrink-0 items-center justify-between gap-0.5 border-b border-[var(--color-border)] px-0.5 py-0.5">
          <span className="pl-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
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
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto overscroll-contain p-0.5 [scrollbar-width:thin]">
          <button
            type="button"
            title="Crosshair"
            onClick={() => {
              onSelectTool('cursor')
              setFlyout(null)
            }}
            className={btn(activeTool === 'cursor' && !flyout)}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <div className="my-0.5 h-px w-full shrink-0 bg-[var(--color-border)]" />
          {SIDEBAR_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              title={group.label}
              onClick={() => setFlyout(flyout === group.id ? null : group.id)}
              className={btn(flyout === group.id || (!flyout && activeGroup === group.id))}
            >
              {group.icon}
            </button>
          ))}
          <div className="my-0.5 h-px w-full shrink-0 bg-[var(--color-border)]" />
          <button
            type="button"
            title="Remove one drawing — click a line on the chart"
            onClick={() => {
              onSelectTool('eraser')
              setFlyout(null)
            }}
            className={btn(activeTool === 'eraser')}
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Clear all drawings"
            disabled={drawingCount === 0}
            onClick={() => {
              onClearAll()
              setFlyout(null)
            }}
            className={`${btn(false)} disabled:opacity-35`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={snapEnabled ? 'Snap on' : 'Snap off'}
            onClick={() => onSnapChange(!snapEnabled)}
            className={btn(snapEnabled)}
          >
            <Magnet className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {flyout && (
        <div className="max-h-full w-56 overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg [scrollbar-width:thin]">
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            {SIDEBAR_GROUPS.find((g) => g.id === flyout)?.label}
          </div>
          {flyoutSections.map((section) => (
            <div key={section.id}>
              {flyoutSections.length > 1 && (
                <div className="mt-1 border-t border-[var(--color-border)] px-3 pb-0.5 pt-1.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  {section.label}
                </div>
              )}
              {section.tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    onSelectTool(tool.id)
                    setFlyout(null)
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-[var(--color-muted)] ${
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
          ))}
        </div>
      )}

      {(helpText || pendingCount > 0) && (
        <div className="max-w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-[var(--color-ink-soft)] shadow-sm">
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
