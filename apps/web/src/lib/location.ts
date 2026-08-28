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

export const MAX_TRUSTED_LOCATION_ACCURACY_M = 75;
export const NAVIGATION_READY_ACCURACY_M = 30;

export function isNavigationReadyLocation(location: ClientLocation): boolean {
  return location.accuracy !== undefined && location.accuracy <= NAVIGATION_READY_ACCURACY_M;
}

function clientLocation(position: GeolocationPosition): ClientLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

export function createLocationWatch(handlers: {
  onFix: (location: ClientLocation) => void;
  onImprecise?: (location: ClientLocation) => void;
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
        const location = clientLocation(position);
        if (
          location.accuracy !== undefined &&
          location.accuracy > MAX_TRUSTED_LOCATION_ACCURACY_M
        ) {
          handlers.onImprecise?.(location);
          return;
        }
        handlers.onFix(location);
      },
      (error) => {
        stop();
        handlers.onError(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return {
    start,
    stop,
    isActive: () => watchId !== null,
  };
}
