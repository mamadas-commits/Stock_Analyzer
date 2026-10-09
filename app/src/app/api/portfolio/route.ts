import { NextRequest } from "next/server";
import { z } from "zod";
import {
  WITHHOLDING_TAX,
  addPosition,
  deletePosition,
  listPositions,
  simulate,
  updatePosition,
} from "@/lib/portfolio";
import { pinSplitsNear } from "@/lib/prices";

export const dynamic = "force-dynamic";

/**
 * Hand-entered holdings plus the dividend-into-SPY simulation.
 *
 * Both tax variants come back in one response: the toggle in the UI is a
 * reading of the same history, not a different question, so making it refetch
 * would only add a spinner.
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

async function payload() {
  const positions = listPositions();
  // Same as the monitoring journal: a buy inside a split's week needs the
  // split's actual day, which weekly prices do not carry.
  const dates = new Map<string, string[]>();
  for (const p of positions) dates.set(p.ticker, [...(dates.get(p.ticker) ?? []), p.buyDate]);
  for (const [ticker, list] of dates) await pinSplitsNear(ticker, list);
  return Response.json({
    positions,
    taxRate: WITHHOLDING_TAX,
    simulations: {
      gross: simulate(positions, 0),
      net: simulate(positions, WITHHOLDING_TAX),
    },
  });
}

export async function GET() {
  return payload();
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Neplatná pozice" }, { status: 400 });
  }
  addPosition(parsed.data);
  return payload();
}

export async function PATCH(req: NextRequest) {
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Chybí nebo je neplatné ?id=" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Neplatná pozice" }, { status: 400 });
  }
  if (!updatePosition(id.data, parsed.data)) {
    return Response.json({ error: "Pozice neexistuje" }, { status: 404 });
  }
  return payload();
}

export async function DELETE(req: NextRequest) {
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return Response.json({ error: "Chybí nebo je neplatné ?id=" }, { status: 400 });
  if (!deletePosition(id.data)) {
    return Response.json({ error: "Pozice neexistuje" }, { status: 404 });
  }
  return payload();
}
