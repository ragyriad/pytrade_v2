export type DemoSecurityTemplate = {
  symbol: string;
  name: string;
  currency: "CAD" | "USD";
  exchangeCode: "NASDAQ" | "NYSE" | "TSX";
  exchangeMicCode: "XNAS" | "XNYS" | "XTSE";
  group: string;
  instrumentType: "Common Stock" | "Exchange Traded Fund";
  referencePrice: number;
  dividendYield: number;
};

// `group` is used only to keep generated holdings diversified. It is never
// written to a database row or returned by an API.
export const demoSecurityCatalog: readonly DemoSecurityTemplate[] = [
  { symbol: "AAPL", name: "Apple Inc.", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "technology", instrumentType: "Common Stock", referencePrice: 225, dividendYield: 0.004 },
  { symbol: "MSFT", name: "Microsoft Corporation", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "technology", instrumentType: "Common Stock", referencePrice: 510, dividendYield: 0.007 },
  { symbol: "NVDA", name: "NVIDIA Corporation", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "technology", instrumentType: "Common Stock", referencePrice: 175, dividendYield: 0.001 },
  { symbol: "GOOGL", name: "Alphabet Inc.", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "communications", instrumentType: "Common Stock", referencePrice: 205, dividendYield: 0.004 },
  { symbol: "AMZN", name: "Amazon.com Inc.", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "consumer", instrumentType: "Common Stock", referencePrice: 235, dividendYield: 0 },
  { symbol: "META", name: "Meta Platforms Inc.", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "communications", instrumentType: "Common Stock", referencePrice: 690, dividendYield: 0.003 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "financials", instrumentType: "Common Stock", referencePrice: 290, dividendYield: 0.02 },
  { symbol: "JNJ", name: "Johnson & Johnson", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "healthcare", instrumentType: "Common Stock", referencePrice: 175, dividendYield: 0.03 },
  { symbol: "XOM", name: "Exxon Mobil Corporation", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "energy", instrumentType: "Common Stock", referencePrice: 120, dividendYield: 0.033 },
  { symbol: "COST", name: "Costco Wholesale Corporation", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "consumer", instrumentType: "Common Stock", referencePrice: 980, dividendYield: 0.005 },
  { symbol: "CAT", name: "Caterpillar Inc.", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "industrials", instrumentType: "Common Stock", referencePrice: 420, dividendYield: 0.014 },
  { symbol: "NEE", name: "NextEra Energy Inc.", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "utilities", instrumentType: "Common Stock", referencePrice: 78, dividendYield: 0.028 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", currency: "USD", exchangeCode: "NYSE", exchangeMicCode: "XNYS", group: "broad-market", instrumentType: "Exchange Traded Fund", referencePrice: 325, dividendYield: 0.012 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", currency: "USD", exchangeCode: "NASDAQ", exchangeMicCode: "XNAS", group: "broad-market", instrumentType: "Exchange Traded Fund", referencePrice: 570, dividendYield: 0.005 },
  { symbol: "SHOP", name: "Shopify Inc.", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "technology", instrumentType: "Common Stock", referencePrice: 170, dividendYield: 0 },
  { symbol: "RY", name: "Royal Bank of Canada", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "financials", instrumentType: "Common Stock", referencePrice: 210, dividendYield: 0.032 },
  { symbol: "TD", name: "Toronto-Dominion Bank", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "financials", instrumentType: "Common Stock", referencePrice: 112, dividendYield: 0.038 },
  { symbol: "ENB", name: "Enbridge Inc.", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "energy", instrumentType: "Common Stock", referencePrice: 68, dividendYield: 0.058 },
  { symbol: "CNR", name: "Canadian National Railway Company", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "industrials", instrumentType: "Common Stock", referencePrice: 155, dividendYield: 0.023 },
  { symbol: "CP", name: "Canadian Pacific Kansas City Limited", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "industrials", instrumentType: "Common Stock", referencePrice: 115, dividendYield: 0.008 },
  { symbol: "CNQ", name: "Canadian Natural Resources Limited", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "energy", instrumentType: "Common Stock", referencePrice: 50, dividendYield: 0.045 },
  { symbol: "FTS", name: "Fortis Inc.", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "utilities", instrumentType: "Common Stock", referencePrice: 68, dividendYield: 0.038 },
  { symbol: "ATD", name: "Alimentation Couche-Tard Inc.", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "consumer", instrumentType: "Common Stock", referencePrice: 82, dividendYield: 0.009 },
  { symbol: "BAM", name: "Brookfield Asset Management Ltd.", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "financials", instrumentType: "Common Stock", referencePrice: 82, dividendYield: 0.03 },
  { symbol: "XIU", name: "iShares S&P/TSX 60 Index ETF", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "broad-market", instrumentType: "Exchange Traded Fund", referencePrice: 41, dividendYield: 0.026 },
  { symbol: "VCN", name: "Vanguard FTSE Canada All Cap Index ETF", currency: "CAD", exchangeCode: "TSX", exchangeMicCode: "XTSE", group: "broad-market", instrumentType: "Exchange Traded Fund", referencePrice: 58, dividendYield: 0.025 },
] as const;
