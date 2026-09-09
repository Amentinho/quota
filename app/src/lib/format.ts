// Grams are the only unit carried internally -- every value coming out of
// the subgraph or ENS stays in grams (as bigint/string) until it reaches
// one of these functions, called only at render time. Never convert to kg
// and pass the result further down.

export function gramsToKg(grams: string | number | bigint): number {
  return Number(BigInt(grams)) / 1000;
}

export function formatKg(grams: string | number | bigint, opts: { decimals?: number } = {}): string {
  const kg = gramsToKg(grams);
  // Small quantities (a 1-gram detector finding = 0.001 kg) need enough
  // decimals to stay visibly non-zero -- 1 decimal would round it to
  // "0.0 kg" and erase the exact figure the stat cards exist to show.
  const decimals = opts.decimals ?? (kg >= 1000 ? 0 : kg >= 1 ? 2 : 3);
  return `${kg.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} kg`;
}

export function formatGrams(grams: string | number | bigint): string {
  return `${BigInt(grams).toLocaleString()} g`;
}

export function formatBp(bp: string | number | bigint): string {
  return `${(Number(BigInt(bp)) / 100).toFixed(2)}%`;
}

export function formatPercent(bp: string | number | bigint): string {
  return `${(Number(BigInt(bp)) / 100).toFixed(1)}%`;
}

export function formatDate(unixSeconds: string | number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateOnly(unixSeconds: string | number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString(undefined, { dateStyle: "long" });
}

export function daysUntil(unixSeconds: string | number | bigint): number {
  const ms = Number(unixSeconds) * 1000 - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return shortAddr(hash);
}
