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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${ticker} chart`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold hover:border-sky-400"
            >
              <ExternalLink size={14} />
              Open in TradingView
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--color-border)] p-2 hover:bg-[var(--color-muted)]"
              aria-label="Close chart"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          <TradingViewChart ticker={ticker} height={560} />
        </div>
      </div>
    </div>
  )
}
