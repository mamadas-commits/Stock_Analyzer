module.exports=[85148,(e,t,r)=>{t.exports=e.x("better-sqlite3-90e2652d1716b047",()=>require("better-sqlite3-90e2652d1716b047"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},59043,(e,t,r)=>{t.exports=e.x("next/dist/server/runtime-reacts.external.js",()=>require("next/dist/server/runtime-reacts.external.js"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},2157,(e,t,r)=>{t.exports=e.x("node:fs",()=>require("node:fs"))},50227,(e,t,r)=>{t.exports=e.x("node:path",()=>require("node:path"))},81111,(e,t,r)=>{t.exports=e.x("node:stream",()=>require("node:stream"))},32933,e=>{"use strict";var t=e.i(69719),r=e.i(43793);let a=t.z.object({name:t.z.string().min(1).max(64),layout:t.z.array(t.z.unknown())});async function i(e){let t=e.nextUrl.searchParams.get("name"),a=(0,r.getDb)();if(t){let e=a.prepare("SELECT layout FROM dashboards WHERE name = ?").get(t);return Response.json({layout:e?JSON.parse(e.layout):null})}let i=a.prepare("SELECT name, updated_at AS updatedAt FROM dashboards ORDER BY updated_at DESC").all();return Response.json({dashboards:i})}async function n(e){let t;try{t=a.parse(await e.json())}catch{return Response.json({error:"Očekávám { name, layout[] }"},{status:400})}return(0,r.getDb)().prepare(`INSERT INTO dashboards (name, layout, updated_at) VALUES (?,?,?)
       ON CONFLICT(name) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`).run(t.name,JSON.stringify(t.layout),new Date().toISOString()),Response.json({ok:!0})}async function s(e){let t=e.nextUrl.searchParams.get("name");return t?((0,r.getDb)().prepare("DELETE FROM dashboards WHERE name = ?").run(t),Response.json({ok:!0})):Response.json({error:"Chybí ?name="},{status:400})}e.s(["DELETE",0,s,"GET",0,i,"POST",0,n,"dynamic",0,"force-dynamic"])},60626,e=>{"use strict";var t=e.i(47909),r=e.i(74017),a=e.i(96250),i=e.i(59756),n=e.i(61916),s=e.i(74677),o=e.i(69741),T=e.i(16795),d=e.i(87718),E=e.i(95169),c=e.i(47587),l=e.i(66012),u=e.i(70101),p=e.i(26937),N=e.i(10372),R=e.i(93695);e.i(52474);var m=e.i(220);let h=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/dashboard/route",pathname:"/api/dashboard",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/dashboard/route.ts",nextConfigOutput:"",userland:()=>e.r(32933),...{}}),{workAsyncStorage:L,workUnitAsyncStorage:f,serverHooks:I}=h;async function X(e,t,a){a.requestMeta&&(0,i.setRequestMeta)(e,a.requestMeta),h.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let L="/api/dashboard/route";L=L.replace(/\/index$/,"")||"/";let f=await h.prepare(e,t,{srcPage:L,multiZoneDraftMode:!1});if(!f)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:I,deploymentId:X,params:O,nextConfig:A,parsedUrl:S,isDraftMode:y,prerenderManifest:_,routerServerContext:C,isOnDemandRevalidate:x,revalidateOnlyGenerated:v,resolvedPathname:g,clientReferenceManifest:k,serverActionsManifest:b}=f,U=(0,o.normalizeAppPath)(L),w=!!(_.dynamicRoutes[U]||_.routes[g]),D=async()=>((null==C?void 0:C.render404)?await C.render404(e,t,S,!1):t.end("This page could not be found"),null);if(w&&!y){let e=!!_.routes[g],t=_.dynamicRoutes[U];if(t&&!1===t.fallback&&!e){if(A.adapterPath)return await D();throw new R.NoFallbackError}}let M=null;!w||h.isDev||y||(M="/index"===(M=g)?"/":M);let F=!0===h.isDev||!w,P=w&&!F;b&&k&&(0,s.setManifestsSingleton)({page:L,clientReferenceManifest:k,serverActionsManifest:b});let $=e.method||"GET",Y=(0,n.getTracer)(),H=Y.getActiveScopeSpan(),q=!!(null==C?void 0:C.isWrappedByNextServer),K=!!(0,i.getRequestMeta)(e,"minimalMode"),j=(0,i.getRequestMeta)(e,"incrementalCache")||await h.getIncrementalCache(e,A,_,K);null==j||j.resetRequestCache(),globalThis.__incrementalCache=j;let B={params:O,previewProps:_.preview,renderOpts:{experimental:{authInterrupts:!!A.experimental.authInterrupts,useCacheTimeout:A.experimental.useCacheTimeout},cacheComponents:!!A.cacheComponents,validationLevel:A.experimental.instantInsights.validationLevel,supportsDynamicResponse:F,incrementalCache:j,hmrRefreshHash:(0,i.getRequestMeta)(e,"hmrRefreshHash"),cacheLifeProfiles:A.cacheLife,staticPageGenerationTimeout:A.staticPageGenerationTimeout,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>h.onRequestError(e,t,a,i,C)},sharedContext:{buildId:I,deploymentId:X}},G=new T.NodeNextRequest(e),W=new T.NodeNextResponse(t),z=d.NextRequestAdapter.fromNodeNextRequest(G,(0,d.signalFromNodeResponse)(t)),J=async({previousCacheEntry:r})=>{try{if(!K&&x&&v&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await h.handle(z,B);e.fetchMetrics=B.renderOpts.fetchMetrics;let n=B.renderOpts.pendingWaitUntil;n&&a.waitUntil&&(a.waitUntil(n),n=void 0);let s=B.renderOpts.collectedTags;if(!w)return await (0,l.sendResponse)(G,W,i,n),null;{let e=await i.blob(),t=(0,u.toNodeOutgoingHttpHeaders)(i.headers);s&&(t[N.NEXT_CACHE_TAGS_HEADER]=s),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==B.renderOpts.collectedRevalidate&&!(B.renderOpts.collectedRevalidate>=N.INFINITE_CACHE)&&B.renderOpts.collectedRevalidate,a=void 0===B.renderOpts.collectedExpire||B.renderOpts.collectedExpire>=N.INFINITE_CACHE?!1!==r&&r>0?A.expireTime:void 0:B.renderOpts.collectedExpire;return{value:{kind:m.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await h.onRequestError(e,t,{routerKind:"App Router",routePath:L,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:x})},!1,C),t}},V=async(i,s)=>{try{var o,T;let i=await h.handleResponse({req:e,nextConfig:A,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:_,isRoutePPREnabled:!1,isOnDemandRevalidate:x,revalidateOnlyGenerated:v,responseGenerator:J,waitUntil:a.waitUntil,isMinimalMode:K});if(!w)return;if((null==i||null==(o=i.value)?void 0:o.kind)!==m.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==i||null==(T=i.value)?void 0:T.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});K||t.setHeader("x-nextjs-cache",x?"REVALIDATED":i.isMiss?"MISS":i.isStale?"STALE":"HIT"),y&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let n=(0,u.fromNodeOutgoingHttpHeaders)(i.value.headers);K&&w||n.delete(N.NEXT_CACHE_TAGS_HEADER),!i.cacheControl||t.getHeader("Cache-Control")||n.get("Cache-Control")||n.set("Cache-Control",(0,p.getCacheControlHeader)(i.cacheControl)),await (0,l.sendResponse)(G,W,new Response(i.value.body,{headers:n,status:i.value.status||200}));return}catch(t){if(t instanceof R.NoFallbackError||await h.onRequestError(e,t,{routerKind:"App Router",routePath:U,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:x})},!1,C),w)throw t;await (0,l.sendResponse)(G,W,new Response(null,{status:500}));return}finally{(()=>{if(!i)return;let e=t.statusCode;i.setAttributes({"http.status_code":e,"next.rsc":!1}),e&&e>=500&&(i.setStatus({code:n.SpanStatusCode.ERROR}),i.setAttribute("error.type",e.toString()));let r=Y.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==E.BaseServerSpan.handleRequest)return console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route")||U,o=`${$} ${a}`;i.setAttributes({"next.route":a,"http.route":a,"next.span_name":o}),i.updateName(o),s&&s!==i&&(s.setAttribute("http.route",a),s.updateName(o))})()}};if(q&&H)await V(H,void 0);else{let t=Y.getActiveScopeSpan();await Y.withPropagatedContext(e.headers,()=>Y.trace(E.BaseServerSpan.handleRequest,{spanName:`${$} ${L}`,kind:n.SpanKind.SERVER,attributes:{"http.method":$,"http.target":e.url}},e=>V(e,t)),void 0,!q)}}e.s(["handler",0,X,"patchFetch",0,function(){return(0,a.patchFetch)({workAsyncStorage:L,workUnitAsyncStorage:f})},"routeModule",0,h,"serverHooks",0,I,"workAsyncStorage",0,L,"workUnitAsyncStorage",0,f])},43793,35430,e=>{"use strict";var t=e.i(85148);let r=[[/^302\d$/,"Consumer Discretionary"],[/^283\d$/,"Health Care"],[/^284\d$/,"Consumer Staples"],[/^341\d$/,"Materials"],[/^3533$/,"Energy"],[/^357\d$/,"Information Technology"],[/^36[35]\d$/,"Consumer Discretionary"],[/^36[678]\d$/,"Information Technology"],[/^371\d$/,"Consumer Discretionary"],[/^375\d$/,"Consumer Discretionary"],[/^379\d$/,"Consumer Discretionary"],[/^3812$/,"Industrials"],[/^3823$/,"Industrials"],[/^3826$/,"Health Care"],[/^384\d$/,"Health Care"],[/^15[23]\d$/,"Consumer Discretionary"],[/^492[23]$/,"Energy"],[/^632\d$/,"Health Care"],[/^5045$/,"Information Technology"],[/^5065$/,"Information Technology"],[/^514\d$/,"Consumer Staples"],[/^5122$/,"Health Care"],[/^533\d$/,"Consumer Staples"],[/^54\d\d$/,"Consumer Staples"],[/^5912$/,"Consumer Staples"],[/^6798$/,"Real Estate"],[/^7370$/,"Communication Services"],[/^7373$/,"Industrials"],[/^731\d$/,"Communication Services"],[/^738\d$/,"Financials"],[/^751\d$/,"Industrials"],[/^8731$/,"Health Care"]],a=[[1,9,"Consumer Staples"],[10,10,"Materials"],[12,12,"Energy"],[13,13,"Energy"],[14,14,"Materials"],[15,17,"Industrials"],[20,21,"Consumer Staples"],[22,23,"Consumer Discretionary"],[24,24,"Materials"],[25,25,"Consumer Discretionary"],[26,26,"Materials"],[27,27,"Communication Services"],[28,28,"Materials"],[29,29,"Energy"],[30,30,"Materials"],[31,31,"Consumer Discretionary"],[32,33,"Materials"],[34,35,"Industrials"],[36,36,"Industrials"],[37,37,"Industrials"],[38,38,"Information Technology"],[39,39,"Consumer Discretionary"],[40,47,"Industrials"],[48,48,"Communication Services"],[49,49,"Utilities"],[50,51,"Industrials"],[52,59,"Consumer Discretionary"],[60,64,"Financials"],[65,66,"Real Estate"],[67,67,"Financials"],[70,70,"Consumer Discretionary"],[72,73,"Information Technology"],[75,76,"Consumer Discretionary"],[78,78,"Communication Services"],[79,79,"Communication Services"],[80,80,"Health Care"],[82,82,"Consumer Discretionary"],[83,83,"Health Care"],[87,87,"Industrials"]];function i(e){let t=(e??"").trim();if(!/^\d{3,4}$/.test(t))return null;let i=t.padStart(4,"0");for(let[e,t]of r)if(e.test(i))return t;let n=Number(i.slice(0,2));for(let[e,t,r]of a)if(n>=e&&n<=t)return r;return null}e.s(["sectorFromSic",0,i],35430);var n=e.i(2157),s=e.i(50227);let o=null;function T(){var e;let r;if(o)return o;let a=(r=process.env.DATABASE_PATH||"data/stocks.db",s.default.isAbsolute(r)?r:s.default.join(process.cwd(),r));n.default.mkdirSync(s.default.dirname(a),{recursive:!0});let T=new t.default(a);return T.pragma("journal_mode = WAL"),T.pragma("synchronous = NORMAL"),T.pragma("foreign_keys = ON"),(e=T).exec(`
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
  `),d(e,"companies","price_resolution","TEXT"),d(e,"splits","source","TEXT"),d(e,"splits","exact","INTEGER"),d(e,"filings","primary_document","TEXT"),d(e,"filings","doc_url","TEXT"),d(e,"filings","stored_path","TEXT"),d(e,"filings","stored_bytes","INTEGER"),d(e,"filings","stored_at","TEXT"),d(e,"financials","first_filed","TEXT"),d(e,"companies","sector","TEXT"),d(e,"companies","sub_industry","TEXT"),d(e,"companies","sector_source","TEXT"),function(e){e.exec(`
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
       WHERE sector IS NULL AND sic IS NOT NULL AND sic <> ''`).all();if(0===t.length)return;let r=e.prepare("UPDATE companies SET sector = ?, sub_industry = ?, sector_source = 'sic' WHERE ticker = ?");e.transaction(()=>{for(let e of t){let t=i(e.sic);t&&r.run(t,e.sicDescription||null,e.ticker)}})()}(e),0===e.prepare("SELECT COUNT(*) AS n FROM index_members").get().n&&e.exec(`INSERT OR IGNORE INTO index_members (index_name, ticker)
             SELECT index_name, ticker FROM universe`),o=T,T}function d(e,t,r,a){e.prepare(`PRAGMA table_info(${t})`).all().some(e=>e.name===r)||e.exec(`ALTER TABLE ${t} ADD COLUMN ${r} ${a}`)}e.s(["getDb",0,T,"kvGet",0,function(e,t){let r=T().prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(e);if(!r)return null;if(void 0!==t){let e=Date.now()-new Date(r.updated_at).getTime();if(!Number.isFinite(e)||e>t)return null}return r.value},"kvSet",0,function(e,t){T().prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(e,t,new Date().toISOString())}],43793)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__02by4_8._.js.map