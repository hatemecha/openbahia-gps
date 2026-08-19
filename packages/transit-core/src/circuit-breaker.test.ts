import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('opens after consecutive failures and allows a probe after cooldown', () => {
    let now = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1000,
      now: () => now,
    });
    expect(breaker.canRequest()).toBe(true);
    breaker.failure();
    expect(breaker.getState()).toBe('closed');
    breaker.failure();
    expect(breaker.getState()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
    now = 1000;
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.getState()).toBe('half_open');
    expect(breaker.canRequest()).toBe(false);
    breaker.success();
    expect(breaker.getState()).toBe('closed');
  });
});
