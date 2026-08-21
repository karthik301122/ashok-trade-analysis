export function toTradingViewSymbol(ticker: string): string {
  return `ASX:${ticker}`
}

export async function copyTickersToTradingView(tickers: string[]): Promise<boolean> {
  const text = tickers.map(toTradingViewSymbol).join(',')
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
