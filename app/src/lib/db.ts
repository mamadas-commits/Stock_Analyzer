import Database from "better-sqlite3";
import { sectorFromSic } from "./sectors";
import fs from "node:fs";
import path from "node:path";

/**
 * Local SQLite store. Everything the app knows lives in this one file so the
 * whole install stays offline-capable and trivially backup-able.
 */

let instance: Database.Database | null = null;

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH || "data/stocks.db";
  return path.isAbsolute(configured)
    ? configured
    : // turbopackIgnore keeps the bundler from tracing the whole project just
      // because this path is built at runtime — the app is local-only anyway.
      path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

export function getDb(): Database.Database {
  if (instance) return instance;

  const file = resolveDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  instance = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      ticker            TEXT PRIMARY KEY,
      cik               TEXT,
      name              TEXT,
      exchange          TEXT,
      currency          TEXT,
      sic               TEXT,
      sic_description   TEXT,
      fiscal_year_end   TEXT,
      price_source      TEXT,
      first_trade_date  TEXT,
      updated_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS prices (
      ticker    TEXT NOT NULL,
      date      TEXT NOT NULL,
      open      REAL,
      high      REAL,
      low       REAL,
      close     REAL,
      adj_close REAL,
      volume    REAL,
      PRIMARY KEY (ticker, date)
    );
    CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices (ticker, date);

    CREATE TABLE IF NOT EXISTS dividends (
      ticker TEXT NOT NULL,
      date   TEXT NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (ticker, date)
    );

    CREATE TABLE IF NOT EXISTS splits (
      ticker TEXT NOT NULL,
      date   TEXT NOT NULL,   -- first session trading at the new price
      ratio  REAL NOT NULL,   -- new shares per old share (4 = a 4:1 split)
      label  TEXT,
      source TEXT,            -- 'feed' | 'derived' | 'sec'
      PRIMARY KEY (ticker, date)
    );

    CREATE TABLE IF NOT EXISTS filings (
      ticker        TEXT NOT NULL,
      accn          TEXT NOT NULL,
      form          TEXT,
      fiscal_year   INTEGER,
      fiscal_period TEXT,
      period_end    TEXT,
      filed         TEXT,
      PRIMARY KEY (ticker, accn)
    );
    CREATE INDEX IF NOT EXISTS idx_filings_ticker ON filings (ticker, period_end);

    -- Raw XBRL facts exactly as SEC reports them. Kept so metrics can be
    -- re-derived later without re-downloading from EDGAR.
    CREATE TABLE IF NOT EXISTS facts (
      ticker        TEXT NOT NULL,
      taxonomy      TEXT NOT NULL,
      concept       TEXT NOT NULL,
      unit          TEXT NOT NULL,
      period_start  TEXT,
      period_end    TEXT NOT NULL,
      fiscal_year   INTEGER,
      fiscal_period TEXT,
      form          TEXT,
      filed         TEXT,
      accn          TEXT,
      frame         TEXT,
      value         REAL,
      PRIMARY KEY (ticker, concept, unit, period_start, period_end, accn)
    );
    CREATE INDEX IF NOT EXISTS idx_facts_lookup ON facts (ticker, concept, period_end);

    -- Normalized, deduplicated line items keyed by our own canonical metric names.
    CREATE TABLE IF NOT EXISTS financials (
      ticker        TEXT NOT NULL,
      metric        TEXT NOT NULL,
      period_type   TEXT NOT NULL,   -- 'Q' | 'FY' | 'PIT'
      period_end    TEXT NOT NULL,
      period_start  TEXT,
      fiscal_year   INTEGER,
      fiscal_period TEXT,
      form          TEXT,
      filed         TEXT,
      accn          TEXT,
      unit          TEXT,
      value         REAL NOT NULL,
      derived       INTEGER NOT NULL DEFAULT 0,
      concept       TEXT,
      PRIMARY KEY (ticker, metric, period_type, period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_fin_lookup ON financials (ticker, period_type, period_end);

    -- Saved chart layouts. Keyed by name so several dashboards can coexist.
    CREATE TABLE IF NOT EXISTS dashboards (
      name       TEXT PRIMARY KEY,
      layout     TEXT NOT NULL,      -- JSON array of chart ids / configs
      updated_at TEXT NOT NULL
    );

    -- Index membership plus the app's memory of what has been ingested, so a
    -- batch download can resume where the previous one stopped.
    CREATE TABLE IF NOT EXISTS universe (
      ticker       TEXT PRIMARY KEY,
      name         TEXT,
      sector       TEXT,
      sub_industry TEXT,
      cik          TEXT,
      index_name   TEXT NOT NULL DEFAULT 'SP500',
      date_added   TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',  -- pending | done | failed
      attempts     INTEGER NOT NULL DEFAULT 0,
      last_attempt TEXT,
      last_error   TEXT,
      imported_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_universe_status ON universe (status, ticker);

    -- Which lists a company is on. universe.index_name holds only one, and the
    -- Wilshire 5000 contains both S&P lists whole, so membership lives here.
    CREATE TABLE IF NOT EXISTS index_members (
      index_name TEXT NOT NULL,
      ticker     TEXT NOT NULL,
      PRIMARY KEY (index_name, ticker)
    );

    -- Hand-entered holdings. Only what a "what if" needs: what, how much,
    -- since when. Sells and partial exits are deliberately out of scope.
    CREATE TABLE IF NOT EXISTS positions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker     TEXT NOT NULL,
      shares     REAL NOT NULL,
      buy_date   TEXT NOT NULL,
      buy_price  REAL,               -- NULL = take the close of the buy date
      note       TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_positions_ticker ON positions (ticker);

    -- The real portfolio, as a journal of buys. Kept apart from "positions" on
    -- purpose: the simulator is a sandbox for what-ifs, this is what is owned.
    -- Every top-up is its own row, so one ticker may appear many times.
    CREATE TABLE IF NOT EXISTS trades (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker     TEXT NOT NULL,
      shares     REAL NOT NULL,
      buy_date   TEXT NOT NULL,
      buy_price  REAL,               -- NULL = take the close of the buy date
      note       TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades (ticker);

    -- CNB daily fixings, CZK per one unit of the currency. Downloaded data
    -- like prices, so it can always be fetched again.
    CREATE TABLE IF NOT EXISTS fx_rates (
      currency TEXT NOT NULL,
      date     TEXT NOT NULL,
      czk      REAL NOT NULL,
      PRIMARY KEY (currency, date)
    );

    -- Companies being watched but not owned. Keyed by ticker: watching the same
    -- company twice means nothing, unlike buying it twice.
    CREATE TABLE IF NOT EXISTS watchlist (
      ticker       TEXT PRIMARY KEY,
      note         TEXT,
      target_price REAL,             -- NULL = no price alert
      added_at     TEXT NOT NULL     -- YYYY-MM-DD, the start of "since added"
    );

    -- One run of the tail-risk analysis: five passes over one company.
    CREATE TABLE IF NOT EXISTS risk_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT NOT NULL,
      /** Data cut-off the run was held to; NULL means today's data. */
      cutoff      TEXT,
      status      TEXT NOT NULL,          -- running | done | error
      error       TEXT,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      -- Passes 1 and 2 as JSON: the model of the business the scenarios stand on.
      mechanics   TEXT,
      dependencies TEXT,
      theses      TEXT,
      usd         REAL,
      tokens      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_risk_runs_ticker ON risk_runs (ticker, started_at DESC);

    CREATE TABLE IF NOT EXISTS risk_scenarios (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id         INTEGER NOT NULL REFERENCES risk_runs(id) ON DELETE CASCADE,
      ordinal        INTEGER NOT NULL,
      title          TEXT NOT NULL,
      inverts        TEXT,                -- the bull thesis this one turns over
      trigger_text   TEXT,
      chain          TEXT,                -- JSON array of links
      impact         TEXT,
      lag            TEXT,
      indicator      TEXT,
      falsifier      TEXT,
      numbers        TEXT,                -- JSON array of figures with sources
      why_nonobvious TEXT,
      severity       INTEGER,
      novelty        INTEGER,
      verdict        TEXT,                -- potvrzeno | zamítnuto
      verdict_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_risk_scenarios_run ON risk_scenarios (run_id, ordinal);

    -- Cache for the SEC ticker->CIK directory so we hit EDGAR once per day.
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  addColumn(db, "companies", "price_resolution", "TEXT");
  addColumn(db, "splits", "source", "TEXT");
  // 1 = the date is the actual first session at the new price. A weekly or
  // monthly feed dates a split to the end of its bar, which can be days late.
  addColumn(db, "splits", "exact", "INTEGER");
  addColumn(db, "filings", "primary_document", "TEXT");
  addColumn(db, "filings", "doc_url", "TEXT");
  addColumn(db, "filings", "stored_path", "TEXT");
  addColumn(db, "filings", "stored_bytes", "INTEGER");
  addColumn(db, "filings", "stored_at", "TEXT");
  addColumn(db, "financials", "first_filed", "TEXT");

  /*
   * Sector and sub-industry used to live only in `universe`, which knows about
   * index members and nobody else. A hand-added company therefore had no
   * sector at all — an empty column in the picker, no entry in its filter, and
   * no peers to compare against. They belong to the company, so that is where
   * they are stored now.
   */
  addColumn(db, "companies", "sector", "TEXT");
  addColumn(db, "companies", "sub_industry", "TEXT");
  addColumn(db, "companies", "sector_source", "TEXT");
  backfillSectors(db);

  // Databases from before index_members knew one index per company; carry
  // that over once so existing S&P imports keep their queues.
  const members = db.prepare(`SELECT COUNT(*) AS n FROM index_members`).get() as { n: number };
  if (members.n === 0) {
    db.exec(`INSERT OR IGNORE INTO index_members (index_name, ticker)
             SELECT index_name, ticker FROM universe`);
  }
}

/**
 * Fill in the classification for companies downloaded before it was stored.
 *
 * Two passes, in order of authority: what an index list already said, then
 * what SEC's SIC code implies. Both are guarded on `sector IS NULL`, so this
 * costs one indexed scan per start once it has run — and a company whose SIC
 * maps to nothing stays null rather than being guessed at again each time.
 */
function backfillSectors(db: Database.Database): void {
  db.exec(`
    UPDATE companies SET
      sector        = (SELECT u.sector       FROM universe u WHERE u.ticker = companies.ticker),
      sub_industry  = (SELECT u.sub_industry FROM universe u WHERE u.ticker = companies.ticker),
      sector_source = 'index'
    WHERE sector IS NULL
      AND EXISTS (
        SELECT 1 FROM universe u
        WHERE u.ticker = companies.ticker AND u.sector IS NOT NULL AND u.sector <> ''
      )
  `);

  const zbyvajici = db
    .prepare(
      `SELECT ticker, sic, sic_description AS sicDescription
       FROM companies
       WHERE sector IS NULL AND sic IS NOT NULL AND sic <> ''`,
    )
    .all() as { ticker: string; sic: string; sicDescription: string | null }[];
  if (zbyvajici.length === 0) return;

  const stmt = db.prepare(
    `UPDATE companies SET sector = ?, sub_industry = ?, sector_source = 'sic' WHERE ticker = ?`,
  );
  db.transaction(() => {
    for (const row of zbyvajici) {
      const sector = sectorFromSic(row.sic);
      if (sector) stmt.run(sector, row.sicDescription || null, row.ticker);
    }
  })();
}

/** Idempotent ALTER for databases created before a column existed. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

/* ------------------------------------------------------------------ */
/* kv helpers                                                          */
/* ------------------------------------------------------------------ */

export function kvGet(key: string, maxAgeMs?: number): string | null {
  const row = getDb()
    .prepare("SELECT value, updated_at FROM kv WHERE key = ?")
    .get(key) as { value: string; updated_at: string } | undefined;
  if (!row) return null;
  if (maxAgeMs !== undefined) {
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (!Number.isFinite(age) || age > maxAgeMs) return null;
  }
  return row.value;
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, new Date().toISOString());
}
