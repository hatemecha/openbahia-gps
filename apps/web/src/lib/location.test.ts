import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocationWatch } from './location';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockGeolocation() {
  const watches = new Map<number, { success: PositionCallback }>();
  let nextId = 1;
  const clearWatch = vi.fn((id: number) => {
    watches.delete(id);
  });
  const watchPosition = vi.fn((success: PositionCallback) => {
    const id = nextId;
    nextId += 1;
    watches.set(id, { success });
    return id;
  });
  vi.stubGlobal('navigator', {
    geolocation: { watchPosition, clearWatch },
  });
  return {
    watches,
    watchPosition,
    clearWatch,
    emit(id: number, latitude: number, longitude: number) {
      watches.get(id)?.success({
        coords: {
          latitude,
          longitude,
          accuracy: 12,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  };
}

describe('createLocationWatch', () => {
  it('is inactive until started and creates no marker payload', () => {
    const geo = mockGeolocation();
    const fixes: Array<{ latitude: number; longitude: number }> = [];
    const watch = createLocationWatch({
      onFix: (location) => fixes.push(location),
      onError: () => undefined,
    });
    expect(watch.isActive()).toBe(false);
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(fixes).toEqual([]);
  });

  it('starts watchPosition and reports fixes while active', () => {
    const geo = mockGeolocation();
    const fixes: Array<{ latitude: number; longitude: number }> = [];
    const watch = createLocationWatch({
      onFix: (location) => fixes.push(location),
      onError: () => undefined,
    });
    watch.start();
    expect(watch.isActive()).toBe(true);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    geo.emit(1, -38.7183, -62.2663);
    expect(fixes).toEqual([{ latitude: -38.7183, longitude: -62.2663, accuracy: 12 }]);
  });

  it('clears the watch and stops reporting when disabled', () => {
    const geo = mockGeolocation();
    const watch = createLocationWatch({
      onFix: () => undefined,
      onError: () => undefined,
    });
    watch.start();
    watch.stop();
    expect(watch.isActive()).toBe(false);
    expect(geo.clearWatch).toHaveBeenCalledWith(1);
    watch.start();
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  });
});
