import { getDb } from './db';

export interface PortfolioRow {
  id: string;
  name: string;
  type: 'user' | 'benchmark';
}

export async function insertPortfolio(id: string, name: string, type: 'user' | 'benchmark'): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO portfolios (id, name, type) VALUES (?, ?, ?)', id, name, type);
}

export async function insertHoldings(
  portfolioId: string,
  holdings: { ticker: string; weight: number }[]
): Promise<void> {
  if (holdings.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const h of holdings) {
      await db.runAsync(
        'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES (?, ?, ?)',
        portfolioId,
        h.ticker,
        h.weight
      );
    }
  });
}

export async function getAllPortfolios(type?: 'user' | 'benchmark'): Promise<PortfolioRow[]> {
  const db = await getDb();
  if (type) {
    return db.getAllAsync<PortfolioRow>(
      'SELECT id, name, type FROM portfolios WHERE type = ? ORDER BY rowid ASC',
      type
    );
  }
  return db.getAllAsync<PortfolioRow>('SELECT id, name, type FROM portfolios ORDER BY rowid ASC');
}

export async function getHoldings(portfolioId: string): Promise<{ ticker: string; weight: number }[]> {
  const db = await getDb();
  return db.getAllAsync<{ ticker: string; weight: number }>(
    'SELECT ticker, weight FROM holdings WHERE portfolio_id = ? ORDER BY weight DESC',
    portfolioId
  );
}

export async function replaceHoldings(
  portfolioId: string,
  holdings: { ticker: string; weight: number }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM holdings WHERE portfolio_id = ?', portfolioId);
    for (const h of holdings) {
      await db.runAsync(
        'INSERT INTO holdings (portfolio_id, ticker, weight) VALUES (?, ?, ?)',
        portfolioId,
        h.ticker,
        h.weight
      );
    }
  });
}

export async function deletePortfolio(portfolioId: string): Promise<void> {
  const db = await getDb();
  // foreign_keys = ON (set at connection open) cascades deletion to holdings.
  await db.runAsync('DELETE FROM portfolios WHERE id = ?', portfolioId);
}
