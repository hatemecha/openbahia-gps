import { describe, expect, it } from 'vitest';
import { isDirectionVisible, markerDirectionClass } from './direction-visibility';

describe('direction visibility', () => {
  it('hides inbound buses when vuelta is off', () => {
    expect(isDirectionVisible('inbound', true, false)).toBe(false);
    expect(isDirectionVisible('outbound', true, false)).toBe(true);
  });

  it('hides outbound buses when ida is off', () => {
    expect(isDirectionVisible('outbound', false, true)).toBe(false);
    expect(isDirectionVisible('inbound', false, true)).toBe(true);
  });

  it('shows undetermined buses only when both directions are on', () => {
    expect(isDirectionVisible('unknown', true, true)).toBe(true);
    expect(isDirectionVisible(undefined, true, true)).toBe(true);
    expect(isDirectionVisible('unknown', true, false)).toBe(false);
    expect(isDirectionVisible('unknown', false, true)).toBe(false);
  });

  it('maps undetermined vehicles to a distinct marker class', () => {
    expect(markerDirectionClass('inbound')).toBe('inbound');
    expect(markerDirectionClass('outbound')).toBe('outbound');
    expect(markerDirectionClass('unknown')).toBe('unknown');
    expect(markerDirectionClass(undefined)).toBe('unknown');
  });
});
