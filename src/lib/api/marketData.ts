const API_KEY = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

export type PricePoint = { date: string; close: number };

type DailySeriesResponse = {
  'Time Series (Daily)'?: Record<string, { '4. close': string }>;
  'Error Message'?: string;
  Note?: string;
};

type SymbolSearchResponse = {
  bestMatches?: { '1. symbol': string; '2. name': string }[];
};

function requireApiKey(): string {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY. Add it to your .env file.');
  }
  return API_KEY;
}

export async function fetchDailySeries(
  ticker: string,
  outputSize: 'compact' | 'full' = 'compact'
): Promise<PricePoint[]> {
  const apiKey = requireApiKey();
  const url = `${BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=${outputSize}&apikey=${apiKey}`;
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
  const series = data['Time Series (Daily)'];
  if (!series) {
    throw new Error(`No price data returned for ${ticker}`);
  }
  return Object.entries(series)
    .map(([date, values]) => ({ date, close: parseFloat(values['4. close']) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function lookupCompanyName(ticker: string): Promise<string> {
  const apiKey = requireApiKey();
  const url = `${BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return ticker;
  const data = (await res.json()) as SymbolSearchResponse;
  const match = data.bestMatches?.find((m) => m['1. symbol'].toUpperCase() === ticker.toUpperCase());
  return match ? match['2. name'] : ticker;
}
