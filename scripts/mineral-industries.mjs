/**
 * Commodity industries for ASX miners — exactly one industry per stock.
 * Priority: industrial → diversified → uranium → lithium → rare earths →
 * copper → silver → nickel → iron → specialty → gold → Other Mining.
 */

export const MINERAL_INDUSTRIES = {
  GOLD: 'Gold Miners',
  SILVER: 'Silver Miners',
  COPPER: 'Copper Miners',
  RARE_EARTHS: 'Rare Earths',
  URANIUM: 'Uranium',
  LITHIUM: 'Lithium & Battery Metals',
  NICKEL: 'Nickel Miners',
  IRON: 'Iron Ore',
  DIVERSIFIED: 'Diversified Miners',
  INDUSTRIAL: 'Industrial Materials',
  SPECIALTY: 'Specialty Metals',
  OTHER: 'Other Mining',
}

const I = MINERAL_INDUSTRIES
const NEM = 'Non-Energy Minerals'

function set(...tickers) {
  return new Set(tickers.map((t) => t.toUpperCase()))
}

const DIVERSIFIED = set('BHP', 'RIO', 'S32', 'ATM', 'ADT')

const INDUSTRIAL = set(
  'AMC',
  'JHX',
  'ORI',
  'DNL',
  'BSL',
  'SGM',
  'ORA',
  'DRR',
  'A4N',
  'IMD',
  'PRN',
  'MAH',
  'GNG',
  'WGN',
  'NUF',
  'CAA',
  'DGL',
  'TTT',
  'VYS',
  'BLY',
)

const URANIUM = set(
  'PDN',
  'BOE',
  'DYL',
  'BMN',
  'PEN',
  'AGE',
  'NXG',
  'TOE',
  'EL8',
  'BKY',
  'LOT',
  'DEV',
  'GTR',
  'EME',
  'CXU',
  'AEE',
  'ERA',
  'LAM',
  'VMY',
  'MEU',
  'ACB',
  'MEY',
  'UVA',
  'GUE',
  'NHU',
  'AMU',
  '1AE',
  'T92',
  'ORP',
  'EPM',
  'ADD',
  'MHC',
  'ZEU',
  '92E',
  'LRM',
)

const LITHIUM = set(
  'PLS',
  'LTR',
  'MIN',
  'CXO',
  'PMT',
  'VUL',
  'LRS',
  'ELV',
  'GLN',
  'LKE',
  'EUR',
  'INR',
  'SYA',
  'AZL',
  'LPI',
  'PLL',
  'WR1',
  'WC8',
  'ASN',
  'JRL',
  'PLN',
  'EMH',
  'LIS',
  'PSC',
  'TKM',
  'NMT',
  'AGY',
)

const RARE_EARTHS = set(
  'LYC',
  'ILU',
  'ARU',
  'NTU',
  'HAS',
  'IXR',
  'VMM',
  'MEI',
  'LIN',
  'PEK',
  'ARR',
  'AR3',
  'HRE',
  'BRE',
  'GGG',
  'CRI',
)

const COPPER = set(
  'CSC',
  'SFR',
  'AIS',
  'HCH',
  'WA1',
  'CBE',
  'MC2',
  'C6C',
  'GRX',
  'A1M',
  '29M',
  'AGC',
  'AMI',
  'HAV',
  'JBY',
  'KCC',
  'ALM',
  'REC',
  'HRR',
  'NRX',
  'OZL',
  'KGL',
  'VXR',
  'SUM',
)

const SILVER = set('SVL', 'USL', 'SVM', 'IVR', 'MTH')

const NICKEL = set('NIC', 'IGO', 'MCR', 'PAN', 'CTM', 'SGQ', 'CHN', 'AZS', 'POS')

const IRON = set('FMG', 'CIA', 'MGX', 'GRR', 'RHI', 'BCK', 'FEX', 'BCI', 'MDX', 'CLE', 'GEN')

const SPECIALTY = set(
  'AAI',
  'SYR',
  'TLG',
  'QGL',
  'RNU',
  'EGR',
  'BUX',
  'AVL',
  'TMT',
  'TVN',
  'VS8',
  'TNG',
  'IPX',
  'AII',
  'MLX',
  'OMH',
  'JMS',
  'MMI',
  'CAY',
  'SMR',
  'CRN',
  'BRL',
  'ZIM',
  'SPD',
  'DVP',
  'LRV',
  'NVA',
  'MTM',
  'NMR',
  'GGP',
)

const GOLD_RAW = set(
  'NEM',
  'NST',
  'EVN',
  'NCM',
  'AGG',
  'DPM',
  'PRU',
  'RMS',
  'VAU',
  'DEG',
  'RRL',
  'WGX',
  'EMR',
  'WAF',
  'PDI',
  'GOR',
  'SSR',
  'SX2',
  'SPR',
  'AQG',
  'OBM',
  'RSG',
  'RED',
  'BGL',
  'ALK',
  'RXR',
  'CYL',
  'OGC',
  'SLR',
  'KCN',
  'WIA',
  'BC8',
  'TIE',
  'SXG',
  'SBM',
  'TCG',
  'AUC',
  'CDV',
  'FML',
  'SMI',
  'BTR',
  'DTR',
  'TOK',
  'DCN',
  'BCN',
  'MEK',
  'PC2',
  'TRE',
  'BM1',
  'POL',
  'TBR',
  'AAR',
  'STN',
  'ORR',
  'BGD',
  'AQI',
  'TM1',
  'HRZ',
  'TGM',
  'GG8',
  'ARX',
  'ERM',
  'ORN',
  'DGO',
  'TTM',
  'WWI',
  'HRN',
  'CY5',
  'GML',
  'AUT',
  'TSO',
  'BRB',
  'BDC',
  'GBR',
  'LLO',
  'TAM',
  'TOR',
  'GBZ',
  'FAL',
  'X64',
  'KAU',
  'DLI',
  'FXG',
  'RND',
  'LRL',
  'TUL',
  'PGL',
  'MMC',
  'ARL',
  'KGD',
  'CAI',
  'GBM',
  'GHM',
  'BRV',
  'AWV',
  'NWF',
  'PGO',
  'EMP',
  'NUS',
  'TRY',
  'OKU',
  'AA2',
  'HMX',
  'AME',
  'BSX',
  'SNM',
  'GME',
  'WCN',
  'YRL',
  'AUN',
  'TNR',
  'SNX',
  'MSR',
  'ARI',
  'MAT',
  'AGS',
  'FFR',
  'AWJ',
  'ORD',
  'ZAG',
  'SFM',
  'HMG',
  'SIH',
  'DGR',
  'CTO',
  'LNY',
  'BEZ',
  'E2M',
  'SMG',
  'ADN',
  'ARS',
  'UM1',
  'G11',
  'KNB',
  'NVO',
  'WGR',
  'NXM',
  'HAW',
  'BDG',
  'ANL',
  'VEC',
  'OZM',
  'WMG',
  'AYR',
  'SHK',
  'TAR',
  'VKA',
  'GDM',
  'OKR',
  'ONX',
  'GMN',
  'CGN',
  'DSM',
  'RGL',
  'PRX',
  'MVL',
  'MRZ',
  'GNM',
  'BBX',
  'DAU',
  'ARE',
  'KRM',
  'ORM',
  'GMD',
  'CMM',
  'PNR',
  'FFM',
  'MAU',
  'MM8',
  'AZY',
  'RXL',
  'AAU',
  'ADG',
  'AGD',
  'DMG',
  'E79',
  'FEG',
  'CEL',
  'A1G',
  'NMG',
  'VAL',
  'OAU',
  'MI6',
  'STK',
  'ENR',
  'BNZ',
  'SLS',
  'WA8',
  'FRS',
  'EM3',
  'GA8',
  '4CE',
  'FFX',
  'GWR',
  'BSR',
)

const PRIORITY = [
  [DIVERSIFIED, I.DIVERSIFIED],
  [INDUSTRIAL, I.INDUSTRIAL],
  [URANIUM, I.URANIUM],
  [LITHIUM, I.LITHIUM],
  [RARE_EARTHS, I.RARE_EARTHS],
  [COPPER, I.COPPER],
  [SILVER, I.SILVER],
  [NICKEL, I.NICKEL],
  [IRON, I.IRON],
  [SPECIALTY, I.SPECIALTY],
]

const claimed = new Set()
for (const [s] of PRIORITY) for (const t of s) claimed.add(t)
const GOLD = new Set([...GOLD_RAW].filter((t) => !claimed.has(t)))

const KEYWORD_RULES = [
  { industry: I.URANIUM, re: /\bURANIUM\b|\bURAN\b/ },
  { industry: I.RARE_EARTHS, re: /RARE\s*EARTH|\bREE\b|MINERAL\s*SAND/ },
  { industry: I.LITHIUM, re: /\bLITHIUM\b|BATTERY\s*METAL|SPODUMENE/ },
  { industry: I.SILVER, re: /\bSILVER\b/ },
  { industry: I.COPPER, re: /\bCOPPER\b/ },
  { industry: I.NICKEL, re: /\bNICKEL\b/ },
  { industry: I.IRON, re: /\bIRON\s*ORE\b|\bIRON\b/ },
  {
    industry: I.SPECIALTY,
    re: /\bGRAPHITE\b|\bVANADIUM\b|\bTUNGSTEN\b|\bALUMINI|\bBAUXITE\b|\bMANGANESE\b|\bTIN\b|\bZINC\b|\bLEAD\b|\bANTIMONY\b|\bCOBALT\b|\bTITANIUM\b|\bPALLADIUM\b|\bPLATINUM\b|\bPOTASH\b|\bCOAL\b|\bSILICA\b/,
  },
  {
    industry: I.INDUSTRIAL,
    re: /\bSTEEL\b|\bPACKAG|\bCEMENT\b|\bHARDIE\b|\bAMCOR\b|\bORICA\b|\bDYNO\b|\bEXPLOSIVE/,
  },
  { industry: I.GOLD, re: /\bGOLD\b|\bGOLDEN\b/ },
]

function pack(industry, sector) {
  if (industry === I.URANIUM) return { sector: NEM, industry }
  // Keep mineral commodity desk under Non-Energy Minerals
  if (sector === 'Energy Minerals') return { sector: NEM, industry }
  return { sector, industry }
}

/**
 * @param {{ ticker: string, name: string, sector: string }} stock
 * @returns {{ sector: string, industry: string } | null}
 */
export function classifyMineral(stock) {
  const ticker = String(stock.ticker || '').toUpperCase()
  const name = String(stock.name || '').toUpperCase()
  const sector = stock.sector

  for (const [tickers, industry] of PRIORITY) {
    if (tickers.has(ticker)) return pack(industry, sector)
  }
  if (GOLD.has(ticker)) return pack(I.GOLD, sector)

  for (const rule of KEYWORD_RULES) {
    if (!rule.re.test(name)) continue
    if (sector === NEM) return pack(rule.industry, sector)
    if (sector === 'Energy Minerals' && (rule.industry === I.URANIUM || rule.industry === I.SPECIALTY)) {
      return pack(rule.industry, sector)
    }
  }

  if (sector !== NEM && !Object.values(MINERAL_INDUSTRIES).includes(stock.industry)) {
    return null
  }

  // Single catch-all for remaining Non-Energy Minerals
  if (sector === NEM || Object.values(MINERAL_INDUSTRIES).includes(stock.industry)) {
    return { sector: NEM, industry: I.OTHER }
  }

  return null
}

export function shouldReclassify(stock) {
  const t = String(stock.ticker || '').toUpperCase()
  if (stock.sector === NEM) return true
  if (Object.values(MINERAL_INDUSTRIES).includes(stock.industry)) return true
  if (URANIUM.has(t) || LITHIUM.has(t) || GOLD.has(t) || COPPER.has(t)) return true
  if (INDUSTRIAL.has(t) || SPECIALTY.has(t) || IRON.has(t) || NICKEL.has(t)) return true
  if (DIVERSIFIED.has(t) || RARE_EARTHS.has(t) || SILVER.has(t)) return true
  return false
}
