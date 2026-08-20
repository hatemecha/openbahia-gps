export type LocationResult =
  | { ok: true; latitude: number; longitude: number; accuracy?: number }
  | { ok: false; reason: 'denied' | 'unavailable' | 'unsupported' };

export interface ClientLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type LocationWatchError = 'denied' | 'unavailable' | 'unsupported';

export interface LocationWatch {
  start: () => void;
  stop: () => void;
  isActive: () => boolean;
}

export function requestClientLocation(): Promise<LocationResult> {
  if (!navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        resolve({
          ok: false,
          reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        });
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 30_000 },
    );
  });
}

export function createLocationWatch(handlers: {
  onFix: (location: ClientLocation) => void;
  onError: (reason: LocationWatchError) => void;
}): LocationWatch {
  let watchId: number | null = null;

  const stop = () => {
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
  };

  const start = () => {
    if (watchId !== null) {
      return;
    }
    if (!navigator.geolocation) {
      handlers.onError('unsupported');
      return;
    }
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        handlers.onFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        stop();
        handlers.onError(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 5_000 },
    );
  };

  return {
    start,
    stop,
    isActive: () => watchId !== null,
  };
}
