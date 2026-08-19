import { cookieHeaderFromSetCookie, extractPublicPageToken } from './parse.js';

export interface PublicSession {
  cookie: string;
  token: string;
  fetchedAt: number;
}

export interface GpsBahiaSessionManagerOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  ttlMs?: number;
  now?: () => number;
}

export type SessionMachineState = 'uninitialized' | 'ready' | 'refreshing' | 'backoff' | 'failed';

export const GPSBAHIA_UNAVAILABLE = 'public endpoint unavailable';
const DEFAULT_TTL_MS = 4 * 60_000;
const MAX_BACKOFF_MS = 60_000;

export class GpsBahiaSessionManager {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private session: PublicSession | null = null;
  private lastHtml: string | null = null;
  private refreshInFlight: Promise<PublicSession> | null = null;
  private refreshCount = 0;
  private state: SessionMachineState = 'uninitialized';
  private consecutiveFailures = 0;
  private backoffUntil = 0;

  constructor(options: GpsBahiaSessionManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.gpsbahia.com.ar/').replace(/\/?$/, '/');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? 'OpenBahiaTransit/0.1';
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  get homepageUrl(): string {
    return this.baseUrl;
  }

  getRefreshCount(): number {
    return this.refreshCount;
  }

  getState(): SessionMachineState {
    return this.state;
  }

  peek(): PublicSession | null {
    return this.session;
  }

  getLastHtml(): string | null {
    return this.lastHtml;
  }

  invalidate(): void {
    this.session = null;
    if (this.state === 'ready') {
      this.state = 'uninitialized';
    }
  }

  async getSession(force = false): Promise<PublicSession> {
    if (!force && this.session && this.now() - this.session.fetchedAt < this.ttlMs) {
      return this.session;
    }
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    if (
      !force &&
      (this.state === 'backoff' || this.state === 'failed') &&
      this.now() < this.backoffUntil
    ) {
      throw new Error(GPSBAHIA_UNAVAILABLE);
    }
    this.refreshInFlight = this.refreshSession();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  async fetchHomepage(): Promise<{ html: string; session: PublicSession }> {
    const session = await this.getSession();
    const html = this.lastHtml;
    if (html) {
      return { html, session };
    }
    this.invalidate();
    const fresh = await this.getSession(true);
    return { html: this.lastHtml ?? '', session: fresh };
  }

  private async refreshSession(): Promise<PublicSession> {
    this.state = 'refreshing';
    try {
      const response = await this.fetchImpl(this.baseUrl, {
        headers: {
          'user-agent': this.userAgent,
          accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(GPSBAHIA_UNAVAILABLE);
      }
      const html = await response.text();
      const token = extractPublicPageToken(html);
      if (!token) {
        throw new Error(GPSBAHIA_UNAVAILABLE);
      }
      const cookie = cookieHeaderFromSetCookie(response.headers.getSetCookie?.() ?? []);
      this.lastHtml = html;
      this.session = { cookie, token, fetchedAt: this.now() };
      this.refreshCount += 1;
      this.consecutiveFailures = 0;
      this.state = 'ready';
      return this.session;
    } catch (error) {
      this.consecutiveFailures += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 2_000 * 2 ** Math.min(this.consecutiveFailures, 5));
      this.backoffUntil = this.now() + delay;
      this.state = this.consecutiveFailures >= 5 ? 'failed' : 'backoff';
      throw error instanceof Error ? error : new Error(GPSBAHIA_UNAVAILABLE);
    }
  }
}
