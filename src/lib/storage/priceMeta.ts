import { getDb } from './db';

export async function getFullFetchedOn(ticker: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ full_fetched_on: string | null }>(
    'SELECT full_fetched_on FROM price_meta WHERE ticker = ?',
    ticker
  );
  return row?.full_fetched_on ?? null;
}

export async function setFullFetchedOn(ticker: string, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO price_meta (ticker, full_fetched_on) VALUES (?, ?) ' +
      'ON CONFLICT(ticker) DO UPDATE SET full_fetched_on = excluded.full_fetched_on',
    ticker,
    date
  );
}
