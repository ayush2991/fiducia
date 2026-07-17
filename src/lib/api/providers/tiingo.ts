import type { MarketDataProvider, PricePoint } from './types';

const BASE_URL = 'https://api.tiingo.com';

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' };
}

type DailyPriceResponse = { date: string; close: number }[];
type TickerMetadataResponse = { name?: string };

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}/tiingo/daily/${encodeURIComponent(ticker)}/prices`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (res.status === 404) {
    throw new Error(`Unknown ticker: ${ticker}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('Tiingo rejected the API key — check it in Settings');
  }
  if (!res.ok) {
    throw new Error(`Tiingo request failed with status ${res.status}`);
  }
  const data = (await res.json()) as DailyPriceResponse;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No price data returned for ${ticker}`);
  }
  return data
    .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  const url = `${BASE_URL}/tiingo/daily/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) return ticker;
  const data = (await res.json()) as TickerMetadataResponse;
  return data.name ?? ticker;
}

async function validateApiKey(apiKey: string): Promise<void> {
  await fetchDailySeries('SPY', apiKey);
}

export const tiingoProvider: MarketDataProvider = { fetchDailySeries, lookupCompanyName, validateApiKey };
