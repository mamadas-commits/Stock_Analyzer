"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Making a copy someone else can run — and, later, an update for a copy they
 * already have.
 *
 * The update half is the reason this lives in the app at all: every build
 * records a hash of every file, so "what changed since the version they have"
 * is a lookup rather than a guess, and an update is a few megabytes instead of
 * the whole thing.
 */

type TargetOption = { id: string; label: string; default: boolean };
type Shape = "run" | "source";
type Artifact = { name: string; size: number; at: string; shape: Shape | null };
type ManifestRow = { version: string; builtAt: string; shape: Shape };

const SHAPE_LABEL: Record<Shape, string> = { source: "zdroják", run: "hotová aplikace" };

/** "1.0.1" → "1.0.2", "1" → "2"; anything without a trailing number gets ".1". */
function nextVersion(v: string): string {
  const m = v.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`;
}
type Plan = { from: string; to: string; changed: string[]; removed: string[]; bytes: number };

type Info = {
  version: string;
  dist: string;
  targets: TargetOption[];
  manifests: ManifestRow[];
  artifacts: Artifact[];
};

const mb = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;

const help: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--text-muted)",
  marginTop: "0.35rem",
  lineHeight: 1.45,
};

export function PackagePanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [version, setVersion] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [shape, setShape] = useState<"run" | "source">("run");
  // Once someone picks a shape by hand, a reload of the list must not undo it.
  const shapeChosen = useRef(false);
  const [includeData, setIncludeData] = useState(false);
  const [includePrices, setIncludePrices] = useState(true);
  const [includeSecArchive, setIncludeSecArchive] = useState(false);
  const [skipBuild, setSkipBuild] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [plan, setPlan] = useState<Plan | { error: string } | null>(null);

  const shapeOf = (v: string) => info?.manifests.find((m) => m.version === v)?.shape;
  const shapeMismatch = !!from && !!to && from !== to && shapeOf(from) !== shapeOf(to);

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/package");
    if (!res.ok) return;
    const json = (await res.json()) as Info;
    setInfo(json);
    // Continue from the last export: the next version, in the same shape. The
    // package.json version is a fallback only — it says 0.1.0 and never moves,
    // and starting from "hotová aplikace" made it easy to ship a package the
    // recipients' installs could not take as an update.
    const last = json.manifests[0];
    setVersion((v) => v || (last ? nextVersion(last.version) : json.version));
    if (last) setShape((sh) => (shapeChosen.current ? sh : last.shape));
    setTargets((t) => (t.length ? t : json.targets.filter((x) => x.default).map((x) => x.id)));
    if (json.manifests.length) {
      setFrom((f) => f || json.manifests[Math.min(1, json.manifests.length - 1)]?.version || "");
      setTo((t) => t || json.manifests[0].version);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  // Show what an update would carry before anyone waits for it to be built.
  useEffect(() => {
    if (!from || !to || from === to) {
      setPlan(null);
      return;
    }
    let alive = true;
    fetch(`/api/package?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((j) => alive && setPlan(j.plan))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [from, to]);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      if (busy) return;
      setBusy(true);
      setLog([]);
      try {
        const res = await fetch("/api/package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
            const evt = JSON.parse(line) as { message: string; error?: string };
            setLog((l) => [...l, `${evt.error ? "⚠ " : ""}${evt.message}${evt.error ? ` — ${evt.error}` : ""}`]);
          }
        }
        await load();
      } catch (e) {
        setLog((l) => [...l, `Selhalo: ${(e as Error).message}`]);
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const toggleTarget = (id: string) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <section className="card" style={{ padding: "1rem 1.1rem" }}>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.3rem" }}>
        Balíček pro sdílení
      </h2>
      <p style={help}>
        Vyrobí ZIP, který stačí rozbalit a spustit — s přibaleným Node.js, takže protistrana
        nic neinstaluje. Klíče z <code>.env.local</code> se do balíku nedostanou; příjemce si
        je vyplní v Nastavení.
      </p>

      {/* ---------- tvar instalace ---------- */}
      <div style={{ marginTop: "0.9rem" }}>
        <strong style={{ fontSize: "0.8rem" }}>Co má příjemce dostat</strong>
        <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.4rem" }}>
          <label style={{ fontSize: "0.8rem", display: "flex", gap: "0.35rem" }}>
            <input
              type="radio"
              name="tvar"
              checked={shape === "run"}
              onChange={() => {
                shapeChosen.current = true;
                setShape("run");
              }}
              disabled={busy}
            />
            Hotovou aplikaci ke spuštění
          </label>
          <label style={{ fontSize: "0.8rem", display: "flex", gap: "0.35rem" }}>
            <input
              type="radio"
              name="tvar"
              checked={shape === "source"}
              onChange={() => {
                shapeChosen.current = true;
                setShape("source");
              }}
              disabled={busy}
            />
            Zdroják, do kterého si může sáhnout
          </label>
        </div>
        <p style={help}>
          {shape === "run"
            ? "Kód je přeložený a aktualizace ho vyměňuje celý. Nejmenší balík."
            : "Přibalí se zdroják i závislosti, takže si příjemce může dopsat vlastní funkce a " +
              "aplikace se po změně sama přeloží (npm k tomu nepotřebuje). Aktualizace pak " +
              "jeho úpravy slučuje s novou verzí místo přepisu. Balík je asi o 160 MB větší " +
              "a skládá se déle."}
        </p>
      </div>

      {/* ---------- platformy ---------- */}
      <div style={{ marginTop: "0.9rem" }}>
        <strong style={{ fontSize: "0.8rem" }}>Pro které systémy</strong>
        <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
          {info?.targets.map((t) => (
            <label key={t.id} style={{ fontSize: "0.8rem", display: "flex", gap: "0.35rem" }}>
              <input
                type="checkbox"
                checked={targets.includes(t.id)}
                onChange={() => toggleTarget(t.id)}
                disabled={busy}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {/* ---------- data ---------- */}
      <div style={{ marginTop: "0.9rem" }}>
        <strong style={{ fontSize: "0.8rem" }}>Co přibalit</strong>
        <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.4rem" }}>
          <label style={{ fontSize: "0.8rem", display: "flex", gap: "0.35rem" }}>
            <input
              type="checkbox"
              checked={includeData}
              onChange={(e) => setIncludeData(e.target.checked)}
              disabled={busy}
            />
            Databázi se staženými daty
          </label>
          <label
            style={{
              fontSize: "0.8rem",
              display: "flex",
              gap: "0.35rem",
              paddingLeft: "1.4rem",
              opacity: includeData ? 1 : 0.45,
            }}
          >
            <input
              type="checkbox"
              checked={includePrices}
              onChange={(e) => setIncludePrices(e.target.checked)}
              disabled={busy || !includeData}
            />
            včetně cenových řad
          </label>
          <label
            style={{
              fontSize: "0.8rem",
              display: "flex",
              gap: "0.35rem",
              paddingLeft: "1.4rem",
              opacity: includeData ? 1 : 0.45,
            }}
          >
            <input
              type="checkbox"
              checked={includeSecArchive}
              onChange={(e) => setIncludeSecArchive(e.target.checked)}
              disabled={busy || !includeData}
            />
            včetně archivu companyfacts.json (jednotky GB)
          </label>
        </div>
        <p style={help}>
          Bez databáze má balík kolem {shape === "source" ? "230" : "70"} MB a příjemce si
          data stáhne sám — na celý index ale potřebuje vlastní klíč a několik hodin.
          S databází dostane všechno hotové.
        </p>
      </div>

      {/* ---------- verze a spuštění ---------- */}
      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: "1rem",
        }}
      >
        <label style={{ fontSize: "0.8rem" }}>
          Verze{" "}
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={busy}
            style={{ padding: "0.35rem 0.5rem", width: 100, fontSize: "0.85rem" }}
          />
        </label>
        <label style={{ fontSize: "0.8rem", display: "flex", gap: "0.35rem" }}>
          <input
            type="checkbox"
            checked={skipBuild}
            onChange={(e) => setSkipBuild(e.target.checked)}
            disabled={busy}
          />
          <span title="Ušetří minutu, když balíš stejný kód jen s jinými volbami. Když se zdroják od posledního buildu změnil, build proběhne tak jako tak.">
            použít poslední build
          </span>
        </label>
        <button
          className="btn"
          disabled={busy || targets.length === 0 || !version.trim()}
          onClick={() =>
            run({
              mode: "package",
              shape,
              targets,
              version: version.trim(),
              includeData,
              includePrices,
              includeSecArchive,
              skipBuild,
            })
          }
          style={{
            background: "var(--text-primary)",
            color: "var(--surface-1)",
            borderColor: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          {busy ? "Pracuji…" : "Vytvořit archiv"}
        </button>
      </div>

      {/* ---------- aktualizace ---------- */}
      <div
        style={{ marginTop: "1.2rem", borderTop: "1px solid var(--grid)", paddingTop: "0.9rem" }}
      >
        <strong style={{ fontSize: "0.8rem" }}>Aktualizace místo celého balíku</strong>
        <p style={help}>
          Rozdíl mezi dvěma vyrobenými verzemi. Přibalený Node a knihovny se mezi verzemi
          nemění, takže aktualizace bývá jednotky megabajtů — a je jedna pro všechny systémy.
          Adresáře <code>data/</code> se nedotkne.
        </p>
        <div
          style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}
        >
          <label style={{ fontSize: "0.8rem" }}>
            z{" "}
            <select value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy}>
              <option value="">—</option>
              {info?.manifests.map((m) => (
                <option key={m.version} value={m.version}>
                  {m.version} · {SHAPE_LABEL[m.shape]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.8rem" }}>
            na{" "}
            <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}>
              <option value="">—</option>
              {info?.manifests.map((m) => (
                <option key={m.version} value={m.version}>
                  {m.version} · {SHAPE_LABEL[m.shape]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            disabled={busy || !from || !to || from === to || shapeMismatch}
            onClick={() => run({ mode: "update", from, to })}
          >
            Vytvořit aktualizaci
          </button>
          {shapeMismatch && (
            <span style={{ fontSize: "0.75rem", color: "var(--status-critical)" }}>
              Mezi hotovou aplikací a zdrojákem se aktualizací přejít nedá — pošli plný balík.
            </span>
          )}
          {!shapeMismatch && plan && "error" in plan && (
            <span style={{ fontSize: "0.75rem", color: "var(--status-critical)" }}>{plan.error}</span>
          )}
          {!shapeMismatch && plan && !("error" in plan) && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {plan.changed.length} změněných, {plan.removed.length} ke smazání,{" "}
              {mb(plan.bytes)} před kompresí
            </span>
          )}
        </div>
        {info?.manifests.length === 0 && (
          <p style={help}>Zatím není z čeho počítat rozdíl — nejdřív vyrob aspoň jeden balík.</p>
        )}
      </div>

      {log.length > 0 && (
        <div
          ref={logRef}
          style={{
            maxHeight: 180,
            overflow: "auto",
            fontSize: "0.78rem",
            marginTop: "0.8rem",
            color: "var(--text-secondary)",
          }}
          aria-live="polite"
        >
          {log.map((l, i) => (
            <div key={i} style={{ padding: "1px 0" }}>
              {l}
            </div>
          ))}
        </div>
      )}

      {info && info.artifacts.length > 0 && (
        <div style={{ marginTop: "0.9rem" }}>
          <strong style={{ fontSize: "0.8rem" }}>Hotové balíky</strong>
          <p style={help}>
            Leží v <code>{info.dist}</code>.
          </p>
          <table className="dataview" style={{ marginTop: "0.4rem" }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left" }}>
                  Soubor
                </th>
                <th scope="col" style={{ textAlign: "left" }}>
                  Tvar
                </th>
                <th scope="col">Velikost</th>
                <th scope="col">Vyrobeno</th>
              </tr>
            </thead>
            <tbody>
              {info.artifacts.map((a) => (
                <tr key={a.name}>
                  <th scope="row" style={{ textAlign: "left", fontWeight: 500 }}>
                    {a.name}
                  </th>
                  <td style={{ textAlign: "left" }}>
                    {a.shape ? (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "1px 7px",
                          borderRadius: 6,
                          border: "1px solid var(--border-strong)",
                          color: a.shape === "source" ? "var(--text-primary)" : "var(--text-secondary)",
                          fontWeight: a.shape === "source" ? 600 : 400,
                        }}
                        title={
                          a.shape === "source"
                            ? "Projekt se zdrojákem a závislostmi; příjemce si ho může upravovat, aktualizace se slučují"
                            : "Přeložená aplikace; jde jen spouštět"
                        }
                      >
                        {SHAPE_LABEL[a.shape]}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }} title="verze.json v archivu nejde přečíst">
                        –
                      </span>
                    )}
                  </td>
                  <td>{mb(a.size)}</td>
                  <td>{new Date(a.at).toLocaleString("cs-CZ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
