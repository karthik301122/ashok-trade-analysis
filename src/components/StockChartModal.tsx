import { ExternalLink, X } from 'lucide-react'
import { toTradingViewSymbol } from '../lib/tradingview'
import { TradingViewChart } from './TradingViewChart'

type Props = {
  ticker: string
  name?: string
  onClose: () => void
}

export function StockChartModal({ ticker, name, onClose }: Props) {
  const symbol = toTradingViewSymbol(ticker)
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${ticker} chart`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
            {ticker}
            {name ? <span className="ml-2 text-sm font-medium text-[var(--color-ink-soft)]">{name}</span> : null}
          </h2>
          <p className="text-xs text-[var(--color-ink-soft)]">{symbol} · TradingView chart</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={tvUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-semibold hover:border-sky-400"
          >
            <ExternalLink size={14} />
            Open in TradingView
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-muted)]"
            aria-label="Close chart"
          >
            <span className="inline-flex items-center gap-1">
              <X size={16} />
              Close
            </span>
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TradingViewChart ticker={ticker} fill />
      </div>
    </div>
  )
}
