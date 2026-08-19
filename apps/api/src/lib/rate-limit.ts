export class MemoryRateLimit {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly connections = new Map<string, number>();

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
    private readonly maxSse: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    this.prune(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.maxHits) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  acquireSse(key: string): boolean {
    const current = this.connections.get(key) ?? 0;
    if (current >= this.maxSse) {
      return false;
    }
    this.connections.set(key, current + 1);
    return true;
  }

  releaseSse(key: string): void {
    const current = this.connections.get(key) ?? 0;
    const next = Math.max(0, current - 1);
    if (next === 0) {
      this.connections.delete(key);
      return;
    }
    this.connections.set(key, next);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}

export function clientKey(request: { ip?: string; headers: { host?: string } }): string {
  return request.ip || 'anonymous';
}
