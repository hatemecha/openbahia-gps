import { assertNever } from './types.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private halfOpenInFlight = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 4;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  canRequest(): boolean {
    this.maybeHalfOpen();
    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        return false;
      case 'half_open':
        if (this.halfOpenInFlight) {
          return false;
        }
        this.halfOpenInFlight = true;
        return true;
      default:
        return assertNever(this.state);
    }
  }

  success(): void {
    this.failures = 0;
    this.halfOpenInFlight = false;
    this.state = 'closed';
  }

  failure(): void {
    this.failures += 1;
    this.halfOpenInFlight = false;
    if (this.state === 'half_open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }

  private maybeHalfOpen(): void {
    if (this.state === 'open' && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'half_open';
      this.halfOpenInFlight = false;
    }
  }
}
