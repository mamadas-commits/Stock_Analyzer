module.exports=[85148,(e,t,r)=>{t.exports=e.x("better-sqlite3-90e2652d1716b047",()=>require("better-sqlite3-90e2652d1716b047"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},59043,(e,t,r)=>{t.exports=e.x("next/dist/server/runtime-reacts.external.js",()=>require("next/dist/server/runtime-reacts.external.js"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},2157,(e,t,r)=>{t.exports=e.x("node:fs",()=>require("node:fs"))},50227,(e,t,r)=>{t.exports=e.x("node:path",()=>require("node:path"))},81111,(e,t,r)=>{t.exports=e.x("node:stream",()=>require("node:stream"))},43793,35430,e=>{"use strict";var t=e.i(85148);let r=[[/^302\d$/,"Consumer Discretionary"],[/^283\d$/,"Health Care"],[/^284\d$/,"Consumer Staples"],[/^341\d$/,"Materials"],[/^3533$/,"Energy"],[/^357\d$/,"Information Technology"],[/^36[35]\d$/,"Consumer Discretionary"],[/^36[678]\d$/,"Information Technology"],[/^371\d$/,"Consumer Discretionary"],[/^375\d$/,"Consumer Discretionary"],[/^379\d$/,"Consumer Discretionary"],[/^3812$/,"Industrials"],[/^3823$/,"Industrials"],[/^3826$/,"Health Care"],[/^384\d$/,"Health Care"],[/^15[23]\d$/,"Consumer Discretionary"],[/^492[23]$/,"Energy"],[/^632\d$/,"Health Care"],[/^5045$/,"Information Technology"],[/^5065$/,"Information Technology"],[/^514\d$/,"Consumer Staples"],[/^5122$/,"Health Care"],[/^533\d$/,"Consumer Staples"],[/^54\d\d$/,"Consumer Staples"],[/^5912$/,"Consumer Staples"],[/^6798$/,"Real Estate"],[/^7370$/,"Communication Services"],[/^7373$/,"Industrials"],[/^731\d$/,"Communication Services"],[/^738\d$/,"Financials"],[/^751\d$/,"Industrials"],[/^8731$/,"Health Care"]],i=[[1,9,"Consumer Staples"],[10,10,"Materials"],[12,12,"Energy"],[13,13,"Energy"],[14,14,"Materials"],[15,17,"Industrials"],[20,21,"Consumer Staples"],[22,23,"Consumer Discretionary"],[24,24,"Materials"],[25,25,"Consumer Discretionary"],[26,26,"Materials"],[27,27,"Communication Services"],[28,28,"Materials"],[29,29,"Energy"],[30,30,"Materials"],[31,31,"Consumer Discretionary"],[32,33,"Materials"],[34,35,"Industrials"],[36,36,"Industrials"],[37,37,"Industrials"],[38,38,"Information Technology"],[39,39,"Consumer Discretionary"],[40,47,"Industrials"],[48,48,"Communication Services"],[49,49,"Utilities"],[50,51,"Industrials"],[52,59,"Consumer Discretionary"],[60,64,"Financials"],[65,66,"Real Estate"],[67,67,"Financials"],[70,70,"Consumer Discretionary"],[72,73,"Information Technology"],[75,76,"Consumer Discretionary"],[78,78,"Communication Services"],[79,79,"Communication Services"],[80,80,"Health Care"],[82,82,"Consumer Discretionary"],[83,83,"Health Care"],[87,87,"Industrials"]];function s(e){let t=(e??"").trim();if(!/^\d{3,4}$/.test(t))return null;let s=t.padStart(4,"0");for(let[e,t]of r)if(e.test(s))return t;let n=Number(s.slice(0,2));for(let[e,t,r]of i)if(n>=e&&n<=t)return r;return null}e.s(["sectorFromSic",0,s],35430);var n=e.i(2157),a=e.i(50227);let T=null;function o(){var e;let r;if(T)return T;let i=(r=process.env.DATABASE_PATH||"data/stocks.db",a.default.isAbsolute(r)?r:a.default.join(process.cwd(),r));n.default.mkdirSync(a.default.dirname(i),{recursive:!0});let o=new t.default(i);return o.pragma("journal_mode = WAL"),o.pragma("synchronous = NORMAL"),o.pragma("foreign_keys = ON"),(e=o).exec(`
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
      verdict        TEXT,                -- potvrzeno | zam\xedtnuto
      verdict_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_risk_scenarios_run ON risk_scenarios (run_id, ordinal);

    -- Cache for the SEC ticker->CIK directory so we hit EDGAR once per day.
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `),E(e,"companies","price_resolution","TEXT"),E(e,"splits","source","TEXT"),E(e,"splits","exact","INTEGER"),E(e,"filings","primary_document","TEXT"),E(e,"filings","doc_url","TEXT"),E(e,"filings","stored_path","TEXT"),E(e,"filings","stored_bytes","INTEGER"),E(e,"filings","stored_at","TEXT"),E(e,"financials","first_filed","TEXT"),E(e,"companies","sector","TEXT"),E(e,"companies","sub_industry","TEXT"),E(e,"companies","sector_source","TEXT"),function(e){e.exec(`
    UPDATE companies SET
      sector        = (SELECT u.sector       FROM universe u WHERE u.ticker = companies.ticker),
      sub_industry  = (SELECT u.sub_industry FROM universe u WHERE u.ticker = companies.ticker),
      sector_source = 'index'
    WHERE sector IS NULL
      AND EXISTS (
        SELECT 1 FROM universe u
        WHERE u.ticker = companies.ticker AND u.sector IS NOT NULL AND u.sector <> ''
      )
  `);let t=e.prepare(`SELECT ticker, sic, sic_description AS sicDescription
       FROM companies
       WHERE sector IS NULL AND sic IS NOT NULL AND sic <> ''`).all();if(0===t.length)return;let r=e.prepare("UPDATE companies SET sector = ?, sub_industry = ?, sector_source = 'sic' WHERE ticker = ?");e.transaction(()=>{for(let e of t){let t=s(e.sic);t&&r.run(t,e.sicDescription||null,e.ticker)}})()}(e),0===e.prepare("SELECT COUNT(*) AS n FROM index_members").get().n&&e.exec(`INSERT OR IGNORE INTO index_members (index_name, ticker)
             SELECT index_name, ticker FROM universe`),T=o,o}function E(e,t,r,i){e.prepare(`PRAGMA table_info(${t})`).all().some(e=>e.name===r)||e.exec(`ALTER TABLE ${t} ADD COLUMN ${r} ${i}`)}e.s(["getDb",0,o,"kvGet",0,function(e,t){let r=o().prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(e);if(!r)return null;if(void 0!==t){let e=Date.now()-new Date(r.updated_at).getTime();if(!Number.isFinite(e)||e>t)return null}return r.value},"kvSet",0,function(e,t){o().prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(e,t,new Date().toISOString())}],43793)},19965,e=>{"use strict";var t=e.i(2157),r=e.i(50227);function i(){return r.default.join(process.env.STOCKS_HOME?.trim()||process.cwd(),".env.local")}let s=null;function n(e){return/[\s#"'`$]/.test(e)?`"${e.replace(/"/g,'\\"')}"`:e}e.s(["SECRET_KEYS",0,["SEC_USER_AGENT","TIINGO_API_KEY","ALPHAVANTAGE_API_KEY","CLAUDE_BIN"],"envFilePath",0,i,"getSecret",0,function(e){let r=(function(){try{let e=t.default.statSync(i());if(s&&s.mtimeMs===e.mtimeMs&&s.size===e.size)return s.values;let r=function(e){let t={};for(let r of e.split(/\r?\n/)){let e=r.trim();if(!e||e.startsWith("#"))continue;let i=e.indexOf("=");if(i<1)continue;let s=e.slice(0,i).trim(),n=e.slice(i+1).trim();(n.startsWith('"')&&n.endsWith('"')&&n.length>1||n.startsWith("'")&&n.endsWith("'")&&n.length>1)&&(n=n.slice(1,-1)),t[s]=n}return t}(t.default.readFileSync(i(),"utf8"));return s={mtimeMs:e.mtimeMs,size:e.size,values:r},r}catch{return s=null,{}}})()[e]?.trim();return r||process.env[e]?.trim()||void 0},"isPackaged",0,function(){return!!process.env.STOCKS_HOME?.trim()},"writeSecrets",0,function(e){let r=i(),a=t.default.existsSync(r)?t.default.readFileSync(r,"utf8"):"",T=a?a.split(/\r?\n/):[],o=new Set(Object.keys(e)),E=new Set,c=T.filter(t=>{let r=t.trim().startsWith("#")?-1:t.indexOf("=");if(r<1)return!0;let i=t.slice(0,r).trim();return!o.has(i)||!!e[i]?.trim()&&(E.add(i),!0)}).map(t=>{let r=t.trim().startsWith("#")?-1:t.indexOf("=");if(r<1)return t;let i=t.slice(0,r).trim();return E.has(i)?`${i}=${n(e[i].trim())}`:t});for(let[t,r]of Object.entries(e)){let e=r?.trim();!e||E.has(t)||c.push(`${t}=${n(e)}`)}let d=c.join("\n").replace(/\n{3,}$/,"\n\n").trimEnd()+"\n";t.default.writeFileSync(r,d,{mode:384});try{t.default.chmodSync(r,384)}catch{}s=null}])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__04xozci._.js.map