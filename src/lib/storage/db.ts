import * as SQLite from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watchlist (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('user', 'benchmark'))
);

CREATE TABLE IF NOT EXISTS holdings (
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  weight REAL NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (portfolio_id, ticker)
);

CREATE TABLE IF NOT EXISTS price_sync (
  ticker TEXT PRIMARY KEY,
  last_synced_date TEXT NOT NULL
);
`;

const SEED_BENCHMARKS = `
INSERT OR IGNORE INTO portfolios (id, name, type) VALUES ('benchmark-spy', 'S&P 500', 'benchmark');
INSERT OR IGNORE INTO holdings (portfolio_id, ticker, weight, name) VALUES ('benchmark-spy', 'SPY', 100, 'SPDR S&P 500 ETF Trust');
`;

// Older installs seeded two benchmarks (90/10, 60/40) — drop them so only the
// single S&P 500 benchmark remains. ON DELETE CASCADE on holdings handles the
// holding rows.
const REMOVED_BENCHMARK_IDS = ['benchmark-9010', 'benchmark-6040'];
async function migrateRemoveOldBenchmarks(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const id of REMOVED_BENCHMARK_IDS) {
    await db.runAsync('DELETE FROM portfolios WHERE id = ?;', id);
  }
}

// holdings.name was added after the initial schema shipped — CREATE TABLE IF
// NOT EXISTS won't retrofit it onto a dev DB created before this change, so
// migrate it in explicitly.
async function migrateHoldingsNameColumn(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(holdings)');
  const hasName = columns.some((c) => c.name === 'name');
  if (!hasName) {
    await db.execAsync("ALTER TABLE holdings ADD COLUMN name TEXT NOT NULL DEFAULT '';");
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('fiducia.db').then(async (db) => {
      // Foreign keys must be enabled per-connection before any DML.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(SCHEMA);
      await migrateHoldingsNameColumn(db);
      await migrateRemoveOldBenchmarks(db);
      await db.execAsync(SEED_BENCHMARKS);
      return db;
    });
  }
  return dbPromise;
}
