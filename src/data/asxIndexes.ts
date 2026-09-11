/** S&P/ASX indexes used by Index Analysis (EODHD `.INDX` symbols). */

export type AsxIndexKind = 'benchmark' | 'market' | 'sector'

export type AsxIndexDef = {
  /** App / series cache key */
  symbol: string
  /** Short ASX code shown in UI */
  code: string
  name: string
  kind: AsxIndexKind
}

/** Benchmark for relative strength. */
export const ASX_RS_BENCHMARK: AsxIndexDef = {
  symbol: '^AXJO',
  code: 'XJO',
  name: 'S&P/ASX 200',
  kind: 'benchmark',
}

/** Market-level indexes (weekly support & resistance focus). */
export const ASX_MARKET_INDEXES: AsxIndexDef[] = [
  ASX_RS_BENCHMARK,
  { symbol: '^AORD', code: 'XAO', name: 'S&P/ASX All Ordinaries', kind: 'market' },
  { symbol: '^AXSO', code: 'XSO', name: 'S&P/ASX Small Ordinaries', kind: 'market' },
]

/**
 * S&P/ASX 200 GICS sector indexes.
 * Symbols resolve to `{CODE}.INDX` via server EODHD mapping.
 */
export const ASX_SECTOR_INDEXES: AsxIndexDef[] = [
  { symbol: 'XEJ.INDX', code: 'XEJ', name: 'Energy', kind: 'sector' },
  { symbol: 'XMJ.INDX', code: 'XMJ', name: 'Materials', kind: 'sector' },
  { symbol: 'XNJ.INDX', code: 'XNJ', name: 'Industrials', kind: 'sector' },
  { symbol: 'XDJ.INDX', code: 'XDJ', name: 'Consumer Discretionary', kind: 'sector' },
  { symbol: 'XSJ.INDX', code: 'XSJ', name: 'Consumer Staples', kind: 'sector' },
  { symbol: 'XHJ.INDX', code: 'XHJ', name: 'Health Care', kind: 'sector' },
  { symbol: 'XFJ.INDX', code: 'XFJ', name: 'Financials', kind: 'sector' },
  { symbol: 'XXJ.INDX', code: 'XXJ', name: 'Financials ex-A-REIT', kind: 'sector' },
  { symbol: 'XIJ.INDX', code: 'XIJ', name: 'Information Technology', kind: 'sector' },
  { symbol: 'XTJ.INDX', code: 'XTJ', name: 'Communication Services', kind: 'sector' },
  { symbol: 'XUJ.INDX', code: 'XUJ', name: 'Utilities', kind: 'sector' },
  { symbol: 'XPJ.INDX', code: 'XPJ', name: 'A-REIT / Property', kind: 'sector' },
]

export const ASX_INDEX_ANALYSIS_UNIVERSE: AsxIndexDef[] = [
  ...ASX_MARKET_INDEXES,
  ...ASX_SECTOR_INDEXES,
]
