import { PUBLIC_API_URL } from '$env/static/public';
import type { LinesResponse, RoutesResponse, StopsResponse, VehiclesResponse } from './types';

function resolveApiBase(): string {
  const configured = PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) {
    return configured;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export const API_BASE = resolveApiBase();

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(new URL(path, API_BASE), { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchVehicles(
  lineId?: string,
  signal?: AbortSignal,
): Promise<VehiclesResponse> {
  const url = new URL('/api/vehicles', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as VehiclesResponse;
}

export async function fetchLines(signal?: AbortSignal): Promise<LinesResponse> {
  return fetchJson<LinesResponse>('/api/lines', signal);
}

export async function fetchRoutes(lineId?: string, signal?: AbortSignal): Promise<RoutesResponse> {
  const url = new URL('/api/routes', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as RoutesResponse;
}

export async function fetchStops(lineId?: string, signal?: AbortSignal): Promise<StopsResponse> {
  const url = new URL('/api/stops', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as StopsResponse;
}

export function realtimeUrl(lineId?: string): string {
  const url = new URL('/api/realtime/vehicles', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  return url.toString();
}
