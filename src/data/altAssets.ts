export type AltAsset = {
  symbol: string
  name: string
  group: string
  /** Symbol passed to /api/series (EODHD). Use CMDTY:CODE for FRED commodities. */
  eodhd: string
  tradingView: string
}

/**
 * Commodities via EODHD:
 * - Precious metals → FOREX (LBMA spot series removed from FRED)
 * - Energy / ag / industrial metals → FRED commodities API (CMDTY:)
 */
export const COMMODITIES: AltAsset[] = [
  { symbol: 'GOLD', name: 'Gold', group: 'Precious Metals', eodhd: 'XAUUSD.FOREX', tradingView: 'COMEX:GC1!' },
  { symbol: 'SILVER', name: 'Silver', group: 'Precious Metals', eodhd: 'XAGUSD.FOREX', tradingView: 'COMEX:SI1!' },
  { symbol: 'PLATINUM', name: 'Platinum', group: 'Precious Metals', eodhd: 'XPTUSD.FOREX', tradingView: 'NYMEX:PL1!' },
  { symbol: 'PALLADIUM', name: 'Palladium', group: 'Precious Metals', eodhd: 'XPDUSD.FOREX', tradingView: 'NYMEX:PA1!' },
  { symbol: 'COPPER', name: 'Copper', group: 'Industrial Metals', eodhd: 'CMDTY:COPPER', tradingView: 'COMEX:HG1!' },
  { symbol: 'ALUMINIUM', name: 'Aluminium', group: 'Industrial Metals', eodhd: 'CMDTY:ALUMINUM', tradingView: 'COMEX:ALI1!' },
  { symbol: 'COAL', name: 'Coal (AU thermal)', group: 'Bulk', eodhd: 'CMDTY:COAL_AU', tradingView: 'SGX:FEF1!' },
  { symbol: 'WTI', name: 'Crude Oil WTI', group: 'Energy', eodhd: 'CMDTY:WTI', tradingView: 'NYMEX:CL1!' },
  { symbol: 'BRENT', name: 'Brent Crude', group: 'Energy', eodhd: 'CMDTY:BRENT', tradingView: 'NYMEX:BB1!' },
  { symbol: 'NATGAS', name: 'Natural Gas', group: 'Energy', eodhd: 'CMDTY:NATURAL_GAS', tradingView: 'NYMEX:NG1!' },
  { symbol: 'GASOLINE', name: 'US Gasoline', group: 'Energy', eodhd: 'CMDTY:GASOLINE_US', tradingView: 'NYMEX:RB1!' },
  { symbol: 'HEATOIL', name: 'Heating Oil', group: 'Energy', eodhd: 'CMDTY:HEATING_OIL_NYH', tradingView: 'NYMEX:HO1!' },
  { symbol: 'CORN', name: 'Corn', group: 'Agriculture', eodhd: 'CMDTY:CORN', tradingView: 'CBOT:ZC1!' },
  { symbol: 'WHEAT', name: 'Wheat', group: 'Agriculture', eodhd: 'CMDTY:WHEAT', tradingView: 'CBOT:ZW1!' },
  { symbol: 'SUGAR', name: 'Sugar', group: 'Agriculture', eodhd: 'CMDTY:SUGAR', tradingView: 'ICEUS:SB1!' },
  { symbol: 'COFFEE', name: 'Coffee (Arabica)', group: 'Agriculture', eodhd: 'CMDTY:COFFEE_MILD_ARABICA', tradingView: 'ICEUS:KC1!' },
  { symbol: 'COTTON', name: 'Cotton', group: 'Agriculture', eodhd: 'CMDTY:COTTON', tradingView: 'ICEUS:CT1!' },
  { symbol: 'AUDUSD', name: 'AUD / USD', group: 'FX', eodhd: 'AUDUSD.FOREX', tradingView: 'FX:AUDUSD' },
]

/** Major cryptocurrencies via EODHD CC exchange */
export const CRYPTO: AltAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', group: 'Layer 1', eodhd: 'BTC-USD.CC', tradingView: 'BINANCE:BTCUSDT' },
  { symbol: 'ETH', name: 'Ethereum', group: 'Layer 1', eodhd: 'ETH-USD.CC', tradingView: 'BINANCE:ETHUSDT' },
  { symbol: 'SOL', name: 'Solana', group: 'Layer 1', eodhd: 'SOL-USD.CC', tradingView: 'BINANCE:SOLUSDT' },
  { symbol: 'XRP', name: 'XRP', group: 'Layer 1', eodhd: 'XRP-USD.CC', tradingView: 'BINANCE:XRPUSDT' },
  { symbol: 'ADA', name: 'Cardano', group: 'Layer 1', eodhd: 'ADA-USD.CC', tradingView: 'BINANCE:ADAUSDT' },
  { symbol: 'AVAX', name: 'Avalanche', group: 'Layer 1', eodhd: 'AVAX-USD.CC', tradingView: 'BINANCE:AVAXUSDT' },
  { symbol: 'DOT', name: 'Polkadot', group: 'Layer 1', eodhd: 'DOT-USD.CC', tradingView: 'BINANCE:DOTUSDT' },
  { symbol: 'TON', name: 'Toncoin', group: 'Layer 1', eodhd: 'TON-USD.CC', tradingView: 'BINANCE:TONUSDT' },
  { symbol: 'TRX', name: 'TRON', group: 'Layer 1', eodhd: 'TRX-USD.CC', tradingView: 'BINANCE:TRXUSDT' },
  { symbol: 'BNB', name: 'BNB', group: 'Exchange', eodhd: 'BNB-USD.CC', tradingView: 'BINANCE:BNBUSDT' },
  { symbol: 'DOGE', name: 'Dogecoin', group: 'Meme', eodhd: 'DOGE-USD.CC', tradingView: 'BINANCE:DOGEUSDT' },
  { symbol: 'SHIB', name: 'Shiba Inu', group: 'Meme', eodhd: 'SHIB-USD.CC', tradingView: 'BINANCE:SHIBUSDT' },
  { symbol: 'PEPE', name: 'Pepe', group: 'Meme', eodhd: 'PEPE-USD.CC', tradingView: 'BINANCE:PEPEUSDT' },
  { symbol: 'LINK', name: 'Chainlink', group: 'DeFi', eodhd: 'LINK-USD.CC', tradingView: 'BINANCE:LINKUSDT' },
  { symbol: 'UNI', name: 'Uniswap', group: 'DeFi', eodhd: 'UNI-USD.CC', tradingView: 'BINANCE:UNIUSDT' },
  { symbol: 'AAVE', name: 'Aave', group: 'DeFi', eodhd: 'AAVE-USD.CC', tradingView: 'BINANCE:AAVEUSDT' },
  { symbol: 'ATOM', name: 'Cosmos', group: 'Layer 1', eodhd: 'ATOM-USD.CC', tradingView: 'BINANCE:ATOMUSDT' },
  { symbol: 'LTC', name: 'Litecoin', group: 'Payments', eodhd: 'LTC-USD.CC', tradingView: 'BINANCE:LTCUSDT' },
  { symbol: 'BCH', name: 'Bitcoin Cash', group: 'Payments', eodhd: 'BCH-USD.CC', tradingView: 'BINANCE:BCHUSDT' },
  { symbol: 'NEAR', name: 'NEAR Protocol', group: 'Layer 1', eodhd: 'NEAR-USD.CC', tradingView: 'BINANCE:NEARUSDT' },
]
