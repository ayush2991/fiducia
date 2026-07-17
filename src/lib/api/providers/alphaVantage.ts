import type { MarketDataProvider, PricePoint } from './types';

const BASE_URL = 'https://www.alphavantage.co/query';

type DailySeriesResponse = {
  'Time Series (Daily)'?: Record<string, { '4. close': string }>;
  'Error Message'?: string;
  Note?: string;
  Information?: string;
};

type SymbolSearchResponse = {
  bestMatches?: { '1. symbol': string; '2. name': string }[];
};

// outputsize is always 'compact' (last ~100 trading days) — Alpha Vantage's free
// tier doesn't support 'full', so PeriodKey is capped to what compact can back.
async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Alpha Vantage request failed with status ${res.status}`);
  }
  const data = (await res.json()) as DailySeriesResponse;
  if (data['Error Message']) {
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  if (data.Note) {
    throw new Error('Alpha Vantage rate limit hit, try again later');
  }
  if (data.Information) {
    throw new Error(data.Information);
  }
  const series = data['Time Series (Daily)'];
  if (!series) {
    throw new Error(`No price data returned for ${ticker}`);
  }
  return Object.entries(series)
    .map(([date, values]) => ({ date, close: parseFloat(values['4. close']) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  const url = `${BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return ticker;
  const data = (await res.json()) as SymbolSearchResponse;
  const match = data.bestMatches?.find((m) => m['1. symbol'].toUpperCase() === ticker.toUpperCase());
  return match ? match['2. name'] : ticker;
}

async function validateApiKey(apiKey: string): Promise<void> {
  await fetchDailySeries('SPY', apiKey);
}

export const alphaVantageProvider: MarketDataProvider = { fetchDailySeries, lookupCompanyName, validateApiKey };
