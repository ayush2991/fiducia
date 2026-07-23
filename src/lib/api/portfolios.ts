import { fetchDailySeries, lookupCompanyName } from './marketData';
import { ensureFreshHistory } from './priceSync';
import type { Holding, Portfolio } from './types';
import * as storage from '@/lib/storage/portfolios';
import { getLatestClose, upsertPrices } from '@/lib/storage/prices';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function normalizeWeights(holdings: { ticker: string; weight: number }[]): { ticker: string; weight: number }[] {
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (total === 0) return [];
  return holdings.map((h) => ({ ticker: h.ticker, weight: (h.weight / total) * 100 }));
}

function mergeDedupeNormalize(
  rawHoldings: { ticker: string; weight: number }[]
): { ticker: string; weight: number }[] {
  const merged: Record<string, number> = {};
  for (const h of rawHoldings) {
    merged[h.ticker] = (merged[h.ticker] ?? 0) + h.weight;
  }
  const deduped = Object.entries(merged)
    .map(([ticker, weight]) => ({ ticker, weight }))
    .filter((h) => h.weight > 0);
  return normalizeWeights(deduped);
}

// Resolves a company name per ticker, same fallback-to-ticker-on-failure
// contract as watchlist's addWatchlistTicker.
async function attachNames(holdings: { ticker: string; weight: number }[]): Promise<Holding[]> {
  return Promise.all(
    holdings.map(async (h) => {
      let name = h.ticker;
      try {
        name = await lookupCompanyName(h.ticker);
      } catch {
        // leave name as the ticker — same silent fallback as lookupCompanyName itself
      }
      return { ticker: h.ticker, weight: h.weight, name };
    })
  );
}

function toApiPortfolio(row: storage.PortfolioRow): Portfolio {
  return { id: row.id, name: row.name, type: row.type, holdings: row.holdings };
}

// A stored holding name equal to its ticker means the lookup at save-time
// failed (rate limit / offline / no match) and silently fell back — retry it
// here so a transient failure self-heals on a later load instead of showing
// the ticker as the name permanently (same pattern as watchlist.ts).
async function healStuckHoldingNames(row: storage.PortfolioRow): Promise<storage.PortfolioRow> {
  const holdings = await Promise.all(
    row.holdings.map(async (h) => {
      if (h.name !== h.ticker) return h;
      try {
        const resolved = await lookupCompanyName(h.ticker);
        if (resolved !== h.ticker) {
          await storage.updateHoldingName(row.id, h.ticker, resolved);
        }
        return { ...h, name: resolved };
      } catch {
        return h;
      }
    })
  );
  return { ...row, holdings };
}

export async function listPortfolios(type?: 'user' | 'benchmark'): Promise<Portfolio[]> {
  const rows = await storage.getAllPortfolios(type);
  const healed = await Promise.all(rows.map(healStuckHoldingNames));
  return healed.map(toApiPortfolio);
}

export async function createPortfolio(
  name: string,
  type: 'user' | 'benchmark',
  rawHoldings: { ticker: string; weight: number }[]
): Promise<Portfolio> {
  const normalized = await attachNames(mergeDedupeNormalize(rawHoldings));
  const id = generateId();
  await storage.createPortfolioWithHoldings(id, name, type, normalized);
  return { id, name, type, holdings: normalized };
}

export async function updatePortfolioHoldings(
  portfolioId: string,
  rawHoldings: { ticker: string; weight: number }[]
): Promise<void> {
  const normalized = await attachNames(mergeDedupeNormalize(rawHoldings));
  await storage.replaceHoldings(portfolioId, normalized);
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  await storage.deletePortfolio(portfolioId);
}

// Returns the latest price, refreshing from the active provider once per calendar
// day per ticker rather than serving a cached price forever. Falls back to a stale
// cache on fetch failure; throws only when there's no cache at all and the fetch
// also fails (e.g. a genuinely unknown ticker).
export async function getLatestPrice(ticker: string): Promise<number> {
  const cachedBefore = await getLatestClose(ticker);
  if (cachedBefore === null) {
    // Nothing cached yet (brand-new ticker being validated) — fetch directly so a
    // real failure (unknown ticker, rate limit, bad key) surfaces with its actual
    // message, rather than the swallow-and-report-stale behavior priceSync's
    // ensureFreshHistory uses for the multi-ticker refresh case below.
    const series = await fetchDailySeries(ticker); // throws on unknown ticker
    await upsertPrices(ticker, series);
    const close = series[series.length - 1]?.close;
    if (close === undefined) throw new Error(`No price data for ${ticker}`);
    return close;
  }
  // Cache already exists — go through the shared once-a-day-refresh path so this
  // shares its in-flight de-dup and rate-limit-aware throttling with the other
  // screens that may be refreshing the same ticker concurrently.
  await ensureFreshHistory(ticker);
  const close = await getLatestClose(ticker);
  if (close === null) throw new Error(`No price data for ${ticker}`);
  return close;
}
