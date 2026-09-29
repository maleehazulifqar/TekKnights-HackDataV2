export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) so a seed always reproduces the same data. */
export class Rng {
  private a: number;
  constructor(seed: number) { this.a = seed >>> 0; }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number) { return min + this.next() * (max - min); }
  int(min: number, max: number) { return Math.floor(this.range(min, max + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  weighted<T>(items: readonly T[], weights?: number[]): T {
    if (!weights || weights.length !== items.length) return this.pick(items);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  normal(mean = 0, std = 1) {
    const u = Math.max(this.next(), 1e-12), v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
