export type AltAsset = {
  symbol: string
  name: string
  group: string
  yahoo: string
  tradingView: string
}

/** Global commodities via Yahoo continuous futures / spot proxies */
export const COMMODITIES: AltAsset[] = [
  { symbol: 'GOLD', name: 'Gold', group: 'Precious Metals', yahoo: 'GC=F', tradingView: 'COMEX:GC1!' },
  { symbol: 'SILVER', name: 'Silver', group: 'Precious Metals', yahoo: 'SI=F', tradingView: 'COMEX:SI1!' },
  { symbol: 'PLATINUM', name: 'Platinum', group: 'Precious Metals', yahoo: 'PL=F', tradingView: 'NYMEX:PL1!' },
  { symbol: 'PALLADIUM', name: 'Palladium', group: 'Precious Metals', yahoo: 'PA=F', tradingView: 'NYMEX:PA1!' },
  { symbol: 'COPPER', name: 'Copper', group: 'Industrial Metals', yahoo: 'HG=F', tradingView: 'COMEX:HG1!' },
  { symbol: 'ALUMINIUM', name: 'Aluminium', group: 'Industrial Metals', yahoo: 'ALI=F', tradingView: 'COMEX:ALI1!' },
  { symbol: 'IRONORE', name: 'Iron Ore 62%', group: 'Bulk', yahoo: 'TIO=F', tradingView: 'SGX:FEF1!' },
  { symbol: 'WTI', name: 'Crude Oil WTI', group: 'Energy', yahoo: 'CL=F', tradingView: 'NYMEX:CL1!' },
  { symbol: 'BRENT', name: 'Brent Crude', group: 'Energy', yahoo: 'BZ=F', tradingView: 'NYMEX:BB1!' },
  { symbol: 'NATGAS', name: 'Natural Gas', group: 'Energy', yahoo: 'NG=F', tradingView: 'NYMEX:NG1!' },
  { symbol: 'GASOLINE', name: 'RBOB Gasoline', group: 'Energy', yahoo: 'RB=F', tradingView: 'NYMEX:RB1!' },
  { symbol: 'HEATOIL', name: 'Heating Oil', group: 'Energy', yahoo: 'HO=F', tradingView: 'NYMEX:HO1!' },
  { symbol: 'CORN', name: 'Corn', group: 'Agriculture', yahoo: 'ZC=F', tradingView: 'CBOT:ZC1!' },
  { symbol: 'WHEAT', name: 'Wheat', group: 'Agriculture', yahoo: 'ZW=F', tradingView: 'CBOT:ZW1!' },
  { symbol: 'SOYBEAN', name: 'Soybeans', group: 'Agriculture', yahoo: 'ZS=F', tradingView: 'CBOT:ZS1!' },
  { symbol: 'SUGAR', name: 'Sugar', group: 'Agriculture', yahoo: 'SB=F', tradingView: 'ICEUS:SB1!' },
  { symbol: 'COFFEE', name: 'Coffee', group: 'Agriculture', yahoo: 'KC=F', tradingView: 'ICEUS:KC1!' },
  { symbol: 'COTTON', name: 'Cotton', group: 'Agriculture', yahoo: 'CT=F', tradingView: 'ICEUS:CT1!' },
  { symbol: 'CATTLE', name: 'Live Cattle', group: 'Livestock', yahoo: 'LE=F', tradingView: 'CME:LE1!' },
  { symbol: 'AUDUSD', name: 'AUD / USD', group: 'FX', yahoo: 'AUDUSD=X', tradingView: 'FX:AUDUSD' },
]

/** Major cryptocurrencies via Yahoo */
export const CRYPTO: AltAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', group: 'Layer 1', yahoo: 'BTC-USD', tradingView: 'BINANCE:BTCUSDT' },
  { symbol: 'ETH', name: 'Ethereum', group: 'Layer 1', yahoo: 'ETH-USD', tradingView: 'BINANCE:ETHUSDT' },
  { symbol: 'SOL', name: 'Solana', group: 'Layer 1', yahoo: 'SOL-USD', tradingView: 'BINANCE:SOLUSDT' },
  { symbol: 'XRP', name: 'XRP', group: 'Layer 1', yahoo: 'XRP-USD', tradingView: 'BINANCE:XRPUSDT' },
  { symbol: 'ADA', name: 'Cardano', group: 'Layer 1', yahoo: 'ADA-USD', tradingView: 'BINANCE:ADAUSDT' },
  { symbol: 'AVAX', name: 'Avalanche', group: 'Layer 1', yahoo: 'AVAX-USD', tradingView: 'BINANCE:AVAXUSDT' },
  { symbol: 'DOT', name: 'Polkadot', group: 'Layer 1', yahoo: 'DOT-USD', tradingView: 'BINANCE:DOTUSDT' },
  { symbol: 'TON', name: 'Toncoin', group: 'Layer 1', yahoo: 'TON-USD', tradingView: 'BINANCE:TONUSDT' },
  { symbol: 'TRX', name: 'TRON', group: 'Layer 1', yahoo: 'TRX-USD', tradingView: 'BINANCE:TRXUSDT' },
  { symbol: 'BNB', name: 'BNB', group: 'Exchange', yahoo: 'BNB-USD', tradingView: 'BINANCE:BNBUSDT' },
  { symbol: 'DOGE', name: 'Dogecoin', group: 'Meme', yahoo: 'DOGE-USD', tradingView: 'BINANCE:DOGEUSDT' },
  { symbol: 'SHIB', name: 'Shiba Inu', group: 'Meme', yahoo: 'SHIB-USD', tradingView: 'BINANCE:SHIBUSDT' },
  { symbol: 'PEPE', name: 'Pepe', group: 'Meme', yahoo: 'PEPE-USD', tradingView: 'BINANCE:PEPEUSDT' },
  { symbol: 'LINK', name: 'Chainlink', group: 'DeFi', yahoo: 'LINK-USD', tradingView: 'BINANCE:LINKUSDT' },
  { symbol: 'UNI', name: 'Uniswap', group: 'DeFi', yahoo: 'UNI-USD', tradingView: 'BINANCE:UNIUSDT' },
  { symbol: 'AAVE', name: 'Aave', group: 'DeFi', yahoo: 'AAVE-USD', tradingView: 'BINANCE:AAVEUSDT' },
  { symbol: 'ATOM', name: 'Cosmos', group: 'Layer 1', yahoo: 'ATOM-USD', tradingView: 'BINANCE:ATOMUSDT' },
  { symbol: 'LTC', name: 'Litecoin', group: 'Payments', yahoo: 'LTC-USD', tradingView: 'BINANCE:LTCUSDT' },
  { symbol: 'BCH', name: 'Bitcoin Cash', group: 'Payments', yahoo: 'BCH-USD', tradingView: 'BINANCE:BCHUSDT' },
  { symbol: 'NEAR', name: 'NEAR Protocol', group: 'Layer 1', yahoo: 'NEAR-USD', tradingView: 'BINANCE:NEARUSDT' },
]
