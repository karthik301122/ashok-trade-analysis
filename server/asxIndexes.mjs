/** S&P/ASX indexes for Index Analysis (EODHD uses A{code}.INDX). */

export const ASX_RS_BENCHMARK = {
  symbol: '^AXJO',
  code: 'XJO',
  name: 'S&P/ASX 200',
  kind: 'benchmark',
}

export const ASX_MARKET_INDEXES = [
  ASX_RS_BENCHMARK,
  { symbol: '^AORD', code: 'XAO', name: 'S&P/ASX All Ordinaries', kind: 'market' },
  { symbol: '^AXSO', code: 'XSO', name: 'S&P/ASX Small Ordinaries', kind: 'market' },
]

export const ASX_SECTOR_INDEXES = [
  { symbol: '^AXEJ', code: 'XEJ', name: 'Energy', kind: 'sector' },
  { symbol: '^AXMJ', code: 'XMJ', name: 'Materials', kind: 'sector' },
  { symbol: '^AXNJ', code: 'XNJ', name: 'Industrials', kind: 'sector' },
  { symbol: '^AXDJ', code: 'XDJ', name: 'Consumer Discretionary', kind: 'sector' },
  { symbol: '^AXSJ', code: 'XSJ', name: 'Consumer Staples', kind: 'sector' },
  { symbol: '^AXHJ', code: 'XHJ', name: 'Health Care', kind: 'sector' },
  { symbol: '^AXFJ', code: 'XFJ', name: 'Financials', kind: 'sector' },
  { symbol: '^AXXJ', code: 'XXJ', name: 'Financials ex-A-REIT', kind: 'sector' },
  { symbol: '^AXIJ', code: 'XIJ', name: 'Information Technology', kind: 'sector' },
  { symbol: '^AXTJ', code: 'XTJ', name: 'Communication Services', kind: 'sector' },
  { symbol: '^AXUJ', code: 'XUJ', name: 'Utilities', kind: 'sector' },
  { symbol: '^AXPJ', code: 'XPJ', name: 'A-REIT / Property', kind: 'sector' },
]

export const ASX_INDEX_ANALYSIS_UNIVERSE = [...ASX_MARKET_INDEXES, ...ASX_SECTOR_INDEXES]

export function isAsxIndexSeriesTicker(ticker) {
  const t = String(ticker || '').toUpperCase()
  if (t === '^AXJO' || t === '^AORD' || t === '^AXSO') return true
  if (/^\^A(XEJ|XMJ|XNJ|XDJ|XSJ|XHJ|XFJ|XXJ|XIJ|XTJ|XUJ|XPJ|XRE)$/.test(t)) return true
  if (/^A(XJO|ORD|XSO|XEJ|XMJ|XNJ|XDJ|XSJ|XHJ|XFJ|XXJ|XIJ|XTJ|XUJ|XPJ|XRE)\.INDX$/.test(t)) {
    return true
  }
  return false
}
