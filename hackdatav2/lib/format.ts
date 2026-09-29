const tag = (locale: string) => locale.replace("_", "-");
export const money = (cents: number, locale: string, currency: string) =>
  new Intl.NumberFormat(tag(locale), { style: "currency", currency }).format(cents / 100);
export const shortDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));
export const plainMoney = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}
