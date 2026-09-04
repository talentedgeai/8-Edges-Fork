// USD conversion for deal amounts. Native amount_cents/currency stay the
// transaction record of truth; amount_usd_cents is a derived reporting value
// so cross-currency sums (e.g. deal value on the contacts list) are safe to add.
// USD deals short-circuit — no network call, rate is always exactly 1.

const FX_API = "https://api.frankfurter.dev/v1/latest";

export type FxConversion = {
  amountUsdCents: number;
  rate: number;
  asOf: string;
};

export async function convertToUsdCents(amountCents: number, currency: string): Promise<FxConversion> {
  const code = currency.trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  if (code === "USD") {
    return { amountUsdCents: amountCents, rate: 1, asOf: today };
  }

  const res = await fetch(`${FX_API}?base=${encodeURIComponent(code)}&symbols=USD`);
  if (!res.ok) throw new Error(`FX lookup failed for ${code}: ${res.status}`);

  const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = data.rates?.USD;
  if (!rate) throw new Error(`FX lookup returned no USD rate for ${code}`);

  return {
    amountUsdCents: Math.round(amountCents * rate),
    rate,
    asOf: data.date ?? today,
  };
}
