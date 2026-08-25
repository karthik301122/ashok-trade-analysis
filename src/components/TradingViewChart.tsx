import { useEffect, useId, useRef } from 'react'
import { toTradingViewSymbol } from '../lib/tradingview'

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => unknown
    }
  }
}

let tvScriptPromise: Promise<void> | null = null

function loadTradingViewScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve()
  if (tvScriptPromise) return tvScriptPromise
  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tv-widget]')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('TradingView script failed')))
      if (window.TradingView) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.dataset.tvWidget = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('TradingView script failed'))
    document.head.appendChild(script)
  })
  return tvScriptPromise
}

type Props = {
  ticker: string
  height?: number
}

export function TradingViewChart({ ticker, height = 560 }: Props) {
  const reactId = useId().replace(/:/g, '')
  const containerId = `tv_${ticker}_${reactId}`
  const hostRef = useRef<HTMLDivElement>(null)
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    host.innerHTML = ''
    const mount = document.createElement('div')
    mount.id = containerId
    mount.style.height = `${height}px`
    mount.style.width = '100%'
    host.appendChild(mount)

    ;(async () => {
      try {
        await loadTradingViewScript()
        if (cancelled || !window.TradingView) return
        new window.TradingView.widget({
          autosize: true,
          symbol: toTradingViewSymbol(ticker),
          interval: 'D',
          timezone: 'Australia/Sydney',
          theme: dark ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          toolbar_bg: dark ? '#1e1e1e' : '#f1f3f6',
          enable_publishing: false,
          allow_symbol_change: true,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerId,
          studies: ['Volume@tv-basicstudies'],
        })
      } catch {
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML =
            '<p class="p-6 text-sm text-rose-600">Could not load TradingView chart. Check your network.</p>'
        }
      }
    })()

    return () => {
      cancelled = true
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [ticker, containerId, height, dark])

  return (
    <div className="tradingview-widget-container w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div ref={hostRef} style={{ height }} />
    </div>
  )
}
