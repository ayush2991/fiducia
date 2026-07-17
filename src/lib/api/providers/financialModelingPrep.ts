import type { MarketDataProvider, PricePoint } from './types';

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

type HistoricalPriceFullResponse = {
  historical?: { date: string; close: number }[];
  'Error Message'?: string;
};

type SearchResponse = { symbol: string; name: string }[];

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}/historical-price-full/${encodeURIComponent(ticker)}?apikey=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) {
    throw new Error('Financial Modeling Prep rejected the API key — check it in Settings');
  }
  if (!res.ok) {
    throw new Error(`Financial Modeling Prep request failed with status ${res.status}`);
  }
  const data = (await res.json()) as HistoricalPriceFullResponse;
  if (data['Error Message']) {
    throw new Error(data['Error Message']);
  }
  if (!data.historical || data.historical.length === 0) {
    throw new Error(`Unknown ticker or no price data returned for ${ticker}`);
  }
  return data.historical
    .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function lookupCompanyName(ticker: string, apiKey: string): Promise<string> {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${apiKey}`;
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
