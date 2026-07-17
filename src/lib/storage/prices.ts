import { getDb } from './db';

export type PricePoint = { date: string; close: number };

export async function getLatestDate(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ maxDate: string | null }>(
    'SELECT MAX(date) as maxDate FROM prices WHERE ticker = ?',
    ticker
  );
  return row?.maxDate ?? null;
}

export async function getEarliestDate(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ minDate: string | null }>(
    'SELECT MIN(date) as minDate FROM prices WHERE ticker = ?',
    ticker
  );
  return row?.minDate ?? null;
}

export async function upsertPrices(ticker: string, points: PricePoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const point of points) {
      await db.runAsync(
        'INSERT OR REPLACE INTO prices (ticker, date, close) VALUES (?, ?, ?)',
        ticker,
        point.date,
        point.close
      );
    }
  });
}

export async function getAllPrices(ticker: string): Promise<PricePoint[]> {
  const db = await getDb();
  return db.getAllAsync<PricePoint>(
    'SELECT date, close FROM prices WHERE ticker = ? ORDER BY date ASC',
    ticker
  );
}
