import { describe, expect, it } from 'vitest';
import { formatAge } from './format';

describe('formatAge', () => {
  it('never shows a negative age when the clock is skewed', () => {
    const now = Date.parse('2026-08-19T12:00:00.000Z');
    expect(formatAge('2026-08-19T12:00:14.000Z', now)).toBe('actualizado ahora');
  });

  it('uses minutes after the first minute', () => {
    const now = Date.parse('2026-08-19T12:03:00.000Z');
    expect(formatAge('2026-08-19T12:00:00.000Z', now)).toBe('hace 3 min');
  });
});
