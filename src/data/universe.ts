import type { StockRaw } from './types'
import raw from './asxUniverse.json'

/** Full ASX universe — equities, ETFs, funds, and other AU listings (EODHD) */
export const ASX_UNIVERSE = raw as StockRaw[]
export const ASX_UNIVERSE_COUNT = ASX_UNIVERSE.length
