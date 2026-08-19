export type LocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: 'denied' | 'unavailable' | 'unsupported' };

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
