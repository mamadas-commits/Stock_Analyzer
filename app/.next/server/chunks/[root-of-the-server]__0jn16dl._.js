module.exports=[85148,(e,t,r)=>{t.exports=e.x("better-sqlite3-90e2652d1716b047",()=>require("better-sqlite3-90e2652d1716b047"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},59043,(e,t,r)=>{t.exports=e.x("next/dist/server/runtime-reacts.external.js",()=>require("next/dist/server/runtime-reacts.external.js"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},2157,(e,t,r)=>{t.exports=e.x("node:fs",()=>require("node:fs"))},50227,(e,t,r)=>{t.exports=e.x("node:path",()=>require("node:path"))},81111,(e,t,r)=>{t.exports=e.x("node:stream",()=>require("node:stream"))},82824,e=>{"use strict";var t=e.i(43793);async function r(){let e=(0,t.getDb)().prepare(`SELECT c.ticker, c.name, c.cik, c.exchange, c.currency, c.price_source, c.updated_at,
              c.sector, c.sub_industry,
              (SELECT COUNT(*) FROM prices p WHERE p.ticker = c.ticker)   AS price_count,
              (SELECT MIN(date) FROM prices p WHERE p.ticker = c.ticker)  AS price_from,
              (SELECT MAX(date) FROM prices p WHERE p.ticker = c.ticker)  AS price_to,
              (SELECT COUNT(*) FROM financials f WHERE f.ticker = c.ticker) AS metric_count,
              (SELECT COUNT(*) FROM filings g WHERE g.ticker = c.ticker)  AS filing_count
       FROM companies c
       ORDER BY c.ticker`).all();return Response.json({tickers:e.map(e=>({ticker:e.ticker,name:e.name,cik:e.cik,exchange:e.exchange,currency:e.currency,priceSource:e.price_source,sector:e.sector,subIndustry:e.sub_industry,updatedAt:e.updated_at,priceCount:e.price_count,priceFrom:e.price_from,priceTo:e.price_to,metricCount:e.metric_count,filingCount:e.filing_count}))})}async function i(e){let r=e.nextUrl.searchParams.get("ticker")?.toUpperCase();if(!r)return Response.json({error:"Chybí ?ticker="},{status:400});let i=(0,t.getDb)();return i.transaction(()=>{for(let e of["prices","dividends","splits","facts","financials","filings"])i.prepare(`DELETE FROM ${e} WHERE ticker = ?`).run(r);i.prepare("DELETE FROM companies WHERE ticker = ?").run(r)})(),Response.json({ok:!0,ticker:r})}e.s(["DELETE",0,i,"GET",0,r,"dynamic",0,"force-dynamic"])},54486,e=>{"use strict";var t=e.i(47909),r=e.i(74017),i=e.i(96250),a=e.i(59756),n=e.i(61916),s=e.i(74677),o=e.i(69741),c=e.i(16795),T=e.i(87718),E=e.i(95169),d=e.i(47587),l=e.i(66012),u=e.i(70101),p=e.i(26937),N=e.i(10372),R=e.i(93695);e.i(52474);var m=e.i(220);let L=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/tickers/route",pathname:"/api/tickers",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/tickers/route.ts",nextConfigOutput:"",userland:()=>e.r(82824),...{}}),{workAsyncStorage:h,workUnitAsyncStorage:f,serverHooks:A}=L;async function X(e,t,i){i.requestMeta&&(0,a.setRequestMeta)(e,i.requestMeta),L.isDev&&(0,a.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/tickers/route";h=h.replace(/\/index$/,"")||"/";let f=await L.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!f)return t.statusCode=400,t.end("Bad Request"),null==i.waitUntil||i.waitUntil.call(i,Promise.resolve()),null;let{buildId:A,deploymentId:X,params:I,nextConfig:_,parsedUrl:O,isDraftMode:S,prerenderManifest:C,routerServerContext:y,isOnDemandRevalidate:k,revalidateOnlyGenerated:v,resolvedPathname:x,clientReferenceManifest:g,serverActionsManifest:U}=f,b=(0,o.normalizeAppPath)(h),w=!!(C.dynamicRoutes[b]||C.routes[x]),D=async()=>((null==y?void 0:y.render404)?await y.render404(e,t,O,!1):t.end("This page could not be found"),null);if(w&&!S){let e=!!C.routes[x],t=C.dynamicRoutes[b];if(t&&!1===t.fallback&&!e){if(_.adapterPath)return await D();throw new R.NoFallbackError}}let M=null;!w||L.isDev||S||(M="/index"===(M=x)?"/":M);let F=!0===L.isDev||!w,P=w&&!F;U&&g&&(0,s.setManifestsSingleton)({page:h,clientReferenceManifest:g,serverActionsManifest:U});let $=e.method||"GET",H=(0,n.getTracer)(),Y=H.getActiveScopeSpan(),q=!!(null==y?void 0:y.isWrappedByNextServer),K=!!(0,a.getRequestMeta)(e,"minimalMode"),B=(0,a.getRequestMeta)(e,"incrementalCache")||await L.getIncrementalCache(e,_,C,K);null==B||B.resetRequestCache(),globalThis.__incrementalCache=B;let G={params:I,previewProps:C.preview,renderOpts:{experimental:{authInterrupts:!!_.experimental.authInterrupts,useCacheTimeout:_.experimental.useCacheTimeout},cacheComponents:!!_.cacheComponents,validationLevel:_.experimental.instantInsights.validationLevel,supportsDynamicResponse:F,incrementalCache:B,hmrRefreshHash:(0,a.getRequestMeta)(e,"hmrRefreshHash"),cacheLifeProfiles:_.cacheLife,staticPageGenerationTimeout:_.staticPageGenerationTimeout,waitUntil:i.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,i,a)=>L.onRequestError(e,t,i,a,y)},sharedContext:{buildId:A,deploymentId:X}},j=new c.NodeNextRequest(e),W=new c.NodeNextResponse(t),z=T.NextRequestAdapter.fromNodeNextRequest(j,(0,T.signalFromNodeResponse)(t)),J=async({previousCacheEntry:r})=>{try{if(!K&&k&&v&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let a=await L.handle(z,G);e.fetchMetrics=G.renderOpts.fetchMetrics;let n=G.renderOpts.pendingWaitUntil;n&&i.waitUntil&&(i.waitUntil(n),n=void 0);let s=G.renderOpts.collectedTags;if(!w)return await (0,l.sendResponse)(j,W,a,n),null;{let e=await a.blob(),t=(0,u.toNodeOutgoingHttpHeaders)(a.headers);s&&(t[N.NEXT_CACHE_TAGS_HEADER]=s),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==G.renderOpts.collectedRevalidate&&!(G.renderOpts.collectedRevalidate>=N.INFINITE_CACHE)&&G.renderOpts.collectedRevalidate,i=void 0===G.renderOpts.collectedExpire||G.renderOpts.collectedExpire>=N.INFINITE_CACHE?!1!==r&&r>0?_.expireTime:void 0:G.renderOpts.collectedExpire;return{value:{kind:m.CachedRouteKind.APP_ROUTE,status:a.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:i}}}}catch(t){throw(null==r?void 0:r.isStale)&&await L.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:k})},!1,y),t}},V=async(a,s)=>{try{var o,c;let a=await L.handleResponse({req:e,nextConfig:_,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:C,isRoutePPREnabled:!1,isOnDemandRevalidate:k,revalidateOnlyGenerated:v,responseGenerator:J,waitUntil:i.waitUntil,isMinimalMode:K});if(!w)return;if((null==a||null==(o=a.value)?void 0:o.kind)!==m.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==a||null==(c=a.value)?void 0:c.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});K||t.setHeader("x-nextjs-cache",k?"REVALIDATED":a.isMiss?"MISS":a.isStale?"STALE":"HIT"),S&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let n=(0,u.fromNodeOutgoingHttpHeaders)(a.value.headers);K&&w||n.delete(N.NEXT_CACHE_TAGS_HEADER),!a.cacheControl||t.getHeader("Cache-Control")||n.get("Cache-Control")||n.set("Cache-Control",(0,p.getCacheControlHeader)(a.cacheControl)),await (0,l.sendResponse)(j,W,new Response(a.value.body,{headers:n,status:a.value.status||200}));return}catch(t){if(t instanceof R.NoFallbackError||await L.onRequestError(e,t,{routerKind:"App Router",routePath:b,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:k})},!1,y),w)throw t;await (0,l.sendResponse)(j,W,new Response(null,{status:500}));return}finally{(()=>{if(!a)return;let e=t.statusCode;a.setAttributes({"http.status_code":e,"next.rsc":!1}),e&&e>=500&&(a.setStatus({code:n.SpanStatusCode.ERROR}),a.setAttribute("error.type",e.toString()));let r=H.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==E.BaseServerSpan.handleRequest)return console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let i=r.get("next.route")||b,o=`${$} ${i}`;a.setAttributes({"next.route":i,"http.route":i,"next.span_name":o}),a.updateName(o),s&&s!==a&&(s.setAttribute("http.route",i),s.updateName(o))})()}};if(q&&Y)await V(Y,void 0);else{let t=H.getActiveScopeSpan();await H.withPropagatedContext(e.headers,()=>H.trace(E.BaseServerSpan.handleRequest,{spanName:`${$} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":$,"http.target":e.url}},e=>V(e,t)),void 0,!q)}}e.s(["handler",0,X,"patchFetch",0,function(){return(0,i.patchFetch)({workAsyncStorage:h,workUnitAsyncStorage:f})},"routeModule",0,L,"serverHooks",0,A,"workAsyncStorage",0,h,"workUnitAsyncStorage",0,f])},43793,35430,e=>{"use strict";var t=e.i(85148);let r=[[/^302\d$/,"Consumer Discretionary"],[/^283\d$/,"Health Care"],[/^284\d$/,"Consumer Staples"],[/^341\d$/,"Materials"],[/^3533$/,"Energy"],[/^357\d$/,"Information Technology"],[/^36[35]\d$/,"Consumer Discretionary"],[/^36[678]\d$/,"Information Technology"],[/^371\d$/,"Consumer Discretionary"],[/^375\d$/,"Consumer Discretionary"],[/^379\d$/,"Consumer Discretionary"],[/^3812$/,"Industrials"],[/^3823$/,"Industrials"],[/^3826$/,"Health Care"],[/^384\d$/,"Health Care"],[/^15[23]\d$/,"Consumer Discretionary"],[/^492[23]$/,"Energy"],[/^632\d$/,"Health Care"],[/^5045$/,"Information Technology"],[/^5065$/,"Information Technology"],[/^514\d$/,"Consumer Staples"],[/^5122$/,"Health Care"],[/^533\d$/,"Consumer Staples"],[/^54\d\d$/,"Consumer Staples"],[/^5912$/,"Consumer Staples"],[/^6798$/,"Real Estate"],[/^7370$/,"Communication Services"],[/^7373$/,"Industrials"],[/^731\d$/,"Communication Services"],[/^738\d$/,"Financials"],[/^751\d$/,"Industrials"],[/^8731$/,"Health Care"]],i=[[1,9,"Consumer Staples"],[10,10,"Materials"],[12,12,"Energy"],[13,13,"Energy"],[14,14,"Materials"],[15,17,"Industrials"],[20,21,"Consumer Staples"],[22,23,"Consumer Discretionary"],[24,24,"Materials"],[25,25,"Consumer Discretionary"],[26,26,"Materials"],[27,27,"Communication Services"],[28,28,"Materials"],[29,29,"Energy"],[30,30,"Materials"],[31,31,"Consumer Discretionary"],[32,33,"Materials"],[34,35,"Industrials"],[36,36,"Industrials"],[37,37,"Industrials"],[38,38,"Information Technology"],[39,39,"Consumer Discretionary"],[40,47,"Industrials"],[48,48,"Communication Services"],[49,49,"Utilities"],[50,51,"Industrials"],[52,59,"Consumer Discretionary"],[60,64,"Financials"],[65,66,"Real Estate"],[67,67,"Financials"],[70,70,"Consumer Discretionary"],[72,73,"Information Technology"],[75,76,"Consumer Discretionary"],[78,78,"Communication Services"],[79,79,"Communication Services"],[80,80,"Health Care"],[82,82,"Consumer Discretionary"],[83,83,"Health Care"],[87,87,"Industrials"]];function a(e){let t=(e??"").trim();if(!/^\d{3,4}$/.test(t))return null;let a=t.padStart(4,"0");for(let[e,t]of r)if(e.test(a))return t;let n=Number(a.slice(0,2));for(let[e,t,r]of i)if(n>=e&&n<=t)return r;return null}e.s(["sectorFromSic",0,a],35430);var n=e.i(2157),s=e.i(50227);let o=null;function c(){var e;let r;if(o)return o;let i=(r=process.env.DATABASE_PATH||"data/stocks.db",s.default.isAbsolute(r)?r:s.default.join(process.cwd(),r));n.default.mkdirSync(s.default.dirname(i),{recursive:!0});let c=new t.default(i);return c.pragma("journal_mode = WAL"),c.pragma("synchronous = NORMAL"),c.pragma("foreign_keys = ON"),(e=c).exec(`
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
  `),T(e,"companies","price_resolution","TEXT"),T(e,"splits","source","TEXT"),T(e,"splits","exact","INTEGER"),T(e,"filings","primary_document","TEXT"),T(e,"filings","doc_url","TEXT"),T(e,"filings","stored_path","TEXT"),T(e,"filings","stored_bytes","INTEGER"),T(e,"filings","stored_at","TEXT"),T(e,"financials","first_filed","TEXT"),T(e,"companies","sector","TEXT"),T(e,"companies","sub_industry","TEXT"),T(e,"companies","sector_source","TEXT"),function(e){e.exec(`
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
       WHERE sector IS NULL AND sic IS NOT NULL AND sic <> ''`).all();if(0===t.length)return;let r=e.prepare("UPDATE companies SET sector = ?, sub_industry = ?, sector_source = 'sic' WHERE ticker = ?");e.transaction(()=>{for(let e of t){let t=a(e.sic);t&&r.run(t,e.sicDescription||null,e.ticker)}})()}(e),0===e.prepare("SELECT COUNT(*) AS n FROM index_members").get().n&&e.exec(`INSERT OR IGNORE INTO index_members (index_name, ticker)
             SELECT index_name, ticker FROM universe`),o=c,c}function T(e,t,r,i){e.prepare(`PRAGMA table_info(${t})`).all().some(e=>e.name===r)||e.exec(`ALTER TABLE ${t} ADD COLUMN ${r} ${i}`)}e.s(["getDb",0,c,"kvGet",0,function(e,t){let r=c().prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(e);if(!r)return null;if(void 0!==t){let e=Date.now()-new Date(r.updated_at).getTime();if(!Number.isFinite(e)||e>t)return null}return r.value},"kvSet",0,function(e,t){c().prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(e,t,new Date().toISOString())}],43793)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0jn16dl._.js.map