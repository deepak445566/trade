/** Decimal places that suit a price's magnitude (BTC 67000.12 vs PEPE 0.00001234). */
export function pricePrecision(price: number): number {
  const p = Math.abs(price);
  if (!p || !Number.isFinite(p)) return 2;
  if (p >= 1000) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  // e.g. 0.0123 -> 6, 0.0000123 -> 9
  return Math.min(10, Math.max(4, -Math.floor(Math.log10(p)) + 3));
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return "—";
  const d = pricePrecision(price);
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}

export function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
