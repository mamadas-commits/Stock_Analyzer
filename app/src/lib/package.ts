import { ZipArchive } from "archiver";
import { inflateSync } from "fflate";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "./db";
import type { IngestProgress } from "./types";

/**
 * Building a copy of this app that someone else can run.
 *
 * The shape of the result is the whole design:
 *
 *   app/       the code — an update replaces this wholesale
 *   runtime/   a portable Node, so nothing has to be installed
 *   data/      the recipient's database and SEC archive — never touched again
 *   .env.local their keys — likewise
 *
 * Because `app/` and `data/` are separate directories, "an update must not
 * break their data" stops being a promise and becomes a property of the layout.
 *
 * `app/` comes in two shapes, chosen per build:
 *
 *   "run"    the standalone build — smallest, and nothing in it can be edited
 *   "source" the project itself, with dependencies and a pre-built `.next`
 *
 * The second exists because a recipient who wants to add a feature has no way
 * to do it to a bundle: the code there is compiled, and the next update
 * replaces it wholesale. Shipping the sources instead turns an update from a
 * file swap into a merge — see `puvodni/` below and `tools/apply-update.mjs`.
 * Neither shape needs npm on the receiving end: the dependencies ride along
 * installed, and `next build` runs from the bundled Node.
 *
 * `app/` is also platform-independent: better-sqlite3 picks its native binary
 * at runtime from `process.platform`, and we ship all of them. Only `runtime/`
 * differs per target, which is why one update package serves every platform.
 */

export const TARGETS = {
  "win-x64": { label: "Windows (x64)", dist: "win-x64", kind: "exe" },
  "win-arm64": { label: "Windows (ARM64)", dist: "win-arm64", kind: "exe" },
  "linux-x64": { label: "Linux (x64)", dist: "linux-x64", kind: "tar.xz" },
  "linux-arm64": { label: "Linux (ARM64)", dist: "linux-arm64", kind: "tar.xz" },
  "mac-arm64": { label: "macOS (Apple Silicon)", dist: "darwin-arm64", kind: "tar.gz" },
  "mac-x64": { label: "macOS (Intel)", dist: "darwin-x64", kind: "tar.gz" },
} as const;

export type Target = keyof typeof TARGETS;

export const DEFAULT_TARGETS: Target[] = ["win-x64", "linux-x64", "mac-arm64"];

/** Everything the package can carry, decided per build. */
export type PackageOptions = {
  targets: Target[];
  version: string;
  /**
   * "run" ships the compiled app, "source" the project it was built from.
   * Only the second one can be changed by whoever receives it.
   */
  shape: AppShape;
  /** Ship the database alongside the code, so the recipient starts with data. */
  includeData: boolean;
  /** Price history inside that database. */
  includePrices: boolean;
  /** The raw companyfacts.json archive — large, and re-downloadable from SEC. */
  includeSecArchive: boolean;
  /**
   * Reuse `.next/standalone` instead of rebuilding. `next build` wipes the
   * whole `.next` directory, which takes a running dev server with it, so
   * repackaging with only different options should not have to pay for that.
   */
  skipBuild?: boolean;
};

export type AppShape = "run" | "source";

export type ManifestEntry = { sha256: string; size: number };

export type Manifest = {
  version: string;
  builtAt: string;
  nodeVersion: string;
  /**
   * Which shape `app/` has. The updater reads it to decide whether a file the
   * recipient changed can be merged or only reported.
   */
  shape: AppShape;
  /** Hashes of everything outside `runtime/`, identical across targets. */
  app: Record<string, ManifestEntry>;
  /** Per-target, because the Node binary is the one file that differs. */
  runtime: Record<string, ManifestEntry>;
  /**
   * Source shape only: the platform-native packages each target carries
   * (name → version). Like `runtime/`, they differ per target and stay out of
   * `app`, so one update still fits every platform.
   */
  natives?: Record<string, Record<string, string>>;
};

const root = () => /* turbopackIgnore: true */ process.cwd();
const distDir = () => path.join(root(), "dist");
const cacheDir = () => path.join(distDir(), ".cache", "node");
const manifestDir = () => path.join(distDir(), "manifests");

type Emit = (p: IngestProgress) => void;

/* ------------------------------------------------------------------ */
/* portable Node runtime                                               */
/* ------------------------------------------------------------------ */

type NodeIndexEntry = { version: string; lts: false | string };

/**
 * Which Node to ship.
 *
 * Pinned to the newest LTS rather than to whatever runs the build: the
 * recipient's copy should not inherit an odd-numbered release just because the
 * developer happened to be on one.
 */
export async function latestLtsNode(): Promise<string> {
  const res = await fetch("https://nodejs.org/dist/index.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`nodejs.org vrátil HTTP ${res.status}`);
  const list = (await res.json()) as NodeIndexEntry[];
  const lts = list.find((e) => e.lts !== false);
  if (!lts) throw new Error("V indexu nodejs.org není žádná LTS verze");
  return lts.version.replace(/^v/, "");
}

function nodeUrl(version: string, target: Target): string {
  const t = TARGETS[target];
  const base = `https://nodejs.org/dist/v${version}`;
  if (t.kind === "exe") return `${base}/${t.dist}/node.exe`;
  return `${base}/node-v${version}-${t.dist}.${t.kind}`;
}

/** Filename as it appears in SHASUMS256.txt. */
function nodeShaName(version: string, target: Target): string {
  const t = TARGETS[target];
  return t.kind === "exe"
    ? `${t.dist}/node.exe`
    : `node-v${version}-${t.dist}.${t.kind}`;
}

async function expectedSha(version: string, target: Target): Promise<string | null> {
  try {
    const res = await fetch(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const want = nodeShaName(version, target);
    for (const line of (await res.text()).split("\n")) {
      const [sha, name] = line.trim().split(/\s+/);
      if (name === want) return sha;
    }
  } catch {
    /* Integrity check is best-effort; a missing list is not a build failure. */
  }
  return null;
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout?.on("data", (c) => (out += c));
    child.stderr?.on("data", (c) => (err = (err + c).slice(-4000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} skončil s kódem ${code}: ${err.trim()}`)),
    );
  });
}

/**
 * Fetch (once) the Node binary for a target and return its path.
 *
 * Only `bin/node` is taken out of the tarballs. The rest of a Node
 * distribution — headers, npm, docs — is another 60 MB that nothing in a
 * packaged copy ever opens.
 */
export async function ensureNodeRuntime(
  version: string,
  target: Target,
  emit: Emit,
): Promise<string> {
  const dir = path.join(cacheDir(), version, target);
  const binName = TARGETS[target].kind === "exe" ? "node.exe" : "node";
  const bin = path.join(dir, binName);
  if (fs.existsSync(bin) && fs.statSync(bin).size > 0) return bin;

  await fsp.mkdir(dir, { recursive: true });
  const url = nodeUrl(version, target);
  emit({ step: "runtime", message: `Stahuji Node ${version} pro ${TARGETS[target].label}…`, pct: 0 });

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) throw new Error(`Stažení Node selhalo: HTTP ${res.status} ${url}`);

  const download = path.join(dir, path.basename(url));
  await fsp.writeFile(download, Buffer.from(await res.arrayBuffer()));

  const want = await expectedSha(version, target);
  if (want) {
    const got = await sha256File(download);
    if (got !== want) {
      await fsp.rm(download, { force: true });
      throw new Error(
        `Kontrolní součet staženého Node nesedí (${got.slice(0, 12)}… vs ${want.slice(0, 12)}…).`,
      );
    }
    emit({ step: "runtime", message: `Kontrolní součet Node ${version} ověřen`, pct: 0 });
  } else {
    emit({
      step: "runtime",
      message: `SHASUMS256.txt se nepodařilo načíst — Node ${version} jde do balíku bez ověření`,
      pct: 0,
    });
  }

  if (TARGETS[target].kind === "exe") {
    if (download !== bin) await fsp.rename(download, bin);
  } else {
    // Pull exactly one member out of the archive.
    const inner = `node-v${version}-${TARGETS[target].dist}/bin/node`;
    const flag = TARGETS[target].kind === "tar.xz" ? "-xJf" : "-xzf";
    try {
      await run("tar", [flag, download, "-C", dir, "--strip-components=2", inner], dir);
    } catch (e) {
      throw new Error(
        `Rozbalení Node selhalo (${(e as Error).message}). ` +
          `Balíčkovač potřebuje \`tar\` s podporou ${TARGETS[target].kind === "tar.xz" ? "xz" : "gzip"}.`,
      );
    }
    await fsp.rm(download, { force: true });
    await fsp.chmod(bin, 0o755);
  }

  return bin;
}

/* ------------------------------------------------------------------ */
/* platform-native packages                                            */
/* ------------------------------------------------------------------ */

/*
 * A source install runs `next start` and rebuilds after the recipient's own
 * edits, and both need compiled binaries that npm installs per platform as
 * optional dependencies: SWC (Next cannot even load next.config.ts without
 * it), TypeScript 7's native compiler, lightningcss and Tailwind's oxide.
 * The build machine has only its own platform's. The first Windows install
 * started, found no SWC, tried to fetch one through an `npm` that is not
 * there, and never served a page.
 *
 * So each target gets its own, taken from the local install when it matches
 * or downloaded from the npm registry and checked against the registry's
 * integrity hash — the same treatment the bundled Node gets.
 */

const PLATFORM: Record<Target, { os: string; cpu: string }> = {
  "win-x64": { os: "win32", cpu: "x64" },
  "win-arm64": { os: "win32", cpu: "arm64" },
  "linux-x64": { os: "linux", cpu: "x64" },
  "linux-arm64": { os: "linux", cpu: "arm64" },
  "mac-arm64": { os: "darwin", cpu: "arm64" },
  "mac-x64": { os: "darwin", cpu: "x64" },
};

/** Installed packages whose binary half is a per-platform optional dependency. */
const NATIVE_PARENTS = ["next", "lightningcss", "@tailwindcss/oxide", "typescript"];

type PkgJson = { name: string; version: string; optionalDependencies?: Record<string, string> };

function readPkg(dir: string): PkgJson | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as PkgJson;
  } catch {
    return null;
  }
}

/** Every platform variant the installed parents list: name → exact version. */
function nativeVariants(): [string, string][] {
  const out: [string, string][] = [];
  for (const parent of NATIVE_PARENTS) {
    const pkg = readPkg(path.join(root(), "node_modules", parent));
    for (const [name, version] of Object.entries(pkg?.optionalDependencies ?? {})) {
      if (/-(win32|darwin|linux)-/.test(name)) out.push([name, version]);
    }
  }
  return out;
}

/** What one target needs. Linux takes both libc flavours, as npm itself would offer. */
export function nativesFor(target: Target): Record<string, string> {
  const { os: o, cpu } = PLATFORM[target];
  const fits = new RegExp(`-${o}-${cpu}(-(msvc|gnu|musl))?$`);
  return Object.fromEntries(nativeVariants().filter(([name]) => fits.test(name)));
}

/** Platform variants present locally — kept out of the shared, platform-free `app/`. */
function installedNatives(): string[] {
  return nativeVariants()
    .map(([name]) => name)
    .filter((name) => fs.existsSync(path.join(root(), "node_modules", name)));
}

/** A directory holding the package's files, fetched and verified once. */
async function ensureNativePackage(name: string, version: string, emit: Emit): Promise<string> {
  const local = path.join(root(), "node_modules", name);
  if (readPkg(local)?.version === version) return local;

  const dir = path.join(distDir(), ".cache", "npm", `${name.replace("/", "__")}@${version}`);
  if (readPkg(dir)?.version === version) return dir;

  emit({ step: "runtime", message: `Stahuji ${name}@${version}…`, pct: 0 });
  const metaRes = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!metaRes.ok) throw new Error(`Registr npm nezná ${name}@${version} (HTTP ${metaRes.status})`);
  const meta = (await metaRes.json()) as { dist?: { tarball?: string; integrity?: string } };
  const tarball = meta.dist?.tarball;
  const integrity = meta.dist?.integrity;
  if (!tarball || !integrity?.startsWith("sha512-")) {
    throw new Error(`U ${name}@${version} chybí v registru archiv nebo kontrolní součet`);
  }

  const res = await fetch(tarball, { cache: "no-store", signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`Stažení ${name}@${version} selhalo: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = "sha512-" + crypto.createHash("sha512").update(buf).digest("base64");
  if (got !== integrity) throw new Error(`Kontrolní součet ${name}@${version} nesedí`);

  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  const tgz = `${dir}.tgz`;
  await fsp.writeFile(tgz, buf);
  try {
    // npm tarballs keep everything under package/.
    await run("tar", ["-xzf", tgz, "-C", dir, "--strip-components=1"], dir);
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw new Error(`Rozbalení ${name} selhalo (${(e as Error).message}). Balíčkovač potřebuje \`tar\`.`);
  } finally {
    await fsp.rm(tgz, { force: true });
  }
  return dir;
}

/** Put one target's native packages into its staged `app/node_modules`. */
async function addNatives(stage: string, target: Target, emit: Emit): Promise<Record<string, string>> {
  const wanted = nativesFor(target);
  for (const [name, version] of Object.entries(wanted)) {
    const from = await ensureNativePackage(name, version, emit);
    await fsp.cp(from, path.join(stage, "app", "node_modules", name), { recursive: true });
  }
  return wanted;
}

/* ------------------------------------------------------------------ */
/* staging the app                                                     */
/* ------------------------------------------------------------------ */

/**
 * The build runs as a child of whatever serves this endpoint — normally the
 * dev server, whose environment says `NODE_ENV=development` and carries the
 * private variables Next hands its own workers. A `next build` that inherits
 * them compiles the production bundle against the development React and dies
 * prerendering with `Cannot read properties of null (reading 'useContext')`.
 * So the child gets a scrubbed copy of the environment instead.
 */
function buildEnv(): NodeJS.ProcessEnv {
  // Next types NODE_ENV as read-only, hence the plain record.
  const env: Record<string, string | undefined> = { NODE_ENV: "production" };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(NODE_ENV|NEXT_|__NEXT_|TURBOPACK|NODE_OPTIONS$|npm_)/.test(key)) continue;
    env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Newest modification time under the paths that feed the build. The packaging
 * scripts count too — they are copied into the archive as they are, but the
 * question being asked is "would a rebuild change what ships", and it would.
 */
function newestSource(): number {
  const roots = ["src", "packaging", "package.json", "next.config.ts", "tsconfig.json"];
  let newest = 0;
  const visit = (file: string) => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) visit(path.join(file, name));
    } else if (stat.mtimeMs > newest) {
      newest = stat.mtimeMs;
    }
  };
  for (const r of roots) visit(path.join(root(), r));
  return newest;
}

/** Which shape the build sitting in `.next` was made for. */
const shapeMarker = () => path.join(root(), ".next", "stocks-tvar.txt");

/**
 * Whether the build in `.next` still reflects the sources. "Use the last build"
 * exists so that repackaging the same code with different options — with and
 * without data, say — need not pay for a build; it was never meant to ship
 * stale code, and twice it did.
 *
 * The shape counts as much as the timestamp. The two builds differ in more
 * than packaging — one emits a standalone tree, the other does not — so a
 * build made for the other one is stale however fresh it is.
 */
export function buildStale(shape: AppShape): { stale: boolean; reason: string } {
  const produkt =
    shape === "source"
      ? path.join(root(), ".next", "BUILD_ID")
      : path.join(root(), ".next", "standalone", "server.js");
  if (!fs.existsSync(produkt)) return { stale: true, reason: "žádný build zatím není" };

  const marker = fs.existsSync(shapeMarker())
    ? fs.readFileSync(shapeMarker(), "utf8").trim()
    : null;
  if (marker !== shape) {
    return {
      stale: true,
      reason:
        marker === null
          ? "u posledního buildu není poznamenané, pro jaký balík byl"
          : `poslední build byl ${marker === "source" ? "zdrojový" : "přeložený"}`,
    };
  }

  const built = fs.statSync(produkt).mtimeMs;
  const source = newestSource();
  if (source > built) {
    const when = new Date(source).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
    return { stale: true, reason: `zdroják se změnil v ${when}, po posledním buildu` };
  }
  return { stale: false, reason: "" };
}

export async function runBuild(shape: AppShape, emit: Emit): Promise<void> {
  emit({ step: "build", message: "Spouštím produkční build…", pct: 5 });
  const env = buildEnv();
  // Read by next.config.ts: a source install runs `next start`, which is not
  // what a standalone build is for. Cleared rather than left alone for the
  // other shape, so a value inherited from the surrounding shell cannot turn
  // a run package into a build with no standalone tree to stage.
  if (shape === "source") env.STOCKS_SOURCE_BUILD = "1";
  else delete env.STOCKS_SOURCE_BUILD;
  await run("npm", ["run", "build"], root(), env);
  // After the build, never before — `next build` empties `.next` on entry.
  await fsp.writeFile(shapeMarker(), shape + "\n");
  emit({ step: "build", message: "Build hotový", pct: 25 });
}

/**
 * Assemble `app/` from the standalone output.
 *
 * `next build` leaves `.next/static` outside the standalone tree because a
 * deployment normally serves it from a CDN; here the same process serves it,
 * so it has to be copied in.
 */
async function stageApp(stage: string, emit: Emit): Promise<void> {
  const standalone = path.join(root(), ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) {
    throw new Error("Chybí .next/standalone — build zřejmě neproběhl.");
  }

  const app = path.join(stage, "app");
  await fsp.cp(standalone, app, { recursive: true });
  await fsp.cp(path.join(root(), ".next", "static"), path.join(app, ".next", "static"), {
    recursive: true,
  });

  // Next always bundles sharp for image optimisation. This app renders no
  // <Image>, so it is 46 MB that would ride along in every package.
  for (const dead of ["@img", "sharp"]) {
    await fsp.rm(path.join(app, "node_modules", dead), { recursive: true, force: true });
  }
  // Whatever the tracer scooped up from the working copy is not code.
  for (const dead of ["data", "dist", ".env.local", ".env"]) {
    await fsp.rm(path.join(app, dead), { recursive: true, force: true });
  }

  await stageExternalModules(app);

  emit({ step: "stage", message: "Aplikace připravená", pct: 40 });
}

/**
 * Re-create `.next/node_modules`, which the standalone output leaves behind.
 *
 * Turbopack rewrites a native external into `require("better-sqlite3-<hash>")`
 * and satisfies that name with a symlink in `.next/node_modules`. Standalone
 * does not copy it, so a packaged app starts and then answers 500 to every
 * request that touches the database — the page renders, which makes it look
 * like it works.
 *
 * A symlink is the wrong fix twice over: ZIP would carry it, but Windows
 * neither extracts nor creates one without elevated rights. A two-line module
 * that re-exports the real package resolves the same name from the same place
 * on every platform.
 */
async function stageExternalModules(app: string): Promise<void> {
  const source = path.join(root(), ".next", "node_modules");
  const target = path.join(app, ".next", "node_modules");

  /*
   * Throw away whatever the copy left here first, and do it before writing
   * anything. `fs.cp` does not keep a symlink verbatim — it rewrites the target
   * to an absolute path on the build machine — so the copied links dangle
   * everywhere else, and writing "into" one would land in the real package
   * instead. `fs.rm` unlinks symlinks rather than following them, so this only
   * removes the links.
   */
  await fsp.rm(target, { recursive: true, force: true });
  if (!fs.existsSync(source)) return;

  for (const entry of await fsp.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const dir = path.join(target, entry.name);

    if (!entry.isSymbolicLink()) {
      // Not the shape we know — copying it verbatim is the safe answer.
      await fsp.cp(from, dir, { recursive: true });
      continue;
    }

    const real = await fsp.realpath(from);
    const segments = real.split(path.sep);
    const at = segments.lastIndexOf("node_modules");
    const packageName =
      at >= 0 && segments[at + 1]?.startsWith("@")
        ? `${segments[at + 1]}/${segments[at + 2]}`
        : (segments[at + 1] ?? path.basename(real));

    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: entry.name, version: "0.0.0", main: "index.js" }, null, 1) + "\n",
    );
    await fsp.writeFile(
      path.join(dir, "index.js"),
      `// Turbopack requires this package under a hashed name; the real one lives\n` +
        `// in app/node_modules and Node's resolution walks up to it from here.\n` +
        `module.exports = require(${JSON.stringify(packageName)});\n`,
    );
  }
}

/**
 * The hand-written files: everything a person would ever open and change.
 *
 * The same list decides what goes into `app/` and what gets a pristine copy in
 * `puvodni/`, because those are the same question asked twice — an update can
 * only merge a file it has an original of.
 */
export const ZDROJOVE_CESTY = [
  "src",
  "packaging",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "next-env.d.ts",
] as const;

/** Copy a tree, skipping top-level entries by name. */
async function copyExcept(
  from: string,
  to: string,
  skip: string[],
  skipIf: (top: string) => boolean = () => false,
): Promise<void> {
  // Entries are a top-level name, or "@scope/name" for one package of a scope
  // whose other packages must stay.
  const dead = new Set(skip);
  await fsp.cp(from, to, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(from, src);
      if (!rel) return true;
      const [first, second] = rel.split(path.sep);
      if (dead.has(first) || skipIf(first)) return false;
      return !(second !== undefined && dead.has(`${first}/${second}`));
    },
  });
}

/**
 * ESLint and its plugins: development tooling nothing at runtime or in
 * `next build` touches (Next 16 no longer lints during a build). They are
 * also where the package's deepest paths live — typescript-eslint nested
 * five `node_modules` deep inside eslint-config-next reached 224 characters,
 * and Windows Explorer refuses anything past 260 once it prefixes its own
 * extraction folder. Without them the longest path in the package is 136.
 */
const LINT_TOOLING = [
  "@eslint",
  "@eslint-community",
  "@typescript-eslint",
  "typescript-eslint",
  "@next/eslint-plugin-next",
  // Import resolution for eslint-plugin-import, with native binaries of its own.
  "unrs-resolver",
  "@unrs",
];
const isLintTooling = (top: string) => top.startsWith("eslint");

/**
 * Assemble `app/` as the project itself.
 *
 * What ships is the source, the dependencies already installed, and a `.next`
 * that was just built — so the app starts immediately and only pays for a
 * build once someone actually changes something.
 *
 * Three things are deliberately left out. `.next/cache` is Turbopack's own
 * scratch space, rebuilt on demand and bigger than everything else together.
 * `.next/dev` belongs to `next dev` and never to a copy that ships. And
 * `.next/standalone` is the other shape of this very package — carrying it
 * would double the build output to no purpose, since a source install runs
 * through `next start`.
 *
 * `node_modules/.bin` goes too: those are symlinks, and `fs.cp` rewrites a
 * symlink to an absolute path on the build machine, which then points nowhere
 * on the recipient's. Nothing here needs them — the launcher calls Next's own
 * entry point with the bundled Node rather than through a shim.
 */
async function stageSource(stage: string, emit: Emit): Promise<void> {
  const built = path.join(root(), ".next", "BUILD_ID");
  if (!fs.existsSync(built)) {
    throw new Error("Chybí .next — build zřejmě neproběhl.");
  }

  const app = path.join(stage, "app");
  await fsp.mkdir(app, { recursive: true });

  for (const rel of ZDROJOVE_CESTY) {
    const from = path.join(root(), rel);
    if (fs.existsSync(from)) await fsp.cp(from, path.join(app, rel), { recursive: true });
  }
  emit({ step: "stage", message: "Zdroják připravený", pct: 30 });

  emit({ step: "stage", message: "Kopíruji závislosti (~640 MB)…", pct: 32 });
  await copyExcept(path.join(root(), "node_modules"), path.join(app, "node_modules"), [
    // Next bundles sharp for image optimisation this app never uses: 46 MB.
    "@img",
    "sharp",
    ".bin",
    ".cache",
    ...LINT_TOOLING,
    // Added per target by addNatives(); the build machine's own would be dead weight.
    ...installedNatives(),
  ], isLintTooling);

  emit({ step: "stage", message: "Kopíruji hotový build…", pct: 37 });
  await copyExcept(path.join(root(), ".next"), path.join(app, ".next"), [
    "cache",
    "dev",
    "standalone",
    // Re-created below in the one shape that survives a ZIP.
    "node_modules",
  ]);

  await stageExternalModules(app);

  /*
   * The launcher rebuilds whenever the sources stop matching the build it
   * finds. Recording the fingerprint of what ships is what tells it the build
   * in the package is already current — without it every fresh install would
   * spend its first minute rebuilding what it was just given.
   *
   * The fingerprint is computed by the same module the launcher uses, spawned
   * rather than reimplemented: two implementations of one hash would disagree
   * eventually, and the symptom would be a build that fires for no reason.
   */
  const otisk = (
    await run(
      process.execPath,
      [path.join(root(), "packaging", "tools", "otisk-zdrojaku.mjs"), app],
      root(),
    )
  ).trim();
  await fsp.writeFile(path.join(app, ".next", "zdroj-otisk.txt"), otisk + "\n");

  emit({ step: "stage", message: "Aplikace připravená (zdrojová)", pct: 40 });
}

/**
 * The untouched original of every hand-written file.
 *
 * This is what makes an update a merge instead of an overwrite: with the
 * version the recipient started from, their current file and the incoming one,
 * the updater can tell "they changed this" apart from "we changed this" and
 * keep both. Without it the only safe answer would be to refuse.
 *
 * It sits outside the manifest on purpose. The updater rewrites it from
 * whatever the package delivered, so putting it in would mean every update
 * carrying a second copy of every source file it already contains.
 */
async function stagePristine(stage: string): Promise<void> {
  const puvodni = path.join(stage, "puvodni");
  for (const rel of ZDROJOVE_CESTY) {
    const from = path.join(root(), rel);
    if (fs.existsSync(from)) await fsp.cp(from, path.join(puvodni, "app", rel), { recursive: true });
  }
  await fsp.writeFile(
    path.join(puvodni, "ctisi-me.txt"),
    "Tady leží nedotčený originál zdrojáku té verze, kterou máš nainstalovanou.\n" +
      "Aktualizace ho potřebuje, aby poznala tvoje úpravy od nových věcí a nechala\n" +
      "ti obojí. Needituj to a nemaž to — bez toho by aktualizace uměla leda přepsat.\n" +
      "\nKdyž budeš chtít vrátit nějaký soubor do původního stavu, zkopíruj ho odsud\n" +
      "do app/ a spusť aplikaci znovu.\n",
  );
}

/**
 * Launchers, the updater and the first-run notes.
 *
 * These live as real files under `packaging/` rather than as strings in here —
 * they are shell and batch scripts, and they are easier to get right when they
 * can be read and run as themselves.
 */
async function writeCommonFiles(stage: string, opts: PackageOptions, nodeVersion: string) {
  const src = path.join(root(), "packaging");
  if (!fs.existsSync(src)) {
    throw new Error(
      "Chybí adresář packaging/ se spouštěči — balíčkovač se pouští ze zdrojového stromu.",
    );
  }
  await fsp.cp(src, stage, { recursive: true });

  for (const name of ["spustit.sh", "Spustit.command", "aktualizovat.sh"]) {
    const file = path.join(stage, name);
    if (fs.existsSync(file)) await fsp.chmod(file, 0o755);
  }

  await fsp.writeFile(
    path.join(stage, "app", "verze-aplikace.json"),
    JSON.stringify({ version: opts.version, nodeVersion }, null, 1) + "\n",
  );
}

const buildDir = (version: string) => path.join(distDir(), "build", version);

/* ------------------------------------------------------------------ */
/* manifest                                                           */
/* ------------------------------------------------------------------ */

async function hashTree(dir: string, prefix = ""): Promise<Record<string, ManifestEntry>> {
  const out: Record<string, ManifestEntry> = {};
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(out, await hashTree(full, rel));
    } else if (entry.isFile()) {
      out[rel] = { sha256: await sha256File(full), size: (await fsp.stat(full)).size };
    }
  }
  return out;
}

export function readManifest(version: string): Manifest | null {
  const file = path.join(manifestDir(), `${version}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

export function listManifests(): { version: string; builtAt: string; shape: AppShape }[] {
  if (!fs.existsSync(manifestDir())) return [];
  return fs
    .readdirSync(manifestDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const m = JSON.parse(fs.readFileSync(path.join(manifestDir(), f), "utf8")) as Manifest;
      return { version: m.version, builtAt: m.builtAt, shape: m.shape ?? "run" };
    })
    .sort((a, b) => b.builtAt.localeCompare(a.builtAt));
}

/* ------------------------------------------------------------------ */
/* zipping                                                            */
/* ------------------------------------------------------------------ */

async function zipDirectory(src: string, out: string): Promise<number> {
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const sink = fs.createWriteStream(out);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  const finished = new Promise<void>((resolve, reject) => {
    sink.on("close", () => resolve());
    sink.on("error", reject);
    archive.on("error", reject);
    // A warning here means a file vanished mid-build; that must not pass silently.
    archive.on("warning", reject);
  });

  archive.pipe(sink);
  archive.directory(src, false);
  await archive.finalize();
  await finished;
  return (await fsp.stat(out)).size;
}

/**
 * Longest path a package may contain, relative to its root.
 *
 * Windows Explorer stops at 260 characters for the full path, and what goes
 * in front is not ours to choose: "Extract all" adds a folder named after the
 * ZIP, and opening the ZIP by double-click unpacks through
 * C:\Users\<name>\AppData\Local\Temp\Temp1_<zip name>\ — about 80
 * characters before the package even starts. 170 leaves room for that.
 */
const MAX_PACKAGE_PATH = 170;

async function assertShortPaths(stage: string): Promise<void> {
  const tooLong: string[] = [];
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (rel.length > MAX_PACKAGE_PATH) tooLong.push(`${rel} (${rel.length})`);
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
    }
  };
  await walk(stage, "");
  if (tooLong.length) {
    throw new Error(
      `Balík obsahuje ${tooLong.length} cest delších než ${MAX_PACKAGE_PATH} znaků, na Windows by nešly rozbalit: ` +
        tooLong.slice(0, 5).join(", "),
    );
  }
}

/**
 * Refuse to ship a secret or the developer's own database by accident.
 *
 * The staging directory is assembled from a whitelist, so this should never
 * fire — which is exactly why it is worth checking: a future change to the
 * staging code would otherwise leak quietly.
 */
async function assertNoSecrets(stage: string, allowData: boolean): Promise<void> {
  const offenders: string[] = [];
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), rel);
        continue;
      }
      if (/^\.env(\.|$)/.test(entry.name) && entry.name !== ".env.example") offenders.push(rel);
      if (!allowData && /\.db(-wal|-shm)?$/.test(entry.name)) offenders.push(rel);
    }
  };
  await walk(stage, "");
  if (offenders.length) {
    throw new Error(`Do balíku se dostalo, co tam nepatří: ${offenders.join(", ")}`);
  }
}

/* ------------------------------------------------------------------ */
/* data pack                                                          */
/* ------------------------------------------------------------------ */

/** The author's own records, never shipped in a data pack. Children first. */
const PERSONAL_TABLES = [
  "risk_scenarios",
  "risk_runs",
  "positions",
  "trades",
  "watchlist",
  "dashboards",
];

/**
 * A compact copy of the database for someone starting from nothing.
 *
 * `VACUUM INTO` is what makes this safe to run against a live database: it
 * takes a read transaction, writes a defragmented copy, and leaves the original
 * untouched — no stopping the app, no half-written file.
 */
export async function buildDataPack(
  target: string,
  opts: { includePrices: boolean },
  emit: Emit,
): Promise<void> {
  emit({ step: "data", message: "Kopíruji databázi (VACUUM INTO)…", pct: 55 });
  await fsp.rm(target, { force: true });
  getDb()
    .prepare("VACUUM INTO ?")
    .run(target);

  const Database = (await import("better-sqlite3")).default;
  const copy = new Database(target);
  /*
   * The pack is downloaded data. The author's own records — the real
   * portfolio journal, the watchlist, what-if positions, saved layouts, risk
   * analyses — are not, and the recipient would otherwise open their
   * Monitoring to someone else's holdings. Same list the pre-update backup
   * treats as "cannot be downloaded again".
   */
  emit({ step: "data", message: "Odstraňuji z kopie vlastní záznamy (portfolio, watchlist…)…", pct: 60 });
  for (const table of PERSONAL_TABLES) {
    try {
      copy.exec(`DELETE FROM ${table}`);
    } catch {
      /* table does not exist in an older database — nothing to remove */
    }
  }
  if (!opts.includePrices) {
    emit({ step: "data", message: "Odstraňuji cenové řady z kopie…", pct: 65 });
    copy.exec("DELETE FROM prices; DELETE FROM dividends; DELETE FROM splits;");
  }
  copy.exec("VACUUM;");
  copy.close();

  const size = (await fsp.stat(target)).size;
  emit({
    step: "data",
    message: `Datový balík: ${(size / 1e9).toFixed(2)} GB`,
    pct: 70,
  });
}

/* ------------------------------------------------------------------ */
/* the build                                                          */
/* ------------------------------------------------------------------ */

export type BuildResult = { file: string; size: number; target: Target };

export async function* buildPackages(
  opts: PackageOptions,
): AsyncGenerator<IngestProgress & { results?: BuildResult[] }> {
  const results: BuildResult[] = [];
  const messages: IngestProgress[] = [];
  const emit: Emit = (p) => messages.push(p);
  const drain = function* () {
    while (messages.length) yield messages.shift()!;
  };

  yield { step: "start", message: `Verze ${opts.version}`, pct: 0 };

  const stale = opts.skipBuild ? buildStale(opts.shape) : null;
  if (opts.skipBuild && stale && !stale.stale) {
    yield { step: "build", message: "Build přeskočen — používám poslední .next/standalone", pct: 25 };
  } else {
    if (stale?.stale) {
      yield {
        step: "build",
        message: `Poslední build nejde použít (${stale.reason}) — buildím znovu`,
        pct: 3,
      };
    }
    await runBuild(opts.shape, emit);
    yield* drain();
  }

  const nodeVersion = await latestLtsNode();
  yield { step: "runtime", message: `Přibalím Node ${nodeVersion} (LTS)`, pct: 28 };

  // `app/` is identical for every target, so it is staged once and reused.
  const shared = await fsp.mkdtemp(path.join(os.tmpdir(), "stocks-app-"));
  try {
    if (opts.shape === "source") await stageSource(shared, emit);
    else await stageApp(shared, emit);
    yield* drain();

    await writeCommonFiles(shared, opts, nodeVersion);
    const appHashes = await hashTree(shared);
    yield { step: "stage", message: `Otisk aplikace: ${Object.keys(appHashes).length} souborů`, pct: 45 };

    // After the hash, never before: `puvodni/` is the updater's working copy,
    // not part of what an update compares or carries.
    if (opts.shape === "source") await stagePristine(shared);

    /*
     * Keep the platform-independent tree. An update package is the difference
     * between two of these, so without it a later diff would mean rebuilding
     * the older version from a checkout that may no longer exist.
     */
    await fsp.rm(buildDir(opts.version), { recursive: true, force: true });
    await fsp.cp(shared, buildDir(opts.version), { recursive: true });

    let dataPack: string | null = null;
    if (opts.includeData) {
      dataPack = path.join(shared, "..", `data-${opts.version}.db`);
      await buildDataPack(dataPack, { includePrices: opts.includePrices }, emit);
      yield* drain();
    }

    const manifest: Manifest = {
      version: opts.version,
      builtAt: new Date().toISOString(),
      nodeVersion,
      shape: opts.shape,
      app: appHashes,
      runtime: {},
      ...(opts.shape === "source" ? { natives: {} } : {}),
    };

    for (const [i, target] of opts.targets.entries()) {
      const base = 50 + Math.round((i / opts.targets.length) * 45);
      yield { step: "package", message: `${TARGETS[target].label}: skládám balík…`, pct: base };

      const bin = await ensureNodeRuntime(nodeVersion, target, emit);
      yield* drain();

      const stage = await fsp.mkdtemp(path.join(os.tmpdir(), `stocks-${target}-`));
      try {
        await fsp.cp(shared, stage, { recursive: true });
        if (opts.shape === "source") {
          manifest.natives![target] = await addNatives(stage, target, emit);
          yield* drain();
        }

        const runtimeDir = path.join(stage, "runtime");
        await fsp.mkdir(runtimeDir, { recursive: true });
        const binName = TARGETS[target].kind === "exe" ? "node.exe" : "node";
        await fsp.copyFile(bin, path.join(runtimeDir, binName));
        if (binName === "node") await fsp.chmod(path.join(runtimeDir, binName), 0o755);

        manifest.runtime[target] = {
          sha256: await sha256File(path.join(runtimeDir, binName)),
          size: (await fsp.stat(path.join(runtimeDir, binName))).size,
        };

        await fsp.mkdir(path.join(stage, "data"), { recursive: true });
        if (dataPack) {
          await fsp.copyFile(dataPack, path.join(stage, "data", "stocks.db"));
          if (opts.includeSecArchive) {
            const src = path.join(root(), "data", "sec");
            if (fs.existsSync(src)) {
              yield { step: "package", message: `${TARGETS[target].label}: přidávám archiv SEC…`, pct: base + 2 };
              await fsp.cp(src, path.join(stage, "data", "sec"), { recursive: true });
            }
          }
        }

        await fsp.writeFile(
          path.join(stage, "verze.json"),
          JSON.stringify({ ...manifest, target }, null, 1) + "\n",
        );

        await assertNoSecrets(stage, opts.includeData);
        await assertShortPaths(stage);

        const file = path.join(distDir(), `stocks-analyzer-${opts.version}-${target}.zip`);
        const size = await zipDirectory(stage, file);
        results.push({ file, size, target });
        yield {
          step: "package",
          message: `${TARGETS[target].label}: ${path.basename(file)} (${(size / 1e6).toFixed(0)} MB)`,
          pct: base + 5,
        };
      } finally {
        await fsp.rm(stage, { recursive: true, force: true });
      }
    }

    await fsp.mkdir(manifestDir(), { recursive: true });
    await fsp.writeFile(
      path.join(manifestDir(), `${opts.version}.json`),
      JSON.stringify(manifest, null, 1) + "\n",
    );
    if (dataPack) await fsp.rm(dataPack, { force: true });
  } finally {
    await fsp.rm(shared, { recursive: true, force: true });
  }

  yield {
    step: "done",
    message: `Hotovo — ${results.length} balíků v ${distDir()}`,
    pct: 100,
    done: true,
    results,
  };
}

/* ------------------------------------------------------------------ */
/* update packages                                                     */
/* ------------------------------------------------------------------ */

export type UpdatePlan = {
  from: string;
  to: string;
  changed: string[];
  removed: string[];
  bytes: number;
};

/**
 * What an update would carry.
 *
 * Only `app/` and the launchers are compared: the bundled Node lives in
 * `runtime/`, is identical to what the recipient already has in all but the
 * rarest build, and would swamp the payload. When it does change, the message
 * says so and a full package is the answer.
 */
export function planUpdate(from: string, to: string): UpdatePlan {
  const before = readManifest(from);
  const after = readManifest(to);
  if (!before) throw new Error(`Neznám otisk verze ${from} — chybí dist/manifests/${from}.json`);
  if (!after) throw new Error(`Neznám otisk verze ${to} — chybí dist/manifests/${to}.json`);

  const changed = Object.keys(after.app).filter(
    (name) => before.app[name]?.sha256 !== after.app[name].sha256,
  );
  const removed = Object.keys(before.app).filter((name) => !(name in after.app));
  const bytes = changed.reduce((sum, name) => sum + after.app[name].size, 0);

  return { from, to, changed, removed, bytes };
}

/**
 * The native packages' versions, platform suffix removed: "@next/swc 16.3.0,
 * lightningcss 1.32.0, …". What an update cannot carry is a new version of
 * these; which targets a given export happened to include does not matter —
 * 1.0.1 was exported for Windows and for macOS/Linux separately, and the
 * stored manifest is the later run's.
 */
function nativeFamilies(natives: Manifest["natives"]): string {
  const families = new Map<string, string>();
  for (const perTarget of Object.values(natives ?? {})) {
    for (const [name, version] of Object.entries(perTarget)) {
      families.set(name.replace(/-(win32|darwin|linux)-.*$/, ""), version);
    }
  }
  return [...families.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, v]) => `${n} ${v}`)
    .join(", ");
}

export async function buildUpdate(from: string, to: string, emit: Emit): Promise<BuildResult> {
  const plan = planUpdate(from, to);
  const manifest = readManifest(to)!;

  // Native binaries sit outside app/, like the bundled Node, so an update
  // cannot carry them. When they change, only a full package is correct.
  const before = readManifest(from)!;
  // The recipient's updater refuses this too; saying so here saves sending it.
  if ((before.shape ?? "run") !== (manifest.shape ?? "run")) {
    const popis = (v: string, shape?: AppShape) =>
      `${v} (${(shape ?? "run") === "source" ? "zdroják" : "hotová aplikace"})`;
    throw new Error(
      `Verze ${popis(from, before.shape)} a ${popis(to, manifest.shape)} mají jiný tvar. ` +
        `Mezi tvary se aktualizací přejít nedá, pošli plný balík verze ${to}.`,
    );
  }
  if (manifest.shape === "source") {
    if (!before.natives) {
      throw new Error(
        `Verze ${from} je zdrojový balík bez nativních binárek pro cílovou platformu (na Windows se nespustí). Pošli plný balík verze ${to}.`,
      );
    }
    if (nativeFamilies(before.natives) !== nativeFamilies(manifest.natives)) {
      throw new Error(
        `Mezi ${from} a ${to} se změnily nativní balíčky (${nativeFamilies(before.natives)} → ${nativeFamilies(manifest.natives)}). Aktualizace je nenese, pošli plný balík verze ${to}.`,
      );
    }
  }
  const source = buildDir(to);

  if (!fs.existsSync(source)) {
    throw new Error(
      `Chybí dist/build/${to} — aktualizaci jde postavit jen z verze, kterou balíčkovač vyrobil.`,
    );
  }

  emit({
    step: "update",
    message: `${plan.changed.length} změněných souborů, ${plan.removed.length} ke smazání (${(
      plan.bytes / 1e6
    ).toFixed(1)} MB před kompresí)`,
    pct: 30,
  });

  const stage = await fsp.mkdtemp(path.join(os.tmpdir(), `stocks-update-`));
  try {
    for (const name of plan.changed) {
      const target = path.join(stage, name);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(path.join(source, name), target);
    }

    await fsp.writeFile(
      path.join(stage, "zmeny.json"),
      JSON.stringify(
        {
          from: [from],
          to,
          delete: plan.removed,
          nodeVersion: manifest.nodeVersion,
        },
        null,
        1,
      ) + "\n",
    );
    await fsp.writeFile(path.join(stage, "verze.json"), JSON.stringify(manifest, null, 1) + "\n");

    await assertNoSecrets(stage, false);
    await assertShortPaths(stage);

    const file = path.join(distDir(), `aktualizace-${from}-${to}.zip`);
    const size = await zipDirectory(stage, file);
    emit({
      step: "update",
      message: `${path.basename(file)} (${(size / 1e6).toFixed(1)} MB)`,
      pct: 95,
    });
    return { file, size, target: "linux-x64" };
  } finally {
    await fsp.rm(stage, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ */
/* what is already built                                               */
/* ------------------------------------------------------------------ */

export type BuiltArtifact = {
  name: string;
  size: number;
  at: string;
  /** Read from the archive's own verze.json; null when it cannot be read. */
  shape: AppShape | null;
};

/**
 * One file out of a ZIP without reading the archive.
 *
 * A package is hundreds of megabytes; its central directory at the end says
 * where each entry lives, so only that and the one entry are read. ZIP64 is
 * handled because a package with data crosses 4 GB.
 */
function readZipEntry(file: string, wanted: string): Buffer | null {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const read = (pos: number, len: number) => {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      return buf;
    };

    const tailLen = Math.min(size, 22 + 65535 + 20);
    const tail = read(size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
      const loc = eocd - 20;
      if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) return null;
      const z64 = read(Number(tail.readBigUInt64LE(loc + 8)), 56);
      if (z64.readUInt32LE(0) !== 0x06064b50) return null;
      cdSize = Number(z64.readBigUInt64LE(40));
      cdOffset = Number(z64.readBigUInt64LE(48));
    }

    const cd = read(cdOffset, cdSize);
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
      const method = cd.readUInt16LE(p + 10);
      let compSize = cd.readUInt32LE(p + 20);
      const uncompSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      let offset = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nameLen);

      if (name === wanted) {
        // ZIP64 extra field: the 64-bit values for whichever fields overflowed, in order.
        const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
        for (let e = 0; e + 4 <= extra.length; ) {
          const id = extra.readUInt16LE(e);
          const len = extra.readUInt16LE(e + 2);
          if (id === 0x0001) {
            let q = e + 4;
            if (uncompSize === 0xffffffff) q += 8;
            if (compSize === 0xffffffff) compSize = Number(extra.readBigUInt64LE((q += 8) - 8));
            if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(q));
          }
          e += 4 + len;
        }
        const local = read(offset, 30);
        if (local.readUInt32LE(0) !== 0x04034b50) return null;
        const start = offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
        const data = read(start, compSize);
        if (method === 0) return data;
        if (method === 8) return Buffer.from(inflateSync(data));
        return null;
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Shapes read so far, by file name, size and time — a rebuilt ZIP is read again. */
const shapeCache = new Map<string, AppShape | null>();

function artifactShape(file: string, stat: fs.Stats): AppShape | null {
  const key = `${file}|${stat.size}|${stat.mtimeMs}`;
  if (shapeCache.has(key)) return shapeCache.get(key)!;
  let shape: AppShape | null = null;
  const raw = readZipEntry(file, "verze.json");
  if (raw) {
    try {
      // Packages from before the source shape carry no field: they are the run shape.
      shape = (JSON.parse(raw.toString("utf8")) as { shape?: AppShape }).shape ?? "run";
    } catch {
      shape = null;
    }
  }
  shapeCache.set(key, shape);
  return shape;
}

export function listArtifacts(): BuiltArtifact[] {
  if (!fs.existsSync(distDir())) return [];
  return fs
    .readdirSync(distDir())
    .filter((name) => name.endsWith(".zip"))
    .map((name) => {
      const file = path.join(distDir(), name);
      const stat = fs.statSync(file);
      return {
        name,
        size: stat.size,
        at: new Date(stat.mtimeMs).toISOString(),
        shape: artifactShape(file, stat),
      };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function distPath(): string {
  return distDir();
}
