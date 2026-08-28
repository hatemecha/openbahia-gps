import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocationWatch,
  isNavigationReadyLocation,
  MAX_TRUSTED_LOCATION_ACCURACY_M,
} from './location';

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
    emit(id: number, latitude: number, longitude: number, accuracy = 12) {
      watches.get(id)?.success({
        coords: {
          latitude,
          longitude,
          accuracy,
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
  it('separates a visible location from navigation-grade precision', () => {
    expect(
      isNavigationReadyLocation({ latitude: -38.7183, longitude: -62.2663, accuracy: 18 }),
    ).toBe(true);
    expect(
      isNavigationReadyLocation({ latitude: -38.7183, longitude: -62.2663, accuracy: 31 }),
    ).toBe(false);
  });

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
    expect(geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
    geo.emit(1, -38.7183, -62.2663);
    expect(fixes).toEqual([{ latitude: -38.7183, longitude: -62.2663, accuracy: 12 }]);
  });

  it('waits for a precise fix instead of presenting a coarse network location', () => {
    const geo = mockGeolocation();
    const fixes: Array<{ latitude: number; longitude: number }> = [];
    const imprecise: number[] = [];
    const watch = createLocationWatch({
      onFix: (location) => fixes.push(location),
      onImprecise: (location) => imprecise.push(location.accuracy ?? 0),
      onError: () => undefined,
    });
    watch.start();
    geo.emit(1, -38.7183, -62.2663, MAX_TRUSTED_LOCATION_ACCURACY_M + 1);
    expect(fixes).toEqual([]);
    expect(imprecise).toEqual([MAX_TRUSTED_LOCATION_ACCURACY_M + 1]);
    geo.emit(1, -38.7184, -62.2664, 18);
    expect(fixes).toEqual([{ latitude: -38.7184, longitude: -62.2664, accuracy: 18 }]);
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
