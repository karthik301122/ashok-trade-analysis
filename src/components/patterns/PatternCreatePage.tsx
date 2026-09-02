import { useState } from 'react'
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { PatternCreatePanel } from './PatternCreatePanel'

export function PatternCreatePage() {
  const [drawTools, setDrawTools] = useState<DrawnTool[]>([])
  const [drawTimeframe, setDrawTimeframe] = useState<'daily' | 'weekly'>('daily')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight md:text-3xl">
          Create my pattern
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Private patterns saved on this device. Use rules, candle shapes, or scan script — or draw
          levels on a stock chart and save from there.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
        <PatternCreatePanel
          variant="page"
          drawTools={drawTools}
          onDrawToolsChange={setDrawTools}
          drawTimeframe={drawTimeframe}
          onDrawTimeframeChange={setDrawTimeframe}
        />
      </div>
    </div>
  )
}
