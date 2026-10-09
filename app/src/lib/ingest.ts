import { getDb } from "./db";
import {
  extractFilingDocs,
  fetchCompanyFacts,
  fetchSubmissions,
  ingestCompanyFacts,
  resolveCik,
} from "./sec";
import { buildDocUrl, recordFilingDocs, saveCompanyFacts } from "./filings";
import {
  getPriceCoverage,
  getSplits,
  pinSplitsAfterDownload,
  reconcileSplits,
  topUpPrices,
  type Resolution,
} from "./prices";
import { constituentOf } from "./universe";
import { sectorFromSic } from "./sectors";
import type { IngestProgress } from "./types";

/**
 * Full pipeline for one ticker: resolve it at SEC, pull the price history,
 * pull every XBRL fact, normalize, and store. Emits progress as it goes.
 */
export async function* ingestTicker(
  rawTicker: string,
  resolution?: Resolution,
  cikHint?: string | null,
  /** Re-process filings only. Useful when a normalisation change means the SEC
   *  side must be rebuilt but the stored prices are already fine — re-fetching
   *  them would burn provider quota that new companies need more. */
  skipPrices = false,
): AsyncGenerator<IngestProgress> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) {
    yield { step: "error", message: "Neplatný ticker", pct: 0, error: "Neplatný ticker" };
    return;
  }

  const db = getDb();

  yield { step: "resolve", message: `Hledám ${ticker} v rejstříku SEC…`, pct: 3, ticker };

  // Fall back to the CIK recorded in the index list. SEC's ticker directory is
  // not exhaustive (AEP is missing from it), and the constituent list carries a
  // CIK for every company, so a lookup miss need not end the ingest.
  const knownCik =
    cikHint ??
    (
      db.prepare(`SELECT cik FROM universe WHERE ticker = ?`).get(ticker) as
        | { cik: string | null }
        | undefined
    )?.cik ??
    null;

  const entry = await resolveCik(ticker, knownCik);
  if (!entry) {
    yield {
      step: "error",
      message: `Ticker ${ticker} není v rejstříku SEC.`,
      pct: 0,
      error:
        `Ticker ${ticker} nemá záznam v rejstříku SEC ani známý CIK ` +
        `(jde nejspíš o zahraniční titul nebo ETF). Ceny by šly stáhnout, ale uzávěrky ne.`,
      ticker,
    };
    return;
  }

  yield {
    step: "resolve",
    message: `${entry.name} — CIK ${entry.cik}`,
    pct: 8,
    ticker,
  };

  /* ---- company metadata ---- */
  let sic: string | null = null;
  let sicDescription: string | null = null;
  let fiscalYearEnd: string | null = null;
  let exchange: string | null = null;
  let filingDocs: ReturnType<typeof extractFilingDocs> = [];
  let officialName: string | null = null;
  try {
    const sub = await fetchSubmissions(entry.cik);
    officialName = sub.name ?? null;
    sic = sub.sic ?? null;
    sicDescription = sub.sicDescription ?? null;
    fiscalYearEnd = sub.fiscalYearEnd ?? null;
    exchange = sub.exchanges?.[0] ?? null;
    filingDocs = extractFilingDocs(sub);
  } catch {
    // Metadata is a nice-to-have; the ingest continues without it.
  }

  /*
   * Sector and sub-industry, in order of how much the source knows.
   *
   * An index list states the company's real GICS classification, so it wins:
   * first what was imported into `universe`, then the lists bundled with the
   * app, which cover an install where no index was ever downloaded. Only when
   * neither knows the ticker does SEC's SIC code decide — an approximation,
   * which is why the answer records where it came from.
   */
  const zIndexu = db
    .prepare(
      `SELECT sector, sub_industry AS subIndustry FROM universe
       WHERE ticker = ? AND sector IS NOT NULL AND sector <> ''`,
    )
    .get(ticker) as { sector: string; subIndustry: string | null } | undefined;
  const zSeznamu = zIndexu ?? constituentOf(ticker);

  const sector = zSeznamu?.sector ?? sectorFromSic(sic);
  const subIndustry = zSeznamu?.subIndustry ?? sicDescription;
  const sectorSource = zSeznamu ? "index" : sector || subIndustry ? "sic" : null;

  db.prepare(
    `INSERT INTO companies (ticker, cik, name, sic, sic_description, fiscal_year_end, exchange,
                            sector, sub_industry, sector_source, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(ticker) DO UPDATE SET
       cik = excluded.cik, name = excluded.name, sic = excluded.sic,
       sic_description = excluded.sic_description, fiscal_year_end = excluded.fiscal_year_end,
       exchange = COALESCE(excluded.exchange, companies.exchange),
       -- A re-download must not downgrade an index classification to a derived
       -- one, which is what would happen the moment SEC answered slowly.
       sector = CASE WHEN excluded.sector_source = 'index' OR COALESCE(companies.sector_source, '') <> 'index'
                     THEN excluded.sector ELSE companies.sector END,
       sub_industry = CASE WHEN excluded.sector_source = 'index' OR COALESCE(companies.sector_source, '') <> 'index'
                     THEN excluded.sub_industry ELSE companies.sub_industry END,
       sector_source = CASE WHEN excluded.sector_source = 'index' OR COALESCE(companies.sector_source, '') <> 'index'
                     THEN excluded.sector_source ELSE companies.sector_source END,
       updated_at = excluded.updated_at`,
  ).run(
    ticker,
    entry.cik,
    officialName ?? entry.name,
    sic,
    sicDescription,
    fiscalYearEnd,
    exchange,
    sector,
    subIndustry,
    sectorSource,
    new Date().toISOString(),
  );

  /* ---- prices ---- */
  // With history already stored, only the gap since the last bar is fetched.
  const coverage = getPriceCoverage(ticker);
  yield {
    step: "prices",
    message: skipPrices
      ? "Přepočítávám jen výkazy, ceny nechávám být"
      : coverage.count
      ? `Mám ${coverage.count.toLocaleString("cs-CZ")} dnů (${coverage.from} → ${coverage.to}), doplňuji jen chybějící…`
      : "Stahuji denní historii cen…",
    pct: 12,
    ticker,
  };

  let priceError: string | null = null;
  try {
    if (skipPrices) {
      yield { step: "prices", message: "Ceny přeskočeny (jen přepočet výkazů)", pct: 45, ticker };
    } else {
      const res = await topUpPrices(ticker, undefined, resolution);
      yield { step: "prices", message: res.message, pct: 45, ticker };
    }
  } catch (e) {
    priceError = (e as Error).message;
    yield {
      step: "prices",
      message: coverage.count
        ? `Ceny se nepodařilo doplnit, uložená historie zůstává beze změny: ${priceError}`
        : `Ceny se nepodařilo stáhnout: ${priceError}`,
      pct: 45,
      ticker,
    };
  }

  /* ---- SEC filings ---- */
  yield { step: "sec", message: "Stahuji uzávěrky z SEC EDGAR (companyfacts)…", pct: 50, ticker };

  let secSummary = "";
  try {
    const facts = await fetchCompanyFacts(entry.cik);

    // Keep the raw payload so every metric can be recomputed offline later.
    const archived = saveCompanyFacts(ticker, facts);

    yield {
      step: "sec",
      message: `Archivováno companyfacts.json (${(archived.bytes / 1e6).toFixed(1)} MB)`,
      pct: 66,
      ticker,
    };

    yield { step: "sec", message: "Analyzuji XBRL a normalizuji položky…", pct: 70, ticker };
    const res = ingestCompanyFacts(ticker, facts);

    // Splits come from two places: the price series (exact timing, reaches back
    // before XBRL) and the equity note (authoritative ratio, post-2009 only).
    // Written after normalisation: companyfacts also touches the filings table
    // but dates its rows from XBRL facts, whereas `submissions` carries the
    // real report period and the document name. Last write wins, so this runs last.
    if (filingDocs.length) {
      recordFilingDocs(
        ticker,
        filingDocs.map((d) => ({ ...d, docUrl: buildDocUrl(entry.cik, d.accn, d.primaryDocument) })),
      );
      yield {
        step: "sec",
        message: `Evidováno ${filingDocs.length} výkazů 10-K/10-Q (dokumenty se stáhnou na kliknutí)`,
        pct: 86,
        ticker,
      };
    }

    reconcileSplits(ticker, res.splits);
    // Weekly and monthly feeds date a split to the end of its bar; one Yahoo
    // request puts every split on its actual day.
    const pin = await pinSplitsAfterDownload(ticker);
    const splits = getSplits(ticker);
    if (splits.length) {
      yield {
        step: "sec",
        message:
          `Splity: ${splits.length} — ` +
          splits
            .map(
              (s) =>
                `${s.date} ${s.label ?? `${s.ratio}:1`} (${
                  { feed: "od zdroje", sec: "SEC", derived: "z cen" }[s.source] ?? s.source
                })`,
            )
            .join(", "),
        pct: 88,
        ticker,
      };
    }
    if (pin.left > 0) {
      yield {
        step: "sec",
        message: `${pin.left} splitů zůstává s datem svého týdne (Yahoo nedostupné) — upřesní se při nákupu v tom týdnu`,
        pct: 88,
        ticker,
      };
    }

    secSummary =
      `${res.filings} výkazů, ${res.factsStored.toLocaleString("cs-CZ")} XBRL faktů → ` +
      `${res.metricsStored.toLocaleString("cs-CZ")} normalizovaných položek ` +
      `(${res.metricsFound.length} ukazatelů, ${res.firstPeriod} → ${res.lastPeriod})`;
    yield { step: "sec", message: secSummary, pct: 92, ticker };
  } catch (e) {
    const msg = (e as Error).message;
    if (priceError) {
      yield {
        step: "error",
        message: `Nepodařilo se stáhnout ani ceny, ani uzávěrky.`,
        pct: 100,
        error: `Ceny: ${priceError} — SEC: ${msg}`,
        ticker,
      };
      return;
    }
    yield { step: "sec", message: `Uzávěrky se nepodařilo stáhnout: ${msg}`, pct: 92, ticker };
  }

  db.prepare(`UPDATE companies SET updated_at = ? WHERE ticker = ?`).run(
    new Date().toISOString(),
    ticker,
  );

  // Whether this ran from the batch or from the single-ticker form, the index
  // memory should agree with what is actually stored.
  db.prepare(
    `UPDATE universe SET status = 'done', last_attempt = ?, last_error = ?
     WHERE ticker = ? AND EXISTS (SELECT 1 FROM financials f WHERE f.ticker = ?)`,
  ).run(new Date().toISOString(), priceError ?? null, ticker, ticker);

  yield {
    step: "done",
    message: priceError
      ? `Hotovo s výhradou — ceny chybí (${priceError}). ${secSummary}`
      : `Hotovo. ${secSummary}`,
    pct: 100,
    done: true,
    ticker,
    error: priceError ?? undefined,
  };
}
