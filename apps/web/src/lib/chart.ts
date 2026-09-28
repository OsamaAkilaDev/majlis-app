/** Percent of the largest bar, not the total. All-zero returns zeros, not NaN. */
export function barPercents(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? (Math.max(v, 0) / max) * 100 : 0));
}

/** A status missing from `order` goes last rather than vanishing, so a new enum value still shows. */
export function statusBars(
  counts: Record<string, number>,
  order: readonly string[],
  label: (status: string) => string,
): Array<{ label: string; value: number }> {
  const keys = Object.keys(counts);
  const known = order.filter((s) => s in counts);
  const rest = keys.filter((s) => !order.includes(s)).sort();
  return [...known, ...rest].map((s) => ({ label: label(s), value: counts[s] ?? 0 }));
}
