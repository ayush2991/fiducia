import type { MarketDataProvider, PricePoint } from './types';

// The old /api/v3 endpoints (historical-price-full, search) were retired as
// "legacy" in August 2025 and now reject any non-legacy-subscription key with
// a 401/403 — every key must go through /stable instead. Confirmed against the
// current stable docs: /stable/search-symbol keeps the same "query" param as
// v3's /search. /stable/historical-price-eod/full (OHLC+VWAP) 402s on a free
// plan — it's plan-gated above Free/Starter. /stable/historical-price-eod/light
// (date, price, volume only) is the variant actually included on Free, so
// that's what we use; its "price" field maps to our PricePoint's "close".
const BASE_URL = 'https://financialmodelingprep.com/stable';

type HistoricalPriceLightResponse = { date: string; price: number }[] | { 'Error Message': string };

type SearchResponse = { symbol: string; name: string }[];

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}/historical-price-eod/light?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    throw new Error('Financial Modeling Prep rejected the API key — check it in Settings');
  }
  if (res.status === 402) {
    throw new Error('Financial Modeling Prep plan does not include this data — upgrade your plan');
  }
  if (!res.ok) {
    throw new Error(`Financial Modeling Prep request failed with status ${res.status}`);
  }
  const data = (await res.json()) as HistoricalPriceLightResponse;
  if (!Array.isArray(data)) {
    throw new Error(data['Error Message']);
  }
  if (data.length === 0) {
    throw new Error(`Unknown ticker or no price data returned for ${ticker}`);
  }
  return data
    .map((p) => ({ date: p.date.slice(0, 10), close: p.price }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  const url = `${BASE_URL}/search-symbol?query=${encodeURIComponent(ticker)}&limit=1&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return ticker;
  const data = (await res.json()) as SearchResponse;
  const match = data.find((m) => m.symbol.toUpperCase() === ticker.toUpperCase());
  return match ? match.name : ticker;
}

async function validateApiKey(apiKey: string): Promise<void> {
  await fetchDailySeries('SPY', apiKey);
}

export const financialModelingPrepProvider: MarketDataProvider = {
  fetchDailySeries,
  lookupCompanyName,
  validateApiKey,
};
