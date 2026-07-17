import { getDb } from './db';

export interface PortfolioRow {
  id: string;
  name: string;
  type: 'user' | 'benchmark';
  holdings: { ticker: string; weight: number; name: string }[];
}

interface PortfolioHoldingJoinRow {
  id: string;
  name: string;
  type: 'user' | 'benchmark';
  ticker: string | null;
  weight: number | null;
  holdingName: string | null;
}

function groupJoinRows(rows: PortfolioHoldingJoinRow[]): PortfolioRow[] {
  const byId = new Map<string, PortfolioRow>();
  for (const row of rows) {
    let portfolio = byId.get(row.id);
    if (!portfolio) {
      portfolio = { id: row.id, name: row.name, type: row.type, holdings: [] };
      byId.set(row.id, portfolio);
    }
    if (row.ticker !== null && row.weight !== null) {
      portfolio.holdings.push({ ticker: row.ticker, weight: row.weight, name: row.holdingName ?? row.ticker });
    }
  }
  return Array.from(byId.values());
}

// Creates the portfolio and its holdings atomically — a failure partway through
// rolls back rather than leaving an orphaned, holdings-less portfolio row.
export async function createPortfolioWithHoldings(
  id: string,
  name: string,
  type: 'user' | 'benchmark',
  holdings: { ticker: string; weight: number; name: string }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO portfolios (id, name, type) VALUES (?, ?, ?)', id, name, type);
    for (const h of holdings) {
      await db.runAsync(
        'INSERT INTO holdings (portfolio_id, ticker, weight, name) VALUES (?, ?, ?, ?)',
        id,
        h.ticker,
        h.weight,
        h.name
      );
    }
  });
}

// Single JOIN query instead of one portfolios query + N per-portfolio holdings queries.
export async function getAllPortfolios(type?: 'user' | 'benchmark'): Promise<PortfolioRow[]> {
  const db = await getDb();
  const rows = type
    ? await db.getAllAsync<PortfolioHoldingJoinRow>(
        `SELECT p.id, p.name, p.type, h.ticker, h.weight, h.name AS holdingName
         FROM portfolios p
         LEFT JOIN holdings h ON h.portfolio_id = p.id
         WHERE p.type = ?
         ORDER BY p.rowid ASC, h.weight DESC`,
        type
      )
    : await db.getAllAsync<PortfolioHoldingJoinRow>(
        `SELECT p.id, p.name, p.type, h.ticker, h.weight, h.name AS holdingName
         FROM portfolios p
         LEFT JOIN holdings h ON h.portfolio_id = p.id
         ORDER BY p.rowid ASC, h.weight DESC`
      );
  return groupJoinRows(rows);
}

export async function replaceHoldings(
  portfolioId: string,
  holdings: { ticker: string; weight: number; name: string }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM holdings WHERE portfolio_id = ?', portfolioId);
    for (const h of holdings) {
      await db.runAsync(
        'INSERT INTO holdings (portfolio_id, ticker, weight, name) VALUES (?, ?, ?, ?)',
        portfolioId,
        h.ticker,
        h.weight,
        h.name
      );
    }
  });
}

export async function updateHoldingName(portfolioId: string, ticker: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE holdings SET name = ? WHERE portfolio_id = ? AND ticker = ?',
    name,
    portfolioId,
    ticker
  );
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const db = await getDb();
  // foreign_keys = ON (set at connection open) cascades deletion to holdings.
  await db.runAsync('DELETE FROM portfolios WHERE id = ?', portfolioId);
}
