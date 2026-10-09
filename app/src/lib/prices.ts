import { getDb, kvGet, kvSet } from "./db";
import type { CorporateAction, PriceBar } from "./types";
import { getSecret } from "./secrets";

/**
 * Price history at daily, weekly or monthly resolution.
 *
 * Yahoo Finance is tried first — no key, full history back to a stock's first
 * trading day — but it rate-limits hard by IP, so every request is retried with
 * backoff and then handed to whichever keyed provider is configured.
 *
 * On a free Alpha Vantage key the *weekly* and *monthly* endpoints are the only
 * ones that return a full archive; daily is capped at 100 sessions. That is why
 * weekly is the app's default resolution.
 */

/** Bar size. Weekly is the pragmatic default: it is the one free source that
 *  reliably returns decades of history in a single request. */
export type Resolution = "daily" | "weekly" | "monthly";

export const PERIODS_PER_YEAR: Record<Resolution, number> = {
  daily: 252,
  weekly: 52,
  monthly: 12,
};

/*
 * Deliberately bare. Since September 2026 Yahoo answers a full Chrome UA
 * string with HTTP 429 on every request — presumably because the rest of the
 * request (TLS, headers) does not look like Chrome — while "Mozilla/5.0"
 * alone goes through. Measured side by side, six times out of six.
 */
const BROWSER_UA = "Mozilla/5.0";

/**
 * Yahoo hands out a session cookie plus a matching "crumb" token. Anonymous
 * requests are throttled far more aggressively than ones carrying a session,
 * so we establish one lazily and reuse it for the whole process.
 */
let yahooSession: { cookie: string; crumb: string } | null = null;
let yahooSessionAttempted = false;

/*
 * Circuit breaker.
 *
 * When Yahoo is throttling this address, every ticker would otherwise spend the
 * full retry ladder (~45 s) before falling through to a keyed provider. During a
 * batch of ten companies that is minutes of waiting for a result already known.
 * After repeated throttling we skip Yahoo outright for a while and go straight
 * to the fallback; the window is short so a lifted limit is picked up again.
 */
const YAHOO_TRIP_AFTER = 2;
const YAHOO_COOLDOWN_MS = 10 * 60 * 1000;
let yahooFailures = 0;
let yahooBlockedUntil = 0;

/**
 * Ticker as the price providers spell it.
 *
 * Share classes are written with a dot by SEC and by the index list — `BRK.B`,
 * `BF.B` — and with a hyphen by every price feed we use. Left untranslated the
 * request simply 404s, which reads as "no such company" rather than "wrong
 * punctuation", so it is worth doing in one place.
 */
export function providerSymbol(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

/** Is any keyed provider configured and not known to be out of quota? */
function hasUsableFallback(): boolean {
  if (getSecret("TIINGO_API_KEY") && tiingoCooldownMinutes() === 0) return true;
  if (getSecret("ALPHAVANTAGE_API_KEY") && !alphaVantageExhausted()) return true;
  return false;
}

function yahooIsTripped(): boolean {
  return Date.now() < yahooBlockedUntil;
}

function noteYahooOutcome(throttled: boolean): void {
  if (!throttled) {
    yahooFailures = 0;
    yahooBlockedUntil = 0;
    return;
  }
  yahooFailures++;
  if (yahooFailures >= YAHOO_TRIP_AFTER) {
    yahooBlockedUntil = Date.now() + YAHOO_COOLDOWN_MS;
  }
}

/** Minutes left before Yahoo is tried again. */
export function yahooCooldownMinutes(): number {
  return yahooIsTripped() ? Math.ceil((yahooBlockedUntil - Date.now()) / 60000) : 0;
}

/**
 * Alpha Vantage's free tier allows 25 calls a day. Once it says the quota is
 * gone, every further call is a wasted round trip, so remember it until the
 * quota resets (their day rolls over at midnight US Eastern; we simply hold the
 * flag for a few hours, which is close enough and self-healing).
 */
let alphaExhaustedUntil = 0;

export function alphaVantageExhausted(): boolean {
  return Date.now() < alphaExhaustedUntil;
}

function noteAlphaExhausted(): void {
  alphaExhaustedUntil = Date.now() + 3 * 60 * 60 * 1000;
}

/**
 * Tiingo's free tier caps requests per hour (not just unique symbols per
 * month). Hitting it mid-run is normal when downloading a whole index, so the
 * limit is remembered and the provider is skipped until the hour rolls over
 * instead of being asked again for every remaining company.
 */
let tiingoBlockedUntil = 0;

export function tiingoCooldownMinutes(): number {
  return Date.now() < tiingoBlockedUntil
    ? Math.ceil((tiingoBlockedUntil - Date.now()) / 60000)
    : 0;
}

/**
 * The monthly symbol allowance does not refill on a rolling window — it resets
 * on the first of the month. Re-probing every 20 minutes until then would be
 * hundreds of pointless requests, so back off until midnight of the first.
 */
function noteTiingoMonthlyExhausted(): void {
  const now = new Date();
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  tiingoBlockedUntil = Math.max(tiingoBlockedUntil, reset);
}

function noteTiingoThrottled(): void {
  // Shorter than the nominal hour: the allowance refills on a rolling window,
  // so re-probing every 20 minutes catches the reset instead of idling until
  // the full hour is up. One wasted probe per window is a fair trade.
  tiingoBlockedUntil = Date.now() + 20 * 60 * 1000;
}

async function getYahooSession(): Promise<{ cookie: string; crumb: string } | null> {
  if (yahooSession) return yahooSession;
  if (yahooSessionAttempted) return null;
  yahooSessionAttempted = true;

  try {
    const seed = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": BROWSER_UA },
      redirect: "manual",
      cache: "no-store",
    });
    const raw = seed.headers.getSetCookie?.() ?? [];
    const cookie = raw
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
    if (!cookie) return null;

    const res = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": BROWSER_UA, Cookie: cookie, Accept: "text/plain" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const crumb = (await res.text()).trim();
    // A throttled response comes back as prose rather than a token.
    if (!crumb || crumb.length > 32 || /\s/.test(crumb)) return null;

    yahooSession = { cookie, crumb };
    return yahooSession;
  } catch {
    return null;
  }
}

export type PriceFetchResult = {
  source: string;
  bars: PriceBar[];
  dividends: CorporateAction[];
  splits: (CorporateAction & { label?: string })[];
  /** Set when the provider capped the history (e.g. a free tier's 100-day window). */
  limitedHistory?: string;
  meta: {
    currency?: string | null;
    exchange?: string | null;
    name?: string | null;
    firstTradeDate?: string | null;
  };
};

function isoDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Yahoo Finance                                                       */
/* ------------------------------------------------------------------ */

type YahooResult = {
  meta: Record<string, unknown>;
  timestamp?: number[];
  events?: {
    dividends?: Record<string, { amount: number; date: number }>;
    splits?: Record<
      string,
      { date: number; numerator: number; denominator: number; splitRatio: string }
    >;
  };
  indicators: {
    quote?: [
      {
        open?: (number | null)[];
        high?: (number | null)[];
        low?: (number | null)[];
        close?: (number | null)[];
        volume?: (number | null)[];
      },
    ];
    adjclose?: [{ adjclose?: (number | null)[] }];
  };
};

type YahooChart = {
  chart: {
    error: { code: string; description: string } | null;
    result: YahooResult[] | null;
  };
};

const YAHOO_INTERVAL: Record<Resolution, string> = {
  daily: "1d",
  weekly: "1wk",
  monthly: "1mo",
};

async function yahooChartRequest(
  symbol: string,
  period1: number,
  period2: number,
  resolution: Resolution = "daily",
  /** Rounds against throttling; a caller for whom Yahoo is optional takes 1. */
  attempts = 8,
): Promise<YahooResult> {
  const interval = YAHOO_INTERVAL[resolution];
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  let lastError = "";

  // Yahoo's throttling is intermittent rather than a clean window — individual
  // requests slip through while neighbours get 429. Since the whole history now
  // costs a single request, it is worth waiting out several rounds.
  const ATTEMPTS = attempts;
  const backoff = (n: number) => Math.min(8000, 700 * 2 ** n);

  // Skipping Yahoo only saves time when something else can actually serve the
  // request. With no usable fallback left, skipping guarantees no prices at
  // all — so in that case we try anyway, however likely the throttle.
  if (yahooIsTripped() && hasUsableFallback()) {
    throw new Error(
      `Yahoo přeskočeno — opakovaně limitovalo, další pokus za ${yahooCooldownMinutes()} min`,
    );
  }

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const host = hosts[attempt % hosts.length];
    const session = await getYahooSession();
    const url =
      `https://${host}/v8/finance/chart/${encodeURIComponent(providerSymbol(symbol))}` +
      `?period1=${period1}&period2=${period2}&interval=${interval}&events=div%2Csplit&includeAdjustedClose=true` +
      (session ? `&crumb=${encodeURIComponent(session.crumb)}` : "");

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
          ...(session ? { Cookie: session.cookie } : {}),
        },
        cache: "no-store",
      });
    } catch (e) {
      lastError = `síťová chyba: ${(e as Error).message}`;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 429 || res.status === 999 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 404) throw new Error(`Yahoo nezná symbol ${symbol}`);

    const text = await res.text();
    let json: YahooChart;
    try {
      json = JSON.parse(text) as YahooChart;
    } catch {
      // Yahoo returns plain-text "Too Many Requests" bodies with a 200 sometimes.
      lastError = text.slice(0, 80);
      await sleep(backoff(attempt));
      continue;
    }

    if (json.chart?.error) throw new Error(`Yahoo: ${json.chart.error.description}`);
    const result = json.chart?.result?.[0];
    if (!result) {
      lastError = "prázdná odpověď";
      await sleep(backoff(attempt));
      continue;
    }

    // Yahoo silently downgrades granularity when it throttles a request
    // (e.g. returns 3-month bars for a daily range). Treat that as a failure.
    const granularity = result.meta?.dataGranularity;
    if (typeof granularity === "string" && granularity !== interval) {
      lastError = `degradovaná granularita ${granularity}`;
      await sleep(backoff(attempt));
      continue;
    }

    noteYahooOutcome(false);
    return result;
  }

  noteYahooOutcome(true);
  throw new Error(`Yahoo nedostupné po ${ATTEMPTS} pokusech (${lastError})`);
}

/** Fold one or more chart responses into a single deduplicated result. */
function collectBars(chunks: YahooResult[], firstTrade: number): PriceFetchResult {
  const bars = new Map<string, PriceBar>();
  const dividends = new Map<string, number>();
  const splits = new Map<string, { value: number; label?: string }>();

  let currency: string | null = null;
  let exchange: string | null = null;
  let name: string | null = null;

  for (const chunk of chunks) {
    currency ??= (chunk.meta.currency as string) ?? null;
    exchange ??= (chunk.meta.fullExchangeName as string) ?? null;
    name ??= ((chunk.meta.longName ?? chunk.meta.shortName) as string) ?? null;

    const ts = chunk.timestamp ?? [];
    const q = chunk.indicators.quote?.[0] ?? {};
    const adj = chunk.indicators.adjclose?.[0]?.adjclose;

    for (let k = 0; k < ts.length; k++) {
      const date = isoDay(ts[k]);
      bars.set(date, {
        date,
        open: q.open?.[k] ?? null,
        high: q.high?.[k] ?? null,
        low: q.low?.[k] ?? null,
        close: q.close?.[k] ?? null,
        adjClose: adj?.[k] ?? q.close?.[k] ?? null,
        volume: q.volume?.[k] ?? null,
      });
    }

    for (const d of Object.values(chunk.events?.dividends ?? {})) {
      dividends.set(isoDay(d.date), d.amount);
    }
    for (const s of Object.values(chunk.events?.splits ?? {})) {
      splits.set(isoDay(s.date), {
        value: s.denominator ? s.numerator / s.denominator : 1,
        label: s.splitRatio,
      });
    }
  }

  return {
    source: "yahoo",
    bars: [...bars.values()].sort((a, b) => a.date.localeCompare(b.date)),
    dividends: [...dividends.entries()].map(([date, value]) => ({ date, value })),
    splits: [...splits.entries()].map(([date, s]) => ({ date, value: s.value, label: s.label })),
    meta: {
      currency,
      exchange,
      name,
      firstTradeDate: firstTrade > 0 ? isoDay(firstTrade) : null,
    },
  };
}

/** Restricts a fetch to a date window, so top-ups stay a single small request. */
export type FetchRange = { from?: string; to?: string };

export async function fetchFromYahoo(
  symbol: string,
  onProgress?: (msg: string) => void,
  range?: FetchRange,
  resolution: Resolution = "daily",
): Promise<PriceFetchResult> {
  const now = Math.floor(Date.now() / 1000);
  const FALLBACK_START = now - 40 * 365 * 86400;

  const rangeFrom = range?.from ? Math.floor(Date.parse(range.from) / 1000) : 0;
  const rangeTo = range?.to
    ? Math.floor(Date.parse(range.to) / 1000) + 86400
    : now + 86400;

  // Every request burns rate limit, so ask for the whole window in one call.
  // `yahooChartRequest` rejects coarser-than-daily answers, so a success here
  // really is the full daily series.
  onProgress?.(
    range?.from
      ? `Stahuji ceny od ${range.from}…`
      : "Stahuji celou historii cen…",
  );
  const whole = await yahooChartRequest(symbol, rangeFrom, rangeTo, resolution);
  const firstTrade =
    typeof whole.meta.firstTradeDate === "number" ? whole.meta.firstTradeDate : 0;

  if ((whole.timestamp?.length ?? 0) > 0) {
    return collectBars([whole], firstTrade);
  }

  // A bounded top-up legitimately comes back empty (a weekend, a holiday) —
  // that is success with nothing new, not a reason to refetch the archive.
  if (range?.from) return collectBars([whole], firstTrade);

  // Empty but valid: retry in 8-year windows, which some symbols need.
  const start = firstTrade > 0 ? firstTrade : FALLBACK_START;
  const CHUNK = 8 * 365 * 86400;
  const windows: [number, number][] = [];
  for (let from = start; from < now; from += CHUNK) {
    windows.push([from, Math.min(from + CHUNK, now + 86400)]);
  }

  const chunks: YahooResult[] = [];
  for (const [i, [from, to]] of windows.entries()) {
    onProgress?.(
      `Stahuji ceny ${new Date(from * 1000).getFullYear()}–${new Date(to * 1000).getFullYear()} (${i + 1}/${windows.length})`,
    );
    chunks.push(await yahooChartRequest(symbol, from, to, resolution));
    if (i < windows.length - 1) await sleep(400); // stay polite
  }

  return collectBars(chunks, firstTrade);
}

/* ------------------------------------------------------------------ */
/* Alpha Vantage (optional, keyed)                                     */
/* ------------------------------------------------------------------ */

type AvVariant = {
  fn: string;
  outputsize: string;
  /** Adjusted close, dividends and splits only exist on the premium endpoint. */
  adjusted: boolean;
  label: string;
};

/**
 * Alpha Vantage's free tier is narrower than its docs suggest:
 * `TIME_SERIES_DAILY_ADJUSTED` is premium-only, and even on plain
 * `TIME_SERIES_DAILY` the `outputsize=full` archive is premium. A free key
 * therefore yields the **last 100 sessions, unadjusted** — plenty to keep an
 * existing history current, not enough to build one.
 *
 * We still try the richer variants first so a paid key gets everything.
 */
const AV_VARIANTS: Record<Resolution, AvVariant[]> = {
  daily: [
    { fn: "TIME_SERIES_DAILY_ADJUSTED", outputsize: "full", adjusted: true, label: "denní adjusted/full" },
    { fn: "TIME_SERIES_DAILY", outputsize: "full", adjusted: false, label: "denní full" },
    { fn: "TIME_SERIES_DAILY", outputsize: "compact", adjusted: false, label: "denní 100 dnů" },
  ],
  // Weekly and monthly return the entire archive on a free key — no outputsize
  // parameter exists for them, and both carry adjusted close plus dividends.
  weekly: [
    { fn: "TIME_SERIES_WEEKLY_ADJUSTED", outputsize: "", adjusted: true, label: "týdenní adjusted" },
    { fn: "TIME_SERIES_WEEKLY", outputsize: "", adjusted: false, label: "týdenní" },
  ],
  monthly: [
    { fn: "TIME_SERIES_MONTHLY_ADJUSTED", outputsize: "", adjusted: true, label: "měsíční adjusted" },
    { fn: "TIME_SERIES_MONTHLY", outputsize: "", adjusted: false, label: "měsíční" },
  ],
};

/** Alpha Vantage names the series block differently per endpoint. */
function avSeriesBlock(json: Record<string, unknown>) {
  const key = Object.keys(json).find(
    (k) => /time series/i.test(k) || /weekly|monthly/i.test(k),
  );
  return key
    ? (json[key] as Record<string, Record<string, string>>)
    : undefined;
}

export async function fetchFromAlphaVantage(
  symbol: string,
  range?: FetchRange,
  resolution: Resolution = "daily",
): Promise<PriceFetchResult> {
  const key = getSecret("ALPHAVANTAGE_API_KEY");
  if (!key) throw new Error("ALPHAVANTAGE_API_KEY není nastavený");
  if (alphaVantageExhausted()) {
    throw new Error("Alpha Vantage limit vyčerpán (denní kvóta), zkusí se znovu později");
  }

  const notes: string[] = [];

  for (const [i, variant] of AV_VARIANTS[resolution].entries()) {
    if (i > 0) await sleep(1200); // free keys allow ~1 request per second

    const url =
      `https://www.alphavantage.co/query?function=${variant.fn}` +
      `&symbol=${encodeURIComponent(providerSymbol(symbol))}` +
      (variant.outputsize ? `&outputsize=${variant.outputsize}` : "") +
      `&apikey=${key}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      notes.push(`${variant.label}: HTTP ${res.status}`);
      continue;
    }
    const json = (await res.json()) as Record<string, unknown>;

    const info = (json["Information"] ?? json["Note"]) as string | undefined;
    const errorMsg = json["Error Message"] as string | undefined;
    if (errorMsg) throw new Error(`Alpha Vantage: ${errorMsg}`);
    if (info) {
      // "premium endpoint" just means try the next variant; a rate-limit
      // message means the key is spent and no variant will work today.
      if (/rate limit|per day|requests? per/i.test(info)) {
        noteAlphaExhausted();
        throw new Error(`Alpha Vantage limit vyčerpán: ${info}`);
      }
      notes.push(`${variant.label}: nedostupné na free tieru`);
      continue;
    }

    const series = avSeriesBlock(json);
    if (!series) {
      notes.push(`${variant.label}: prázdná odpověď`);
      continue;
    }

    const bars: PriceBar[] = [];
    const dividends: CorporateAction[] = [];
    const splits: CorporateAction[] = [];

    for (const [date, row] of Object.entries(series)) {
      if (range?.from && date < range.from) continue;
      if (range?.to && date > range.to) continue;

      const close = Number(row["4. close"]);
      bars.push({
        date,
        open: Number(row["1. open"]),
        high: Number(row["2. high"]),
        low: Number(row["3. low"]),
        close,
        adjClose: variant.adjusted ? Number(row["5. adjusted close"]) : close,
        volume: Number(row["6. volume"] ?? row["5. volume"]),
      });

      if (variant.adjusted) {
        const div = Number(row["7. dividend amount"]);
        if (div > 0) dividends.push({ date, value: div });
        // Only the daily adjusted endpoint reports split coefficients.
        const split = Number(row["8. split coefficient"]);
        if (split && split !== 1) splits.push({ date, value: split });
      }
    }

    bars.sort((a, b) => a.date.localeCompare(b.date));

    return {
      source: `alphavantage (${variant.label})`,
      bars,
      dividends,
      splits,
      limitedHistory:
        variant.outputsize === "compact"
          ? "Free klíč Alpha Vantage vrací jen posledních 100 obchodních dnů. " +
            "Pro delší historii nahraj CSV — dooběh už pak zvládne."
          : undefined,
      meta: {},
    };
  }

  throw new Error(
    `Alpha Vantage nevrátil data pro ${symbol} (${notes.join("; ") || "bez detailu"})`,
  );
}

/* ------------------------------------------------------------------ */
/* Tiingo (optional, keyed)                                            */
/* ------------------------------------------------------------------ */

const TIINGO_FREQ: Record<Resolution, string> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
};

export async function fetchFromTiingo(
  symbol: string,
  range?: FetchRange,
  resolution: Resolution = "daily",
): Promise<PriceFetchResult> {
  const key = getSecret("TIINGO_API_KEY");
  if (!key) throw new Error("TIINGO_API_KEY není nastavený");
  const cooldown = tiingoCooldownMinutes();
  if (cooldown > 0) {
    // Hours-long waits mean the monthly cap, not the hourly one; "zkusí se za
    // 28 000 min" is technically true and useless.
    throw new Error(
      cooldown > 180
        ? `Tiingo: vyčerpaný měsíční limit 500 symbolů free klíče — obnoví se ${new Date(
            tiingoBlockedUntil,
          ).toLocaleDateString("cs-CZ")}`
        : `Tiingo limit vyčerpán (hodinová kvóta), zkusí se za ${cooldown} min`,
    );
  }

  const url =
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(providerSymbol(symbol).toLowerCase())}/prices` +
    `?startDate=${range?.from ?? "1960-01-01"}` +
    (range?.to ? `&endDate=${range.to}` : "") +
    `&format=json&resampleFreq=${TIINGO_FREQ[resolution]}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (res.status === 429) {
    noteTiingoThrottled();
    throw new Error("Tiingo limit vyčerpán (hodinová kvóta free klíče)");
  }
  if (!res.ok) throw new Error(`Tiingo HTTP ${res.status}`);

  /*
   * The free tier also caps *unique symbols per month*, and that limit is not
   * reported like the hourly one: the response is HTTP 200 with a plain-English
   * sentence where the JSON should be. Parsed blindly it surfaces as
   * "Unexpected token 'Y'", which says nothing about what actually happened —
   * and, being unrecognised, leaves the provider to be re-probed on every run
   * for the rest of the month.
   */
  const body = await res.text();
  if (!body.trimStart().startsWith("[")) {
    const monthly = /look ?up for this month|monthly/i.test(body);
    if (monthly) noteTiingoMonthlyExhausted();
    else noteTiingoThrottled();
    throw new Error(
      monthly
        ? "Tiingo: vyčerpaný měsíční limit 500 symbolů free klíče — obnoví se 1. dne v měsíci"
        : `Tiingo odpověděl místo dat textem: ${body.slice(0, 120)}`,
    );
  }

  const rows = JSON.parse(body) as {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjClose: number;
    volume: number;
    divCash?: number;
    splitFactor?: number;
  }[];

  const bars: PriceBar[] = [];
  const dividends: CorporateAction[] = [];
  const splits: (CorporateAction & { label?: string })[] = [];

  // A resampled weekly bar is labelled with the week's closing date, which for
  // the current week lies in the future. Report it as of today instead, so the
  // series never claims data it cannot have and the top-up logic stays sane.
  const today = new Date().toISOString().slice(0, 10);

  for (const r of rows) {
    const raw = r.date.slice(0, 10);
    const date = raw > today ? today : raw;
    bars.push({
      date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      adjClose: r.adjClose,
      volume: r.volume,
    });
    if (r.divCash && r.divCash > 0) dividends.push({ date, value: r.divCash });
    if (r.splitFactor && r.splitFactor !== 1) {
      // Feeds carry rounding noise (7.000007 for a 7:1); snap for a clean label.
      const snapped = snapRatio(r.splitFactor);
      splits.push({
        date,
        value: snapped?.value ?? r.splitFactor,
        label: snapped?.label,
      });
    }
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return { source: "tiingo", bars, dividends, splits, meta: {} };
}

/* ------------------------------------------------------------------ */
/* provider chain                                                      */
/* ------------------------------------------------------------------ */

export async function fetchPriceHistory(
  symbol: string,
  onProgress?: (msg: string) => void,
  range?: FetchRange,
  resolution: Resolution = "daily",
): Promise<PriceFetchResult> {
  const providers: { name: string; run: () => Promise<PriceFetchResult> }[] = [];

  // Tiingo leads when configured: it reports split factors and dividends
  // explicitly rather than leaving them to be inferred, and its history reaches
  // back to a stock's first session (AAPL from 1980, where the others start 1999).
  if (getSecret("TIINGO_API_KEY")) {
    providers.push({ name: "Tiingo", run: () => fetchFromTiingo(symbol, range, resolution) });
  }
  providers.push({
    name: "Yahoo Finance",
    run: () => fetchFromYahoo(symbol, onProgress, range, resolution),
  });
  if (getSecret("ALPHAVANTAGE_API_KEY")) {
    providers.push({
      name: "Alpha Vantage",
      run: () => fetchFromAlphaVantage(symbol, range, resolution),
    });
  }

  const errors: string[] = [];
  for (const p of providers) {
    try {
      onProgress?.(`Zdroj cen: ${p.name}`);
      const result = await p.run();
      // A bounded top-up may legitimately have nothing new; a full fetch may not.
      if (result.bars.length === 0 && !range?.from) throw new Error("žádné svíčky");
      return result;
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }

  throw new Error(
    `Nepodařilo se stáhnout ceny. ${errors.join(" | ")}. ` +
      `Doplň ALPHAVANTAGE_API_KEY nebo TIINGO_API_KEY do .env.local jako záložní zdroj, ` +
      `nebo nahraj CSV přes tlačítko v UI.`,
  );
}

/* ------------------------------------------------------------------ */
/* splits                                                              */
/* ------------------------------------------------------------------ */

export type SplitEvent = {
  date: string;
  ratio: number;
  label: string | null;
  source: "feed" | "derived" | "sec";
  /** 1 once the date was pinned to the actual day; see pinSplitDate(). */
  exact?: number | null;
};

/**
 * Snap a measured ratio to a plausible split ratio.
 *
 * Companies split on simple terms — n-for-1, 1-for-n, or a small fraction like
 * 3:2 or 5:4. Allowing any denominator up to 20 would also "snap" the price
 * discontinuity of a spin-off (Agilent's Keysight separation measures 18:13),
 * so both sides of the fraction are kept small and one of them must be tiny.
 */
function snapRatio(s: number): { value: number; label: string; error: number } | null {
  let best: { value: number; num: number; den: number; error: number } | null = null;
  for (let den = 1; den <= 10; den++) {
    for (let num = 1; num <= 20; num++) {
      // n:1, 1:n, or a small fraction — nothing exotic.
      if (num !== 1 && den !== 1 && den > 4) continue;
      const value = num / den;
      const error = Math.abs(value - s) / s;
      if (!best || error < best.error) best = { value, num, den, error };
    }
  }
  // A real split lands within a fraction of a percent; anything looser is noise.
  if (!best || best.error > 0.02 || best.value === 1) return null;
  return { value: best.value, label: `${best.num}:${best.den}`, error: best.error };
}

/**
 * How the reported share count changed across a date.
 *
 * This is what separates a split from a spin-off or a special dividend: a split
 * multiplies the share count by its ratio, while a separation leaves it alone
 * even though the adjusted price steps just as sharply. Medians of a few
 * readings on each side keep one odd cover-page figure from deciding it.
 */
function sharesRatioAround(ticker: string, date: string): number | null {
  // Compare like with like: one concept only. Cover-page and balance-sheet tags
  // count different things, and alternating between them fakes a share-count
  // jump on every other period.
  const all = getDb()
    .prepare(
      `SELECT period_end AS date, value, concept FROM financials
       WHERE ticker = ? AND metric = 'shares_outstanding' AND period_type = 'PIT'
         AND concept IS NOT NULL
       ORDER BY period_end`,
    )
    .all(ticker) as { date: string; value: number; concept: string }[];
  if (all.length < 2) return null;

  const byConcept = new Map<string, { date: string; value: number }[]>();
  for (const r of all) {
    const list = byConcept.get(r.concept) ?? [];
    list.push({ date: r.date, value: r.value });
    byConcept.set(r.concept, list);
  }
  // Whichever tag the filer used most consistently.
  const rows = [...byConcept.values()].sort((a, b) => b.length - a.length)[0];
  if (!rows || rows.length < 2) return null;

  const WINDOW_DAYS = 200;
  const t = Date.parse(date);
  const near = (side: "before" | "after") =>
    rows
      .filter((r) => {
        const d = Date.parse(r.date);
        const delta = side === "before" ? t - d : d - t;
        return delta > 0 && delta <= WINDOW_DAYS * 86_400_000;
      })
      .sort((a, b) =>
        side === "before" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
      )
      .slice(0, 3)
      .map((r) => r.value)
      .filter((v) => v > 0);

  const median = (xs: number[]) =>
    xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;

  const before = median(near("before"));
  const after = median(near("after"));
  if (!before || !after) return null;
  return after / before;
}

/**
 * Recover split events from the price series itself.
 *
 * Providers that ship an adjusted close but no split feed still encode every
 * split implicitly: the raw close jumps while the adjusted close stays
 * continuous. The ratio between the two returns *is* the split factor.
 *
 * This finds splits that predate XBRL (AAPL's 2000 and 2005 splits never appear
 * in EDGAR), and it pins the split to the exact first session at the new price,
 * which the SEC note does not.
 */
export function detectSplitsFromPrices(ticker: string): SplitEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT date, close, adj_close AS adjClose FROM prices
       WHERE ticker = ? AND close IS NOT NULL AND adj_close IS NOT NULL
       ORDER BY date`,
    )
    .all(ticker) as { date: string; close: number; adjClose: number }[];

  const out: SplitEvent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    if (a.close <= 0 || b.close <= 0 || a.adjClose <= 0 || b.adjClose <= 0) continue;

    const rawReturn = b.close / a.close;
    const adjReturn = b.adjClose / a.adjClose;
    const s = adjReturn / rawReturn;

    // Dividends move this by well under 15%; only a split clears the bar.
    if (Math.abs(Math.log(s)) <= Math.log(1.15)) continue;

    const snapped = snapRatio(s);
    if (!snapped) continue;

    // Corroborate against the reported share count when SEC data is available.
    // A spin-off moves the adjusted price without moving the share count, so a
    // clear mismatch means this discontinuity was not a split.
    const sharesRatio = sharesRatioAround(ticker, b.date);
    if (sharesRatio !== null) {
      const agrees = Math.abs(Math.log(sharesRatio / snapped.value)) < Math.log(1.2);
      if (!agrees) continue;
    }

    out.push({
      date: b.date,
      ratio: snapped.value,
      label: snapped.label,
      source: "derived",
    });
  }
  return out;
}

export function storeSplits(ticker: string, splits: SplitEvent[]): number {
  if (splits.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO splits (ticker, date, ratio, label, source) VALUES (?,?,?,?,?)
     ON CONFLICT(ticker, date) DO UPDATE SET
       ratio = excluded.ratio, label = excluded.label, source = excluded.source`,
  );
  db.transaction(() => {
    for (const s of splits) stmt.run(ticker, s.date, s.ratio, s.label, s.source);
  })();
  return splits.length;
}

export function getSplits(ticker: string): SplitEvent[] {
  return getDb()
    .prepare(
      `SELECT date, ratio, label, source, exact FROM splits WHERE ticker = ? ORDER BY date`,
    )
    .all(ticker) as SplitEvent[];
}

/** True when the feed supplied a genuine adjusted close, not a copy of the close. */
function hasAdjustedSeries(ticker: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM prices
       WHERE ticker = ? AND close IS NOT NULL AND adj_close IS NOT NULL
         AND ABS(adj_close - close) > 0.0001 * ABS(close)`,
    )
    .get(ticker) as { n: number };
  return row.n > 0;
}

/**
 * Collapse repeated SEC entries for one event.
 *
 * The split ratio is tagged in the equity note of every filing for the year it
 * happened, and each of those facts carries its own filing's period end — so a
 * single 2:1 split shows up as three or four entries on unrelated dates. The
 * same ratio recurring inside a year is therefore one event, not several.
 */
function collapseSecSplits(secSplits: SplitEvent[]): SplitEvent[] {
  const sorted = [...secSplits].sort((a, b) => a.date.localeCompare(b.date));
  const out: SplitEvent[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    const sameRatio = prev && Math.abs(prev.ratio - s.ratio) / s.ratio < 0.02;
    const withinAYear =
      prev && Date.parse(s.date) - Date.parse(prev.date) < 400 * 86_400_000;
    if (sameRatio && withinAYear) continue;
    out.push(s);
  }
  return out;
}

/**
 * Decide the final split set.
 *
 * When the feed carries an adjusted close, the price-derived events are both
 * complete and exactly dated, so they are used alone — SEC entries are dropped
 * rather than merged, because their dates are filing period ends and adding
 * them would double-count the same split several times over.
 *
 * SEC is the fallback for the case it is actually needed: no adjusted series to
 * derive from, such as a CSV import.
 */
export function reconcileSplits(ticker: string, secSplits: SplitEvent[] = []): SplitEvent[] {
  const db = getDb();
  // A split already pinned to its actual day keeps that day. Re-deriving from
  // weekly bars would otherwise put it back on the end of its week each time.
  const pinned = getSplits(ticker).filter((s) => s.exact === 1);
  const keepPinned = (s: SplitEvent): SplitEvent =>
    pinned.find(
      (p) =>
        Math.abs(Date.parse(p.date) - Date.parse(s.date)) <= 35 * 86_400_000 &&
        Math.abs(p.ratio - s.ratio) / s.ratio < 0.02,
    ) ?? s;
  const derived = detectSplitsFromPrices(ticker).map(keepPinned);
  const canDerive = hasAdjustedSeries(ticker);

  // Splits the provider stated outright. These beat anything inferred: they
  // carry the exact ratio and cover events older than the stored price series
  // (Tiingo knows Apple's 1987 split even where our bars start in 1999).
  const feed = getSplits(ticker).filter((s) => s.source === "feed");

  let final: SplitEvent[];

  if (feed.length) {
    const near = (a: string, b: string) =>
      Math.abs(Date.parse(a) - Date.parse(b)) <= 30 * 86_400_000;
    // Keep an inferred split only where the feed has nothing nearby.
    final = [...feed, ...derived.filter((d) => !feed.some((f) => near(f.date, d.date)))];
  } else if (canDerive) {
    final = derived;
  } else {
    const coverage = getPriceCoverage(ticker);
    // A split dated before the first stored bar cannot affect any series, and
    // pre-IPO recapitalisations get tagged with these concepts too.
    const inRange = secSplits.filter(
      (s) => !coverage.from || (s.date >= coverage.from && (!coverage.to || s.date <= coverage.to)),
    );
    const collapsed = collapseSecSplits(inRange);
    // Keep any derived event too — without an adjusted series there should be
    // none, but a mixed-source history could still produce one.
    const extra = derived.filter(
      (d) =>
        !collapsed.some(
          (s) => Math.abs(Date.parse(d.date) - Date.parse(s.date)) < 180 * 86_400_000,
        ),
    );
    final = [...collapsed, ...extra];
  }

  final.sort((a, b) => a.date.localeCompare(b.date));

  // Replace rather than merge, so a bad earlier run cannot leave stale rows.
  db.transaction(() => {
    db.prepare(`DELETE FROM splits WHERE ticker = ?`).run(ticker);
    const stmt = db.prepare(
      `INSERT INTO splits (ticker, date, ratio, label, source, exact) VALUES (?,?,?,?,?,?)`,
    );
    for (const s of final) stmt.run(ticker, s.date, s.ratio, s.label, s.source, s.exact ?? null);
  })();

  return final;
}

/**
 * Cumulative factor to divide an as-traded price by so it lines up with today's
 * share count: the product of every split that happened after that date.
 */
export function splitFactorLookup(
  splits: SplitEvent[],
): (date: string) => number {
  const sorted = [...splits].sort((a, b) => a.date.localeCompare(b.date));
  return (date: string) => {
    let factor = 1;
    for (const s of sorted) if (s.date > date) factor *= s.ratio;
    return factor;
  };
}

/* ------------------------------------------------------------------ */
/* exact split dates                                                   */
/* ------------------------------------------------------------------ */

/**
 * Pin every split that still carries a bar's date, after a download.
 *
 * One Yahoo request answers for all of a company's splits at once — its
 * split events carry the actual day whatever the bar size — so this costs
 * nothing against Tiingo's quotas, which a per-split daily request would
 * exhaust across a whole index. Only splits dated on or after `from` are
 * considered once the company's older splits have been asked about — a
 * company already in the database gets its whole history pinned on its first
 * download after this existed, and afterwards a top-up asks only when it
 * brought a new split. Splits Yahoo does not know (KO's 1965) are not asked
 * about again for a month.
 *
 * A failure is not an error for the download: those splits keep their week's
 * date and are pinned on demand when a purchase lands in that week.
 */
export async function pinSplitsAfterDownload(
  ticker: string,
  from?: string,
): Promise<{ pinned: number; left: number }> {
  const db = getDb();
  const open = getSplits(ticker).filter((s) => s.exact !== 1);
  const askedKey = `split-pin:${ticker}`;
  const askedRecently = kvGet(askedKey, 30 * 86_400_000) !== null;
  const todo = askedRecently && from ? open.filter((s) => s.date >= from) : open;
  if (todo.length === 0) return { pinned: 0, left: open.length };

  // Daily bars date a split to its own session already.
  if (getStoredResolution(ticker) === "daily") {
    const mark = db.prepare(`UPDATE splits SET exact = 1 WHERE ticker = ? AND date = ?`);
    for (const s of todo) mark.run(ticker, s.date);
    return { pinned: todo.length, left: 0 };
  }

  // Refinement, not the download itself: never wait out a throttled Yahoo for it.
  if (yahooIsTripped()) return { pinned: 0, left: open.length };

  let events: { date: string; ratio: number }[];
  try {
    // One attempt only: waiting out a throttled Yahoo costs ~45 s, which a
    // price top-up must not pay for a refinement it can do without.
    const chart = await yahooChartRequest(ticker, 0, Math.floor(Date.now() / 1000) + 86400, "monthly", 1);
    events = Object.values(chart.events?.splits ?? {})
      .filter((e) => e.denominator)
      .map((e) => ({ date: isoDay(e.date), ratio: e.numerator / e.denominator }));
  } catch {
    return { pinned: 0, left: open.length };
  }
  kvSet(askedKey, "1");

  const prevStmt = db.prepare(`SELECT MAX(date) AS d FROM prices WHERE ticker = ? AND date < ?`);
  const move = db.prepare(`UPDATE splits SET date = ?, exact = 1 WHERE ticker = ? AND date = ?`);
  let pinned = 0;
  for (const s of todo) {
    const prev = (prevStmt.get(ticker, s.date) as { d: string | null }).d ?? "0000-00-00";
    // The actual day lies after the previous bar and no later than the stored one.
    const hit = events.find(
      (e) => e.date > prev && e.date <= s.date && Math.abs(e.ratio - s.ratio) / s.ratio < 0.02,
    );
    if (!hit) continue;
    try {
      move.run(hit.date, ticker, s.date);
      pinned++;
    } catch {
      // A row for that day exists already; the week-dated duplicate goes.
      db.prepare(`DELETE FROM splits WHERE ticker = ? AND date = ?`).run(ticker, s.date);
      db.prepare(`UPDATE splits SET exact = 1 WHERE ticker = ? AND date = ?`).run(ticker, hit.date);
      pinned++;
    }
  }
  return { pinned, left: open.length - pinned };
}

/** A failed pin is not retried for this long; the provider will not know more tomorrow. */
const PIN_RETRY_MS = 7 * 86_400_000;

/**
 * Move a split from the end of its bar to the day it actually happened.
 *
 * Weekly and monthly feeds report a split on the bar's own date — Alphabet's
 * 20:1 of Monday 18 July 2022 arrives as Friday the 22nd. For charts that is
 * harmless: every bar sits on the same side of either date. It is not
 * harmless for anything dated inside that week, such as a purchase on the
 * 19th, which would count as pre-split and get its shares multiplied twenty
 * times. One daily request for just that week settles it.
 *
 * Returns the exact date, or null when the provider could not tell.
 */
export async function pinSplitDate(ticker: string, split: SplitEvent): Promise<string | null> {
  if (split.exact === 1) return split.date;
  const db = getDb();

  const prev = (
    db
      .prepare(`SELECT MAX(date) AS d FROM prices WHERE ticker = ? AND date < ?`)
      .get(ticker, split.date) as { d: string | null }
  ).d;
  const from = new Date(Date.parse(prev ?? split.date) + (prev ? 1 : -10) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const markExact = (date: string) => {
    db.prepare(`UPDATE splits SET date = ?, exact = 1 WHERE ticker = ? AND date = ?`).run(
      date,
      ticker,
      split.date,
    );
    return date;
  };
  // Consecutive daily bars: nothing between them, the date is already the day.
  if (from >= split.date) return markExact(split.date);

  const failKey = `split-pin-fail:${ticker}:${split.date}`;
  if (kvGet(failKey, PIN_RETRY_MS) !== null) return null;

  let found: string | null = null;
  try {
    const res = await fetchPriceHistory(ticker, undefined, { from, to: split.date }, "daily");
    const near = (v: number) => Math.abs(v - split.ratio) / split.ratio < 0.02;
    found = res.splits.find((s) => near(s.value))?.date ?? null;
    if (!found) {
      // No split field from this provider: the raw close itself steps by the ratio.
      const bars = res.bars.filter((b) => b.close !== null && b.close > 0);
      for (let i = 1; i < bars.length && !found; i++) {
        const step = bars[i - 1].close! / bars[i].close!;
        if (Math.abs(Math.log(step / split.ratio)) < Math.log(1.25)) found = bars[i].date;
      }
    }
  } catch {
    found = null;
  }

  if (!found || found < from || found > split.date) {
    kvSet(failKey, "1");
    return null;
  }
  return markExact(found);
}

/**
 * Pin the splits that a date in `dates` falls inside of — only those change a
 * figure. A date strictly between the previous bar and the stored split date
 * is ambiguous; everything else sits on the same side of the split either way.
 */
export async function pinSplitsNear(ticker: string, dates: string[]): Promise<void> {
  const splits = getSplits(ticker).filter((s) => s.exact !== 1);
  if (splits.length === 0 || dates.length === 0) return;
  const prevStmt = getDb().prepare(`SELECT MAX(date) AS d FROM prices WHERE ticker = ? AND date < ?`);
  for (const s of splits) {
    const prev = (prevStmt.get(ticker, s.date) as { d: string | null }).d ?? "0000-00-00";
    if (dates.some((d) => d > prev && d < s.date)) await pinSplitDate(ticker, s);
  }
}

/* ------------------------------------------------------------------ */
/* coverage & incremental top-up                                       */
/* ------------------------------------------------------------------ */

export type Coverage = { count: number; from: string | null; to: string | null };

/** Record where the prices came from, plus the metadata only the feed knows. */
function rememberSource(
  ticker: string,
  result: PriceFetchResult,
  resolution: Resolution,
): void {
  getDb()
    .prepare(
      `UPDATE companies SET price_source = ?,
              price_resolution = ?,
              currency = COALESCE(?, currency),
              exchange = COALESCE(exchange, ?),
              first_trade_date = COALESCE(?, first_trade_date)
       WHERE ticker = ?`,
    )
    .run(
      result.source,
      resolution,
      result.meta.currency ?? null,
      result.meta.exchange ?? null,
      result.meta.firstTradeDate ?? null,
      ticker,
    );
}

export function getStoredResolution(ticker: string): Resolution | null {
  const row = getDb()
    .prepare(`SELECT price_resolution AS r FROM companies WHERE ticker = ?`)
    .get(ticker) as { r: string | null } | undefined;
  const r = row?.r;
  return r === "daily" || r === "weekly" || r === "monthly" ? r : null;
}

export function getPriceCoverage(ticker: string): Coverage {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count, MIN(date) AS "from", MAX(date) AS "to"
       FROM prices WHERE ticker = ?`,
    )
    .get(ticker) as Coverage;
  return { count: row.count, from: row.from, to: row.to };
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Fetch only what the database is missing.
 *
 * Once a bulk history is in place (typically from a CSV import), keeping it
 * current costs one small request per run — and a failed run is harmless,
 * because the stored history is untouched and the next run picks up the gap.
 */
export async function topUpPrices(
  ticker: string,
  onProgress?: (msg: string) => void,
  requested?: Resolution,
): Promise<{
  stored: number;
  skipped: boolean;
  message: string;
  resolution: Resolution;
}> {
  const coverage = getPriceCoverage(ticker);
  const today = new Date().toISOString().slice(0, 10);

  // Keep topping up in whatever resolution the stored history already uses —
  // mixing weekly and daily bars in one series would distort every chart.
  const resolution = requested ?? getStoredResolution(ticker) ?? "weekly";
  const unit = resolution === "daily" ? "dnů" : resolution === "weekly" ? "týdnů" : "měsíců";

  if (coverage.count === 0 || !coverage.to) {
    const result = await fetchPriceHistory(ticker, onProgress, undefined, resolution);
    const stored = storePrices(ticker, result);
    rememberSource(ticker, result, resolution);
    // Splits are derived from the price series, so they can only be found now.
    reconcileSplits(ticker);
    await pinSplitsAfterDownload(ticker);
    return {
      stored,
      skipped: false,
      resolution,
      message:
        `Uloženo ${stored.toLocaleString("cs-CZ")} ${unit} ` +
        `(${result.bars[0]?.date} → ${result.bars[result.bars.length - 1]?.date}), zdroj ${result.source}` +
        (result.limitedHistory ? ` — ${result.limitedHistory}` : ""),
    };
  }

  if (coverage.to >= today) {
    return {
      stored: 0,
      skipped: true,
      resolution,
      message: `Ceny jsou aktuální k ${coverage.to}, není co doplňovat.`,
    };
  }

  // Overlap by a couple of bars so a corrected or late-settled one gets rewritten.
  const overlapDays = resolution === "daily" ? 4 : resolution === "weekly" ? 14 : 62;
  const from = addDays(coverage.to, -overlapDays);
  const result = await fetchPriceHistory(ticker, onProgress, { from, to: today }, resolution);
  const fresh = result.bars.filter((b) => b.date > coverage.to!);
  const stored = storePrices(ticker, result);
  rememberSource(ticker, result, resolution);
  // A split in the new bars arrives dated to its week; only such a one is asked about.
  await pinSplitsAfterDownload(ticker, from);

  return {
    stored,
    skipped: false,
    resolution,
    message: fresh.length
      ? `Doplněno ${fresh.length.toLocaleString("cs-CZ")} nových ${unit} (${fresh[0].date} → ${fresh[fresh.length - 1].date}), zdroj ${result.source}`
      : `Žádné nové záznamy po ${coverage.to}.`,
  };
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

export function storePrices(ticker: string, result: PriceFetchResult): number {
  const db = getDb();

  const insertBar = db.prepare(`
    INSERT INTO prices (ticker, date, open, high, low, close, adj_close, volume)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(ticker, date) DO UPDATE SET
      open = excluded.open, high = excluded.high, low = excluded.low,
      close = excluded.close, adj_close = excluded.adj_close, volume = excluded.volume
  `);
  const insertDiv = db.prepare(`
    INSERT INTO dividends (ticker, date, amount) VALUES (?,?,?)
    ON CONFLICT(ticker, date) DO UPDATE SET amount = excluded.amount
  `);
  const insertSplit = db.prepare(`
    INSERT INTO splits (ticker, date, ratio, label, source) VALUES (?,?,?,?,?)
    ON CONFLICT(ticker, date) DO UPDATE SET
      ratio = excluded.ratio, label = excluded.label, source = excluded.source
  `);

  /*
   * A split already pinned to its actual day must not come back a second time
   * under the end-of-week date a coarse feed gives it: the two rows would both
   * count, and the history would be split twice.
   */
  const pinned = getSplits(ticker).filter((s) => s.exact === 1);
  const alreadyPinned = (date: string, ratio: number) =>
    pinned.some(
      (p) =>
        p.date !== date &&
        Math.abs(Date.parse(p.date) - Date.parse(date)) <= 35 * 86_400_000 &&
        Math.abs(p.ratio - ratio) / ratio < 0.02,
    );

  db.transaction(() => {
    for (const b of result.bars) {
      insertBar.run(ticker, b.date, b.open, b.high, b.low, b.close, b.adjClose, b.volume);
    }
    for (const d of result.dividends) insertDiv.run(ticker, d.date, d.value);
    for (const s of result.splits) {
      if (alreadyPinned(s.date, s.value)) continue;
      // Tagged as 'feed' so reconciliation knows these came from the provider
      // rather than being inferred, and can prefer them.
      insertSplit.run(ticker, s.date, s.value, (s as { label?: string }).label ?? null, "feed");
    }
  })();

  return result.bars.length;
}

/** Parse a plain OHLCV CSV (Stooq / Yahoo export format) for manual imports. */
export function parseCsv(csv: string): PriceBar[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = idx("date", "datum");
  const iOpen = idx("open");
  const iHigh = idx("high");
  const iLow = idx("low");
  const iClose = idx("close");
  const iAdj = idx("adj close", "adjclose", "adj_close");
  const iVol = idx("volume");
  if (iDate < 0 || iClose < 0) {
    throw new Error("CSV musí obsahovat aspoň sloupce Date a Close");
  }

  const num = (cells: string[], i: number) => {
    if (i < 0) return null;
    const v = Number(cells[i]);
    return Number.isFinite(v) ? v : null;
  };

  const bars: PriceBar[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = cells[iDate]?.trim().slice(0, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const close = num(cells, iClose);
    if (close === null) continue;
    bars.push({
      date,
      open: num(cells, iOpen),
      high: num(cells, iHigh),
      low: num(cells, iLow),
      close,
      adjClose: num(cells, iAdj) ?? close,
      volume: num(cells, iVol),
    });
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}
