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
  PRIMARY KEY (portfolio_id, ticker)
);
`;

const SEED_BENCHMARKS = `
INSERT OR IGNORE INTO portfolios (id, name, type) VALUES ('benchmark-9010', '90/10 Benchmark', 'benchmark');
INSERT OR IGNORE INTO portfolios (id, name, type) VALUES ('benchmark-6040', '60/40 Classic', 'benchmark');
INSERT OR IGNORE INTO holdings (portfolio_id, ticker, weight) VALUES ('benchmark-9010', 'SPY', 90);
INSERT OR IGNORE INTO holdings (portfolio_id, ticker, weight) VALUES ('benchmark-9010', 'BND', 10);
INSERT OR IGNORE INTO holdings (portfolio_id, ticker, weight) VALUES ('benchmark-6040', 'SPY', 60);
INSERT OR IGNORE INTO holdings (portfolio_id, ticker, weight) VALUES ('benchmark-6040', 'BND', 40);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('fiducia.db').then(async (db) => {
      // Foreign keys must be enabled per-connection before any DML.
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync(SCHEMA);
      await db.execAsync(SEED_BENCHMARKS);
      return db;
    });
  }
  return dbPromise;
}
