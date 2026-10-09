"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartCard } from "./ChartCard";
import { ChartBrowser } from "./ChartBrowser";
import { FilingsArchive } from "./FilingsArchive";
import { PeerComparison } from "./PeerComparison";
import { ChatAnalyst } from "./ChatAnalyst";
import { PortfolioSimulator } from "./PortfolioSimulator";
import { PortfolioMonitoring } from "./PortfolioMonitoring";
import { Watchlist } from "./Watchlist";
import { RiskAnalysis } from "./RiskAnalysis";
import { UniversePanel } from "./UniversePanel";
import { SettingsPanel } from "./SettingsPanel";
import { PackagePanel } from "./PackagePanel";
import { ClaudeRequired } from "./ClaudeRequired";
import { TickerPicker } from "./TickerPicker";
import { ThemeToggle } from "./ThemeToggle";
import { InvestmentCalculator } from "./InvestmentCalculator";
import { CHART_BY_ID, DEFAULT_LAYOUT, localizeDef, type Resolution } from "@/lib/catalog";
import { ROZSIRENI } from "@/rozsireni/seznam.generated";
import { formatValue } from "@/lib/format";
import type { IngestProgress, PriceBar, SeriesPoint } from "@/lib/types";

type StockData = {
  company: {
    ticker: string;
    name: string | null;
    cik: string | null;
    exchange: string | null;
    currency: string;
    sicDescription: string | null;
    sector: string | null;
    subIndustry: string | null;
    /** "index" = z indexového seznamu, "sic" = odvozeno ze SIC. */
    sectorSource: string | null;
    index: string | null;
    priceSource: string | null;
    resolution: Resolution | null;
    updatedAt: string | null;
  };
  summary: {
    lastPrice: number | null;
    lastPriceDate: string | null;
    changePct: number | null;
    pe: number | null;
    ps: number | null;
    pb: number | null;
    marketCap: number | null;
    dividendYield: number | null;
    ttmRevenue: number | null;
    ttmNetIncome: number | null;
    ttmEps: number | null;
    roe: number | null;
    beta: number | null;
    peg: number | null;
    epsGrowth3y: number | null;
    drawdown: number | null;
    priceFrom: string | null;
    priceTo: string | null;
    priceCount: number;
  };
  warnings?: string[];
  prices: PriceBar[];
  splits: { date: string; value: number; label: string | null }[];
  annual: Record<string, SeriesPoint[]>;
  quarterly: Record<string, SeriesPoint[]>;
  balance: Record<string, SeriesPoint[]>;
  derived: Record<string, SeriesPoint[]>;
  filings: { accn: string; form: string; periodEnd: string; filed: string }[];
  available: { annual: string[]; quarterly: string[]; balance: string[]; derived: string[] };
};

type TickerRow = {
  ticker: string;
  name: string | null;
  sector: string | null;
  subIndustry: string | null;
  priceCount: number;
  priceFrom: string | null;
  priceTo: string | null;
  metricCount: number;
  filingCount: number;
};

const RANGES = [
  { id: "1y", label: "1R", years: 1 },
  { id: "3y", label: "3R", years: 3 },
  { id: "5y", label: "5R", years: 5 },
  { id: "10y", label: "10R", years: 10 },
  { id: "max", label: "MAX", years: 0 },
] as const;

const LAYOUT_KEY = "stocksanalyzer.layout";

type TabId =
  | "charts"
  | "peers"
  | "risk"
  | "chat"
  | "filings"
  | "portfolio"
  | "monitoring"
  | "watchlist"
  | "investice"
  | "data"
  | "settings"
  /** Záložka z src/rozsireni/ — prefix drží vlastní funkce mimo jmenný prostor vestavěných. */
  | `ext:${string}`;

/**
 * Tail-risk analysis is still experimental and stays with the author until it
 * is tuned; a shared copy never shows it.
 */
const TABS: { id: TabId; label: string; devOnly?: boolean }[] = [
  { id: "charts", label: "Grafy" },
  { id: "peers", label: "Porovnání s konkurencí" },
  { id: "risk", label: "Krajní rizika", devOnly: true },
  { id: "chat", label: "Chat s analytikem" },
  { id: "filings", label: "Výkazy SEC" },
  // Each of these two stands in for a whole group; see SKUPINY.
  { id: "portfolio", label: "Moje akcie" },
  { id: "investice", label: "Nástroje" },
  { id: "data", label: "Data a stahování" },
  { id: "settings", label: "Nastavení" },
];

/**
 * Groups shown as one entry in the main row with a second row of their own,
 * keyed by the main-row entry that stands in for them. "Moje akcie" holds the
 * tabs about the user's own money rather than the selected company,
 * "Nástroje" the calculators that need no company at all.
 */
const SKUPINY: Partial<Record<TabId, { label: string; items: { id: TabId; label: string }[] }>> = {
  portfolio: {
    label: "Moje akcie",
    items: [
      { id: "portfolio", label: "Portfolio" },
      { id: "monitoring", label: "Monitoring portfolia" },
      { id: "watchlist", label: "Watchlist" },
    ],
  },
  investice: {
    label: "Nástroje",
    items: [{ id: "investice", label: "Měsíční investice" }],
  },
};

/** The main-row entry whose group contains `t`, or null for a plain tab. */
const skupinaTabu = (t: TabId): TabId | null =>
  (Object.keys(SKUPINY) as TabId[]).find((k) => SKUPINY[k]!.items.some((i) => i.id === t)) ?? null;

/**
 * The tab row as rendered: what ships, then whatever `src/rozsireni/`
 * contributes.
 *
 * Extension tabs go last so that an update adding a tab of its own never
 * appears in the middle of someone's own features.
 */
const VSECHNY_TABS: { id: TabId; label: string; devOnly?: boolean }[] = [
  ...TABS,
  ...ROZSIRENI.flatMap((r) =>
    r.zalozka ? [{ id: `ext:${r.id}` as TabId, label: r.zalozka.label }] : [],
  ),
];

/** Renders whichever extension owns the open tab. */
function RozsireniZalozka({
  tab,
  ticker,
  tickery,
}: {
  tab: TabId;
  ticker: string | null;
  tickery: { ticker: string; name: string | null }[];
}) {
  const rozsireni = ROZSIRENI.find((r) => `ext:${r.id}` === tab);
  if (!rozsireni?.zalozka) return null;
  const Obsah = rozsireni.zalozka.obsah;
  return <Obsah ticker={ticker} tickery={tickery} />;
}

/**
 * `packaged` comes from the server, because only the server can tell a shared
 * copy from the project it was built from.
 */
export function Dashboard({ packaged = false }: { packaged?: boolean }) {
  const [tickers, setTickers] = useState<TickerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<StockData | null>(null);
  const [stale, setStale] = useState(false);

  const [input, setInput] = useState("");
  /** Optional CIK for filers SEC's ticker directory does not list. */
  const [cikInput, setCikInput] = useState("");
  const [progress, setProgress] = useState<IngestProgress[]>([]);
  const [busy, setBusy] = useState(false);

  const [layout, setLayout] = useState<string[]>(DEFAULT_LAYOUT);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("max");
  const [resolution, setResolution] = useState<Resolution>("weekly");
  // Split-adjusted is the default: it is the only basis comparable across a split.
  const [priceMode, setPriceMode] = useState<"split" | "total" | "raw">("split");
  // Same idea as priceMode, for the share-count charts: actual counts as
  // filed, or everything restated into today's shares so the trend shows.
  const [sharesAdjusted, setSharesAdjusted] = useState(false);
  // Bumped whenever a download finishes, so the archive list refetches.
  const [archiveKey, setArchiveKey] = useState(0);
  // Only the open tab mounts. With a whole index loaded, rendering every
  // section at once meant Recharts laying out dozens of charts on each change.
  const [tab, setTab] = useState<TabId>("charts");
  // Reopening a group returns to whichever of its tabs was used last.
  const [posledni, setPosledni] = useState<Partial<Record<TabId, TabId>>>({});
  useEffect(() => {
    const g = skupinaTabu(tab);
    if (g) setPosledni((p) => (p[g] === tab ? p : { ...p, [g]: tab }));
  }, [tab]);
  const otevrenaSkupina = skupinaTabu(tab);
  const [dragState, setDragState] = useState<{ from: number | null; over: number | null }>({
    from: null,
    over: null,
  });

  const logRef = useRef<HTMLDivElement>(null);

  /* ---- layout persistence ---- */
  useEffect(() => {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((id) => CHART_BY_ID.has(id));
        if (valid.length) setLayout(valid);
      } catch {
        /* corrupt entry — fall back to the default layout */
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  /* ---- ticker list ---- */
  const loadTickers = useCallback(async () => {
    const res = await fetch("/api/tickers");
    const json = (await res.json()) as { tickers: TickerRow[] };
    setTickers(json.tickers);
    return json.tickers;
  }, []);

  useEffect(() => {
    loadTickers().then((list) => {
      if (list.length && !selected) setSelected(list[0].ticker);
    });
    // Runs once on mount; `selected` is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- stock data ---- */
  useEffect(() => {
    if (!selected) {
      setData(null);
      return;
    }
    let cancelled = false;
    setStale(true);
    fetch(`/api/stock/${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((json: StockData & { error?: string }) => {
        if (cancelled) return;
        if (json.error) {
          setData(null);
        } else {
          setData(json);
        }
        setStale(false);
      })
      .catch(() => !cancelled && setStale(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [progress]);

  /* ---- ingest ---- */
  const runIngest = useCallback(
    async (raw: string, rawCik?: string) => {
      const ticker = raw.trim().toUpperCase();
      if (!ticker || busy) return;
      setBusy(true);
      setProgress([]);

      // Only delisted or directory-less filers need one, so it goes only when filled.
      const cik = rawCik?.replace(/\D/g, "") || null;

      try {
        const res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, resolution, cik }),
        });
        if (!res.body) throw new Error("Server nevrátil stream");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line) as IngestProgress;
            setProgress((p) => [...p, evt]);
          }
        }

        const list = await loadTickers();
        setArchiveKey((k) => k + 1);
        if (list.some((t) => t.ticker === ticker)) {
          setSelected(ticker);
          setInput("");
        }
      } catch (e) {
        setProgress((p) => [
          ...p,
          { step: "error", message: "Chyba", pct: 100, error: (e as Error).message },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadTickers, resolution],
  );

  /** Manual price import — the escape hatch when every online source is blocked. */
  const importCsv = useCallback(
    async (file: File, ticker: string) => {
      setProgress([
        { step: "csv", message: `Nahrávám ${file.name} pro ${ticker}…`, pct: 30 },
      ]);
      try {
        const res = await fetch(`/api/prices/import?ticker=${encodeURIComponent(ticker)}`, {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: await file.text(),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          stored?: number;
          from?: string;
          to?: string;
          error?: string;
        };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        setProgress([
          {
            step: "csv",
            message: `Uloženo ${json.stored?.toLocaleString("cs-CZ")} dnů (${json.from} → ${json.to})`,
            pct: 100,
            done: true,
          },
        ]);
        await loadTickers();
        // Re-fetch the dashboard payload with the new prices.
        setSelected(null);
        setTimeout(() => setSelected(ticker), 0);
      } catch (e) {
        setProgress([
          {
            step: "error",
            message: "Import CSV selhal",
            pct: 100,
            error: (e as Error).message,
          },
        ]);
      }
    },
    [loadTickers],
  );

  /** Pull only the days missing since the last stored bar. */
  const topUpPrices = useCallback(
    async (ticker: string) => {
      if (busy) return;
      setBusy(true);
      setProgress([{ step: "update", message: `Doplňuji chybějící ceny pro ${ticker}…`, pct: 30 }]);
      try {
        const res = await fetch("/api/prices/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
          after?: { count: number; from: string | null; to: string | null };
        };
        setProgress([
          {
            step: json.ok ? "update" : "error",
            message:
              json.message ??
              `Doplnění selhalo — uložená historie (${json.after?.count.toLocaleString("cs-CZ") ?? 0} dnů) zůstala beze změny.`,
            pct: 100,
            done: true,
            error: json.ok ? undefined : json.error,
          },
        ]);
        if (json.ok) {
          await loadTickers();
          setSelected(null);
          setTimeout(() => setSelected(ticker), 0);
        }
      } catch (e) {
        setProgress([
          { step: "error", message: "Doplnění selhalo", pct: 100, error: (e as Error).message },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, loadTickers],
  );

  const removeTicker = useCallback(
    async (ticker: string) => {
      if (!confirm(`Opravdu smazat ${ticker} z lokální databáze včetně všech dat?`)) return;
      await fetch(`/api/tickers?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" });
      const list = await loadTickers();
      if (selected === ticker) setSelected(list[0]?.ticker ?? null);
    },
    [loadTickers, selected],
  );

  /* ---- range filtering: one filter row scoping every chart ---- */
  const cutoff = useMemo(() => {
    const r = RANGES.find((x) => x.id === range)!;
    if (r.years === 0) return null;
    const d = new Date();
    d.setFullYear(d.getFullYear() - r.years);
    return d.toISOString().slice(0, 10);
  }, [range]);

  const sliced = useMemo(() => {
    if (!data) return null;
    const clip = (s: SeriesPoint[]) => (cutoff ? s.filter((p) => p.date >= cutoff) : s);

    // "close" resolves to whichever basis the user picked, so every price chart
    // switches together rather than each carrying its own toggle.
    const closeKey =
      priceMode === "raw" ? "close_raw" : priceMode === "total" ? "close_total" : "close_split";

    const priceSeries: Record<string, SeriesPoint[]> = {
      close: clip(data.derived[closeKey] ?? []),
      open: [],
      high: [],
      low: [],
      volume: [],
      adjClose: [],
    };
    for (const bar of data.prices) {
      if (cutoff && bar.date < cutoff) continue;
      priceSeries.open.push({ date: bar.date, value: bar.open });
      priceSeries.high.push({ date: bar.date, value: bar.high });
      priceSeries.low.push({ date: bar.date, value: bar.low });
      priceSeries.volume.push({ date: bar.date, value: bar.volume });
      priceSeries.adjClose.push({ date: bar.date, value: bar.adjClose });
    }

    const mapClip = (rec: Record<string, SeriesPoint[]>) =>
      Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, clip(v)]));

    const quarterly = mapClip(data.quarterly);
    const balance = mapClip(data.balance);
    const derived = mapClip(data.derived);

    // Swap in the restated counts under the same field names, so every chart
    // and table that plots shares follows the toggle without knowing about it.
    if (sharesAdjusted) {
      if (derived.shares_outstanding_adj) balance.shares_outstanding = derived.shares_outstanding_adj;
      if (derived.shares_diluted_adj) quarterly.shares_diluted = derived.shares_diluted_adj;
      if (derived.shares_basic_adj) quarterly.shares_basic = derived.shares_basic_adj;
    }

    return { price: priceSeries, annual: mapClip(data.annual), quarterly, balance, derived };
  }, [data, cutoff, priceMode, sharesAdjusted]);

  const seriesFor = useCallback(
    (chartId: string): Record<string, SeriesPoint[]> => {
      const def = CHART_BY_ID.get(chartId);
      if (!def || !sliced) return {};
      const out: Record<string, SeriesPoint[]> = {};
      for (const s of def.series) {
        out[s.field] = sliced[s.source][s.field] ?? [];
      }
      return out;
    },
    [sliced],
  );

  const moveChart = useCallback((from: number, to: number) => {
    setLayout((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const lastProgress = progress[progress.length - 1];

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "1.5rem 1.25rem 4rem" }}>
      <header
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Stocks Analyzer
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 2 }}>
            Denní historie cen a uzávěrky z SEC EDGAR — vše uložené lokálně v SQLite.
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </div>
      </header>

      <TickerPicker
        tickers={tickers}
        selected={selected}
        onSelect={setSelected}
        onRemove={removeTicker}
        resolution={resolution}
        busy={busy}
        setBusy={setBusy}
        onChanged={() => {
          loadTickers();
          setArchiveKey((k) => k + 1);
        }}
      />

      {!data && !stale && tickers.length === 0 && (
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Zadej ticker nahoře. Aplikace stáhne denní historii cen za maximální dostupnou dobu
            a všechny roční i kvartální uzávěrky z databáze SEC.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* ---------- summary strip ---------- */}
          <section
            className="card"
            style={{ padding: "1rem 1.1rem", marginBottom: "1rem" }}
            aria-label="Přehled"
          >
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{data.company.ticker}</h2>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  {data.company.name}
                </span>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 3 }}>
                {[
                  data.company.sector &&
                    `${data.company.sector}${data.company.subIndustry ? ` — ${data.company.subIndustry}` : ""}` +
                      // Odvozený sektor se tváří stejně jako ten z indexu, a to
                      // by u firmy mimo index svádělo brát ho jako fakt.
                      (data.company.sectorSource === "sic" ? " (odvozeno ze SIC)" : ""),
                  data.company.sicDescription && `SIC: ${data.company.sicDescription}`,
                  data.company.cik && `CIK ${data.company.cik}`,
                  data.summary.priceFrom &&
                    `ceny ${data.summary.priceFrom} → ${data.summary.priceTo} (${data.summary.priceCount.toLocaleString("cs-CZ")} ${
                      { daily: "dnů", weekly: "týdnů", monthly: "měsíců" }[
                        data.company.resolution ?? "daily"
                      ]
                    })`,
                  data.filings.length > 0 && `${data.filings.length} výkazů 10-K/10-Q`,
                  data.company.resolution &&
                    `rozlišení: ${
                      { daily: "denní", weekly: "týdenní", monthly: "měsíční" }[
                        data.company.resolution
                      ]
                    }`,
                  data.splits?.length &&
                    `splity: ${data.splits
                      .map((sp) => `${sp.date.slice(0, 4)} ${sp.label ?? `${sp.value}:1`}`)
                      .join(", ")}`,
                  data.company.priceSource && `zdroj cen: ${data.company.priceSource}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {data.warnings?.length ? (
              <div
                role="alert"
                style={{
                  border: "1px solid var(--status-critical)",
                  borderRadius: 8,
                  padding: "0.5rem 0.7rem",
                  marginBottom: "0.75rem",
                  fontSize: "0.8rem",
                  color: "var(--text-primary)",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <span aria-hidden style={{ color: "var(--status-critical)" }}>⚠</span>
                <div>{data.warnings.join(" ")}</div>
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
                gap: "0.9rem",
              }}
            >
              <Stat label="Cena" value={formatValue(data.summary.lastPrice, "currency")}
                    delta={data.summary.changePct} />
              <Stat label="Tržní kap." value={formatValue(data.summary.marketCap, "currency")} />
              <Stat label="P/E" value={formatValue(data.summary.pe, "ratio")} />
              <Stat label="P/S" value={formatValue(data.summary.ps, "ratio")} />
              <Stat label="P/B" value={formatValue(data.summary.pb, "ratio")} />
              <Stat label="PEG" value={formatValue(data.summary.peg, "ratio")} />
              <Stat label="Tržby TTM" value={formatValue(data.summary.ttmRevenue, "currency")} />
              <Stat label="Zisk TTM" value={formatValue(data.summary.ttmNetIncome, "currency")} />
              <Stat label="EPS TTM" value={formatValue(data.summary.ttmEps, "ratio")} />
              <Stat label="ROE" value={formatValue(data.summary.roe, "percent")} />
              <Stat label="Beta (5 let)" value={formatValue(data.summary.beta, "ratio")} />
              <Stat label="Div. výnos" value={formatValue(data.summary.dividendYield, "percent")} />
              <Stat label="Od maxima" value={formatValue(data.summary.drawdown, "percent")} />
            </div>
          </section>

          {/* ---------- one filter row scoping every chart ---------- */}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Období:</span>
            {RANGES.map((r) => (
              <button
                key={r.id}
                className="btn"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.6rem" }}>
              Ceny:
            </span>
            {(
              [
                ["split", "Split adjusted"],
                ["total", "Vč. dividend"],
                ["raw", "Jak se obchodovalo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className="btn"
                aria-pressed={priceMode === id}
                onClick={() => setPriceMode(id)}
                title={
                  id === "split"
                    ? "Historické ceny přepočtené na dnešní počet akcií"
                    : id === "total"
                      ? "Split i dividendy — celkový výnos investora"
                      : "Přesně to, co se tehdy obchodovalo (skáče na splitech)"
                }
              >
                {label}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
              <button
                className="btn"
                disabled={busy}
                onClick={() => topUpPrices(data.company.ticker)}
                title={
                  data.summary.priceTo
                    ? `Stáhne jen dny po ${data.summary.priceTo}`
                    : "Stáhne celou historii cen"
                }
              >
                Doplnit ceny
              </button>
            </div>
          </div>


          {/* Price is the anchor every other chart is read against, so it stays
              on screen whichever tab is open. */}
          <div style={{ marginBottom: "1rem" }}>
            <ChartCard
              pinned
              def={localizeDef(
                CHART_BY_ID.get("price_close")!,
                data.company.resolution ?? "weekly",
                priceMode,
              )}
              data={seriesFor("price_close")}
              stale={stale}
              index={0}
              total={1}
              onRemove={() => {}}
              onMove={() => {}}
              dragState={{ from: null, over: null }}
              setDragState={() => {}}
              pricesMissing={data.prices.length === 0}
            />
          </div>
        </>
      )}

      {/* ---------- tabs ---------- */}
      <div
        role="tablist"
        aria-label="Sekce"
        style={{
          display: "flex",
          gap: "0.3rem",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1rem",
        }}
      >
        {VSECHNY_TABS.filter((t) => !packaged || !t.devOnly).map((t) => {
          const skupina = SKUPINY[t.id] !== undefined;
          const active = skupina ? otevrenaSkupina === t.id : tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(skupina ? (posledni[t.id] ?? t.id) : t.id)}
              style={{
                border: "none",
                background: "transparent",
                padding: "0.5rem 0.85rem",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                borderBottom: active ? "2px solid var(--series-1)" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
              }}
            >
              {t.label}
              {skupina && (
                <span aria-hidden style={{ marginLeft: 5, fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  {active ? "▴" : "▾"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {otevrenaSkupina && (
        <div
          role="tablist"
          aria-label={SKUPINY[otevrenaSkupina]!.label}
          style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", margin: "-0.4rem 0 1rem" }}
        >
          {SKUPINY[otevrenaSkupina]!.items.map((m) => (
            <button
              key={m.id}
              role="tab"
              className="btn"
              aria-selected={tab === m.id}
              aria-pressed={tab === m.id}
              onClick={() => setTab(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {tab === "charts" && data && (
        <ChartBrowser
          available={data.available}
          seriesFor={seriesFor}
          resolution={data.company.resolution ?? "weekly"}
          priceMode={priceMode}
          sharesAdjusted={sharesAdjusted}
          setSharesAdjusted={setSharesAdjusted}
          stale={stale}
          pricesMissing={data.prices.length === 0}
          layout={layout}
          setLayout={setLayout}
          moveChart={moveChart}
          dragState={dragState}
          setDragState={setDragState}
        />
      )}

      {tab === "peers" && <PeerComparison ticker={selected} />}

      {tab === "risk" && !packaged && (
        <>
          <ClaudeRequired />
          <RiskAnalysis ticker={selected} />
        </>
      )}

      {tab === "chat" && (
        <>
          <ClaudeRequired />
          <ChatAnalyst ticker={selected} />
        </>
      )}

      {tab === "filings" && (
        <FilingsArchive
          reloadKey={archiveKey}
          ticker={selected}
          companyName={data?.company.name ?? null}
        />
      )}

      {/* Portfolio is the one tab that is not about the selected company. */}
      {tab === "portfolio" && <PortfolioSimulator tickers={tickers} />}

      {/* The real holdings, as opposed to the simulator's what-ifs. */}
      {tab === "monitoring" && (
        <PortfolioMonitoring tickers={tickers} onDownload={runIngest} downloading={busy} />
      )}

      {tab === "watchlist" && (
        <Watchlist
          tickers={tickers}
          selected={selected}
          onOpen={(t) => {
            setSelected(t);
            setTab("charts");
          }}
          onDownload={runIngest}
          downloading={busy}
        />
      )}

      {tab === "investice" && <InvestmentCalculator />}

      {/* Anything added in src/rozsireni/ — an update never brings these files. */}
      {tab.startsWith("ext:") && (
        <RozsireniZalozka tab={tab} ticker={selected} tickery={tickers} />
      )}

      {tab === "settings" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          <SettingsPanel packaged={packaged} />
          {/* Assembling a package is the author's job; a shared copy never does it. */}
          {!packaged && <PackagePanel />}
        </div>
      )}

      {tab === "data" && (
        <div style={{ display: "grid", gap: "1rem" }}>
        {/* ---------- ingest ---------- */}
        <section className="card" style={{ padding: "1rem 1.1rem", marginBottom: "1rem" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runIngest(input, cikInput);
            }}
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Ticker, např. AAPL"
              disabled={busy}
              style={{
                padding: "0.5rem 0.75rem",
                fontSize: "0.95rem",
                width: 200,
                fontWeight: 600,
                letterSpacing: "0.03em",
              }}
              aria-label="Ticker akcie"
            />
            <input
              value={cikInput}
              onChange={(e) => setCikInput(e.target.value.replace(/\D/g, ""))}
              placeholder="CIK (nepovinné)"
              disabled={busy}
              inputMode="numeric"
              style={{ padding: "0.5rem 0.75rem", fontSize: "0.85rem", width: 150 }}
              aria-label="CIK firmy u SEC"
              title={
                "Vyplň jen u firem, které SEC nemá v rejstříku tickerů — typicky delistované " +
                "po fúzi nebo stažení z burzy. Rowan Companies (RDC) má CIK 85408."
              }
            />
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
              disabled={busy}
              style={{ padding: "0.5rem 0.6rem", fontSize: "0.85rem" }}
              aria-label="Rozlišení cen"
              title="Týdenní data má Alpha Vantage zdarma až do roku 1999; denní jen 100 posledních dnů."
            >
              <option value="weekly">Týdenní</option>
              <option value="daily">Denní</option>
              <option value="monthly">Měsíční</option>
            </select>
            <button
              type="submit"
              className="btn"
              disabled={busy || !input.trim()}
              style={{
                background: "var(--text-primary)",
                color: "var(--surface-1)",
                borderColor: "var(--text-primary)",
                fontWeight: 600,
                padding: "0.5rem 1rem",
              }}
            >
              {busy ? "Stahuji…" : "Stáhnout a analyzovat"}
            </button>

            <label
              className="btn"
              style={{ display: "inline-flex", alignItems: "center", padding: "0.5rem 0.8rem" }}
              title="Nahrát denní OHLCV z CSV (export ze Stooq nebo Yahoo) pro vybraný ticker"
            >
              Nahrát ceny z CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const target = input.trim().toUpperCase() || selected;
                  if (file && target) importCsv(file, target);
                  else if (file) alert("Nejdřív zadej ticker nebo nějaký vyber.");
                  e.target.value = "";
                }}
              />
            </label>
          </form>

          {progress.length > 0 && (
            <div style={{ marginTop: "0.85rem" }}>
              <div
                style={{
                  height: 3,
                  background: "var(--grid)",
                  borderRadius: 2,
                  overflow: "hidden",
                  marginBottom: "0.5rem",
                }}
                role="progressbar"
                aria-valuenow={lastProgress?.pct ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  style={{
                    width: `${lastProgress?.pct ?? 0}%`,
                    height: "100%",
                    background: lastProgress?.error ? "var(--status-critical)" : "var(--series-1)",
                    transition: "width 250ms ease",
                  }}
                />
              </div>
              <div
                ref={logRef}
                style={{ maxHeight: 130, overflow: "auto", fontSize: "0.8rem" }}
                aria-live="polite"
              >
                {progress.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      color: p.error ? "var(--status-critical)" : "var(--text-secondary)",
                      padding: "1px 0",
                    }}
                  >
                    {p.error ? "⚠ " : "· "}
                    {p.message}
                    {p.error && p.message !== p.error ? ` — ${p.error}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <UniversePanel
          resolution={resolution}
          busy={busy}
          setBusy={setBusy}
          onFinished={() => {
            loadTickers();
            setArchiveKey((k) => k + 1);
          }}
        />

        {/* ---------- ticker switcher ---------- */}
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
      {delta !== undefined && delta !== null && Number.isFinite(delta) && (
        <div
          style={{
            fontSize: "0.72rem",
            color: delta >= 0 ? "var(--delta-up)" : "var(--delta-down)",
            marginTop: 1,
          }}
        >
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} %
        </div>
      )}
    </div>
  );
}
