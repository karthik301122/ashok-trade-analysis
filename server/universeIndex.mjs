/** Breadth universes exposed in the UI (no separate Top 500). */
export const BREADTH_UNIVERSE_IDS = new Set(['asx200', 'mid', 'small'])

/**
 * Index line shown above breadth diffusion chart per universe.
 * @type {Record<string, { symbol: string, label: string, aliases: string[] }>}
 */
export const UNIVERSE_CHART_INDEX = {
  asx200: {
    symbol: '^AXJO',
    label: 'ASX 200',
    aliases: ['^AXJO', 'AXJO.INDX', 'XJO'],
  },
  mid: {
    symbol: '^AORD',
    label: 'All Ordinaries (XAO)',
    aliases: ['^AORD', 'AORD.INDX', 'XAO', 'AORD'],
  },
  small: {
    symbol: '^AXSO',
    label: 'S&P/ASX Small Ordinaries (AXSO)',
    aliases: ['^AXSO', 'AXSO.INDX', 'AXSO'],
  },
}

/**
 * @param {string} universeId
 */
export function universeChartIndex(universeId) {
  return UNIVERSE_CHART_INDEX[universeId] ?? UNIVERSE_CHART_INDEX.asx200
}
