export class MemoryRateLimit {
  private readonly hits = new Map<string, number[]>();
  private readonly connections = new Map<string, number>();

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
    private readonly maxSse: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((stamp) => now - stamp < this.windowMs);
    if (recent.length >= this.maxHits) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
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
    this.connections.set(key, Math.max(0, current - 1));
  }
}

export function clientKey(request: { ip?: string; headers: { host?: string } }): string {
  return request.ip || 'anonymous';
}
