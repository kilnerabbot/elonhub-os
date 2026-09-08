const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export function formatZAR(amount: number): string {
  return zar.format(amount);
}

export function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}
