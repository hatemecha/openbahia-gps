import type { AppConfig } from '@openbahia/shared';

/** Same-origin needs no CORS; development gets only loopback origins by default. */
export function isAllowedCorsOrigin(origin: string, config: AppConfig): boolean {
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
      return true;
    }
    return config.corsAllowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}
