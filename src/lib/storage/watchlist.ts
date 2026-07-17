import { getDb } from './db';

export async function listTickers(): Promise<{ ticker: string; name: string }[]> {
  const db = await getDb();
  return db.getAllAsync<{ ticker: string; name: string }>(
    'SELECT ticker, name FROM watchlist ORDER BY ticker ASC'
  );
}

export async function insertTicker(ticker: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR IGNORE INTO watchlist (ticker, name) VALUES (?, ?)', ticker, name);
}

export async function updateName(ticker: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE watchlist SET name = ? WHERE ticker = ?', name, ticker);
}

export async function deleteTicker(ticker: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM watchlist WHERE ticker = ?', ticker);
}
