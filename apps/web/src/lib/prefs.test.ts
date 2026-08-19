import { describe, expect, it, beforeEach } from 'vitest';
import { loadPrefs, savePrefs } from './prefs';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: () => null,
    length: 0,
  };
});

describe('prefs', () => {
  it('returns defaults when localStorage is corrupt', () => {
    localStorage.setItem('openbahia.prefs.v1', '{not json');
    expect(loadPrefs()).toEqual({});
  });

  it('round-trips a valid last line and direction toggles', () => {
    savePrefs({ lineId: '504', showOutbound: false, showInbound: true });
    expect(loadPrefs()).toEqual({ lineId: '504', showOutbound: false, showInbound: true });
  });

  it('migrates the old exclusive direction filter', () => {
    localStorage.setItem(
      'openbahia.prefs.v1',
      JSON.stringify({ lineId: '503', directionFilter: 'inbound' }),
    );
    expect(loadPrefs()).toEqual({ lineId: '503', showOutbound: false, showInbound: true });
  });
});
