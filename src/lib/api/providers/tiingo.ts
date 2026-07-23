import type { MarketDataProvider, PricePoint } from './types';

const BASE_URL = 'https://api.tiingo.com';

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' };
}

type DailyPriceResponse = { date: string; close: number }[];
type TickerMetadataResponse = { name?: string };

// Without a startDate, Tiingo's /prices endpoint returns only the single most
// recent trading day, not a history — so every fetch must request an explicit
// range. 1900 calendar days comfortably covers the longest supported period
// (5Y = 5 calendar years, i.e. ~1826-1827 days depending on leap years) plus a
// buffer for weekends/holidays and a lookback day for return calculations. This
// window is fetched once per ticker per calendar day (see ensureFreshHistory in
// src/lib/api/priceSync.ts) and cached in full, so every period from 1D to 5Y is
// served by slicing that single cached window — switching periods never triggers
// another fetch.
const HISTORY_LOOKBACK_DAYS = 1900;

function startDateParam(): string {
  const start = new Date();
  start.setDate(start.getDate() - HISTORY_LOOKBACK_DAYS);
  return start.toISOString().slice(0, 10);
}

async function fetchDailySeries(ticker: string, apiKey: string): Promise<PricePoint[]> {
  const url = `${BASE_URL}/tiingo/daily/${encodeURIComponent(ticker)}/prices?startDate=${startDateParam()}`;
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
