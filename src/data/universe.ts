import type { StockRaw } from './types'
import raw from './asxUniverse.json'

/** Full ASX listed companies universe (~2,000 equities) */
export const ASX_UNIVERSE = raw as StockRaw[]
export const ASX_UNIVERSE_COUNT = ASX_UNIVERSE.length
