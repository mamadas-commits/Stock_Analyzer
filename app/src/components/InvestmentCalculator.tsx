"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "./ChartCard";
import type { ChartDef } from "@/lib/catalog";
import type { UnitKind } from "@/lib/format";
import { planInvestice, requiredMonthly, type InvesticeVstup } from "@/lib/investice";
import type { SeriesPoint } from "@/lib/types";

/**
 * Kolik měsíčně investovat, abych za danou dobu měl cílovou částku.
 *
 * Nepotřebuje žádná data ani vybranou firmu — čistý výpočet, proto patří pod
 * „Nástroje“, ne k akciím.
 */

type Mena = "CZK" | "EUR" | "USD";
const UNIT: Record<Mena, UnitKind> = { CZK: "czk", EUR: "eur", USD: "currency" };

const SYMBOL: Record<Mena, string> = { CZK: "Kč", EUR: "€", USD: "$" };
const wholeFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });

const num = (s: string): number => Number(s.replace(/\s/g, "").replace(",", "."));
const pctFmt = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const yearFmt = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

/** Spread of returns shown next to the chosen one — the least certain input. */
const CITLIVOST = [-2, 0, 2];

export function InvestmentCalculator() {
  const [form, setForm] = useState({
    target: "1 000 000",
    years: "10",
    returnPct: "7",
    start: "0",
  });
  const [atStart, setAtStart] = useState(false);
  const [mena, setMena] = useState<Mena>("CZK");
  const unit = UNIT[mena];
  // Whole units, not "5,8 tis.": this is a figure someone will set up a
  // standing order for, so it has to be the actual amount.
  const money = (v: number) => `${wholeFmt.format(Math.round(v))} ${SYMBOL[mena]}`;

  const parsed = useMemo((): { vstup: InvesticeVstup | null; chyba: string | null } => {
    const target = num(form.target);
    const years = num(form.years);
    const returnPct = num(form.returnPct);
    const start = form.start.trim() ? num(form.start) : 0;
    if (!Number.isFinite(target) || target <= 0) return { vstup: null, chyba: "Cílová částka musí být kladné číslo." };
    if (!Number.isFinite(years) || years <= 0 || years > 80) return { vstup: null, chyba: "Doba musí být mezi 0 a 80 lety." };
    if (!Number.isFinite(returnPct) || returnPct <= -100 || returnPct > 100) {
      return { vstup: null, chyba: "Očekávaný výnos zadej v procentech, např. 7." };
    }
    if (!Number.isFinite(start) || start < 0) return { vstup: null, chyba: "Počáteční vklad nesmí být záporný." };
    return { vstup: { target, years, returnPct, start, atStart }, chyba: null };
  }, [form, atStart]);

  const plan = useMemo(() => (parsed.vstup ? planInvestice(parsed.vstup) : null), [parsed]);

  const chart = useMemo(() => {
    if (!plan) return null;
    // Real calendar dates from today, so the axis reads as years ahead.
    const now = new Date();
    const at = (years: number) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + Math.round(years * 12));
      return d.toISOString().slice(0, 10);
    };
    const def: ChartDef = {
      id: "nastroj_investice",
      title: "Jak poroste investice",
      group: "Nástroje",
      type: "line",
      freq: "annual",
      unit,
      series: [
        { field: "value", label: "Hodnota", source: "price", slot: 1 },
        { field: "contributed", label: "Vloženo", source: "price", slot: 2 },
      ],
      note: "Hodnota na konci každého roku proti tomu, kolik do té doby vložíš. Rozdíl mezi křivkami je výnos.",
    };
    const data: Record<string, SeriesPoint[]> = {
      value: plan.schedule.map((s) => ({ date: at(s.year), value: s.value })),
      contributed: plan.schedule.map((s) => ({ date: at(s.year), value: s.contributed })),
    };
    return { def, data };
  }, [plan, unit]);

  const field = (key: keyof typeof form, label: string, suffix: string, hint?: string) => (
    <label
      style={{ display: "grid", gap: 4, alignContent: "start", fontSize: "0.78rem", color: "var(--text-secondary)" }}
    >
      {label}
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          inputMode="decimal"
          style={{ padding: "0.45rem 0.6rem", fontSize: "0.95rem", width: "100%", minWidth: 0 }}
        />
        <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{suffix}</span>
      </span>
      {hint && <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );

  const suffix = SYMBOL[mena];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section className="card" style={{ padding: "1rem 1.1rem" }} aria-label="Měsíční investice">
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "baseline", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600 }}>Kolik měsíčně investovat</h2>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            pravidelná investice potřebná k cílové částce
          </span>
          <div role="group" aria-label="Měna" style={{ marginLeft: "auto", display: "flex", gap: "0.3rem" }}>
            {(["CZK", "EUR", "USD"] as Mena[]).map((m) => (
              <button key={m} className="btn" aria-pressed={mena === m} onClick={() => setMena(m)}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "0.8rem 1rem",
            marginTop: "0.9rem",
          }}
        >
          {field("target", "Cílová částka", suffix)}
          {field("years", "Za kolik let", "let", "lze i desetinně, např. 2,5")}
          {field("returnPct", "Očekávaný výnos", "% ročně", "S&P 500 historicky ~10 %, po inflaci ~7 %")}
          {field("start", "Počáteční vklad", suffix, "nepovinné")}
        </div>

        <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginRight: 4 }}>Vklad</span>
          <button className="btn" aria-pressed={!atStart} onClick={() => setAtStart(false)}>
            na konci měsíce
          </button>
          <button className="btn" aria-pressed={atStart} onClick={() => setAtStart(true)}>
            na začátku měsíce
          </button>
        </div>

        {parsed.chyba && (
          <p style={{ fontSize: "0.82rem", color: "var(--status-critical)", marginTop: "0.7rem" }}>{parsed.chyba}</p>
        )}

        {plan && parsed.vstup && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "0.9rem 1.2rem",
                marginTop: "1rem",
                paddingTop: "0.9rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <Stat
                label="Měsíčně investovat"
                value={plan.startSuffices ? "nic" : money(plan.monthly)}
                hint={
                  plan.startSuffices
                    ? "počáteční vklad dosáhne cíle sám"
                    : `${plan.months.toLocaleString("cs-CZ")} vkladů`
                }
                big
              />
              <Stat label="Vložíš celkem" value={money(plan.contributed)} />
              <Stat
                label="Z toho výnos"
                value={money(plan.gain)}
                hint={
                  plan.finalValue > 0
                    ? `${pctFmt.format((plan.gain / plan.finalValue) * 100)} % cílové částky`
                    : undefined
                }
              />
              <Stat
                label="Na konci"
                value={money(plan.finalValue)}
                hint={`za ${yearFmt.format(parsed.vstup.years)} let`}
              />
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>
                Při jiném výnosu
              </div>
              <table className="dataview" style={{ maxWidth: 420 }}>
                <thead>
                  <tr>
                    <th scope="col">Výnos ročně</th>
                    <th scope="col">Měsíčně</th>
                  </tr>
                </thead>
                <tbody>
                  {CITLIVOST.map((d) => {
                    const r = parsed.vstup!.returnPct + d;
                    const m = requiredMonthly({ ...parsed.vstup!, returnPct: r });
                    return (
                      <tr key={d} style={d === 0 ? { fontWeight: 600 } : undefined}>
                        <th scope="row" style={{ fontWeight: d === 0 ? 600 : 400 }}>
                          {pctFmt.format(r)} %{d === 0 ? " (zadaný)" : ""}
                        </th>
                        <td>{m === 0 ? "nic" : money(m)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {chart && plan && plan.schedule.length > 1 && (
        <ChartCard
          pinned
          def={chart.def}
          data={chart.data}
          stale={false}
          index={0}
          total={1}
          onRemove={() => {}}
          onMove={() => {}}
          dragState={{ from: null, over: null }}
          setDragState={() => {}}
          pricesMissing={false}
        />
      )}

      {plan && plan.schedule.length > 1 && (
        <section className="card" style={{ padding: "1rem 1.1rem" }} aria-label="Plán po letech">
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.6rem" }}>Po letech</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="dataview">
              <thead>
                <tr>
                  <th scope="col">Rok</th>
                  <th scope="col">Vloženo celkem</th>
                  <th scope="col">Hodnota</th>
                  <th scope="col">Výnos</th>
                </tr>
              </thead>
              <tbody>
                {plan.schedule.slice(1).map((s) => (
                  <tr key={s.year}>
                    <th scope="row" style={{ fontWeight: 400 }}>
                      {yearFmt.format(s.year)}
                    </th>
                    <td>{money(s.contributed)}</td>
                    <td>{money(s.value)}</td>
                    <td>{money(s.value - s.contributed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="measure" style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
        Výpočet předpokládá stejný výnos každý rok a stejný vklad každý měsíc. Roční výnos se
        bere jako efektivní: měsíční sazba je jeho dvanáctá odmocnina, takže dvanáct měsíců dá
        přesně zadaný roční výnos (prosté dělení dvanácti by tiše počítalo s vyšším). Nepočítá
        s poplatky, daněmi ani inflací. Skutečné trhy rostou nerovnoměrně, takže výsledek je
        orientační — proto i tabulka s výnosem o 2 procentní body nižším a vyšším.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint?: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: big ? "1.4rem" : "1.05rem", fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
      {hint && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 1 }}>{hint}</div>}
    </div>
  );
}
