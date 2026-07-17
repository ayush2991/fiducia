import { fetchDailySeries } from './marketData';
import type { Holding, Portfolio } from './types';
import * as storage from '@/lib/storage/portfolios';
import { getLatestClose, getLatestDate, upsertPrices } from '@/lib/storage/prices';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function normalizeWeights(holdings: { ticker: string; weight: number }[]): Holding[] {
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total === 0) return [];
  return holdings.map((h) => ({ ticker: h.ticker, weight: (h.weight / total) * 100 }));
}

async function assemblePortfolio(row: storage.PortfolioRow): Promise<Portfolio> {
  const holdings = await storage.getHoldings(row.id);
  return { id: row.id, name: row.name, type: row.type, holdings };
}

export async function listPortfolios(type?: 'user' | 'benchmark'): Promise<Portfolio[]> {
  const rows = await storage.getAllPortfolios(type);
  return Promise.all(rows.map(assemblePortfolio));
}

export async function createPortfolio(
  name: string,
  type: 'user' | 'benchmark',
  rawHoldings: { ticker: string; weight: number }[]
): Promise<Portfolio> {
  // Merge duplicate tickers by summing weights before normalizing.
  const merged: Record<string, number> = {};
  for (const h of rawHoldings) {
    merged[h.ticker] = (merged[h.ticker] ?? 0) + h.weight;
  }
  const deduped = Object.entries(merged)
    .map(([ticker, weight]) => ({ ticker, weight }))
    .filter((h) => h.weight > 0);
  const normalized = normalizeWeights(deduped);

  const id = generateId();
  await storage.insertPortfolio(id, name, type);
  await storage.insertHoldings(id, normalized);

  return { id, name, type, holdings: normalized };
}

export async function updatePortfolioHoldings(
  portfolioId: string,
  rawHoldings: { ticker: string; weight: number }[]
): Promise<void> {
  const merged: Record<string, number> = {};
  for (const h of rawHoldings) {
    merged[h.ticker] = (merged[h.ticker] ?? 0) + h.weight;
  }
  const deduped = Object.entries(merged)
    .map(([ticker, weight]) => ({ ticker, weight }))
    .filter((h) => h.weight > 0);
  const normalized = normalizeWeights(deduped);
  await storage.replaceHoldings(portfolioId, normalized);
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  await storage.deletePortfolio(portfolioId);
}

// Returns the latest cached close price, fetching from Alpha Vantage if nothing is cached.
// Throws if the ticker is unknown or the fetch fails with no cache.
export async function getLatestPrice(ticker: string): Promise<number> {
  const latestDate = await getLatestDate(ticker);
  if (latestDate) {
    const close = await getLatestClose(ticker);
    if (close !== null) return close;
  }
  // Nothing cached — fetch and seed the cache.
  const series = await fetchDailySeries(ticker); // throws on unknown ticker
  if (series.length === 0) throw new Error(`No price data for ${ticker}`);
  await upsertPrices(ticker, series);
  return series[series.length - 1].close;
}
