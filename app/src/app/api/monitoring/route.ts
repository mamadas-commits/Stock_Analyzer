import { NextRequest } from "next/server";
import { z } from "zod";
import { addTrade, deleteTrade, listTrades, monitor, updateTrade } from "@/lib/monitoring";
import { asCurrency, converter } from "@/lib/fx";
import { pinSplitsNear } from "@/lib/prices";
import { SPY_TICKER } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * The journal of real buys and everything computed from it.
 *
 * Every write answers with the full recomputed picture, so the page never has
 * to follow a change with a second request. `?mena=CZK|EUR|USD` picks the
 * currency the amounts come out in, on every method alike.
 */

const Body = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.\-]{1,12}$/, "Neplatný ticker"),
  shares: z.number().finite().positive().max(1e9),
  buyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ve tvaru RRRR-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Neexistující datum")
    .refine((d) => d <= new Date().toISOString().slice(0, 10), "Datum nákupu je v budoucnosti"),
  buyPrice: z.number().finite().positive().max(1e7).nullish(),
  note: z.string().trim().max(200).nullish(),
});

const Id = z.coerce.number().int().positive();

/**
 * A buy inside the week of a split needs the split's actual day, which weekly
 * prices do not carry. Pinned on demand, once per split, and only where a buy
 * falls in that week — the benchmark's purchase dates included.
 */
async function pinSplitsForTrades(trades: { ticker: string; buyDate: string }[]) {
  const dates = new Map<string, string[]>();
  for (const t of trades) dates.set(t.ticker, [...(dates.get(t.ticker) ?? []), t.buyDate]);
  dates.set(SPY_TICKER, trades.map((t) => t.buyDate));
  for (const [ticker, list] of dates) await pinSplitsNear(ticker, list);
}

async function payload(req: NextRequest) {
  const trades = listTrades();
  await pinSplitsForTrades(trades);
  const first = trades.reduce<string | null>((m, t) => (m === null || t.buyDate < m ? t.buyDate : m), null);
  const conv = await converter(asCurrency(req.nextUrl.searchParams.get("mena")), first);
  const result = monitor(trades, conv.fromUsd);
  if (conv.warning) result.warnings.unshift(conv.warning);
  return Response.json({ ...result, currency: conv.currency, ratesAsOf: conv.ratesAsOf });
}

export async function GET(req: NextRequest) {
  return payload(req);
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Neplatný nákup" }, { status: 400 });
  }
  addTrade(parsed.data);
  return payload(req);
}

export async function PATCH(req: NextRequest) {
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Chybí nebo je neplatné ?id=" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Neplatný nákup" }, { status: 400 });
  }
  if (!updateTrade(id.data, parsed.data)) {
    return Response.json({ error: "Nákup neexistuje" }, { status: 404 });
  }
  return payload(req);
}

export async function DELETE(req: NextRequest) {
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Chybí nebo je neplatné ?id=" }, { status: 400 });
  if (!deleteTrade(id.data)) {
    return Response.json({ error: "Nákup neexistuje" }, { status: 404 });
  }
  return payload(req);
}
