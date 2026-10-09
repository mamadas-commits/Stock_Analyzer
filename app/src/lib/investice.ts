/**
 * Monthly investment needed to reach a target.
 *
 * Pure arithmetic, no data: the future value of a starting lump sum plus a
 * level monthly deposit, solved for the deposit.
 *
 *   target = start·(1+r)^n + deposit·((1+r)^n − 1)/r · (1+r if paid at the start)
 *
 * The yearly return is taken as an effective rate — what an index's "8 % a
 * year" means — so the monthly rate is its twelfth root, (1+R)^(1/12) − 1, and
 * twelve months of it compound to exactly R. Dividing R by 12 instead would
 * quietly assume a higher return than the one entered.
 */

export type InvesticeVstup = {
  target: number;
  years: number;
  /** Expected yearly return in percent, effective. */
  returnPct: number;
  start: number;
  /** Deposit at the beginning of each month rather than its end. */
  atStart: boolean;
};

export type RokPlanu = {
  year: number;
  /** Everything put in by the end of this year, the starting sum included. */
  contributed: number;
  value: number;
};

export type InvesticeVysledek = {
  monthly: number;
  months: number;
  monthlyRate: number;
  contributed: number;
  /** Value at the end — the target, unless the start alone overshoots it. */
  finalValue: number;
  gain: number;
  /** True when the starting sum grows past the target on its own. */
  startSuffices: boolean;
  schedule: RokPlanu[];
};

export function monthlyRate(returnPct: number): number {
  return (1 + returnPct / 100) ** (1 / 12) - 1;
}

/** Monthly deposit for the given inputs; never negative. */
export function requiredMonthly(v: InvesticeVstup): number {
  const n = Math.max(1, Math.round(v.years * 12));
  const r = monthlyRate(v.returnPct);
  const growth = (1 + r) ** n;
  const remaining = v.target - v.start * growth;
  if (remaining <= 0) return 0;
  // Each deposit's growth factor summed: n plain months when there is no return.
  const annuity = r === 0 ? n : ((growth - 1) / r) * (v.atStart ? 1 + r : 1);
  return remaining / annuity;
}

export function planInvestice(v: InvesticeVstup): InvesticeVysledek {
  const months = Math.max(1, Math.round(v.years * 12));
  const r = monthlyRate(v.returnPct);
  const monthly = requiredMonthly(v);

  // Walk month by month, so the schedule is the same arithmetic as the
  // formula and the two can be checked against each other.
  let value = v.start;
  let contributed = v.start;
  const schedule: RokPlanu[] = [{ year: 0, contributed, value }];
  for (let m = 1; m <= months; m++) {
    if (v.atStart) value += monthly;
    value *= 1 + r;
    if (!v.atStart) value += monthly;
    contributed += monthly;
    if (m % 12 === 0 || m === months) {
      schedule.push({ year: m / 12, contributed, value });
    }
  }

  return {
    monthly,
    months,
    monthlyRate: r,
    contributed,
    finalValue: value,
    gain: value - contributed,
    startSuffices: monthly === 0,
    schedule,
  };
}
