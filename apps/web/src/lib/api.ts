import { PUBLIC_API_URL } from '$env/static/public';
import type { LinesResponse, RoutesResponse, StopsResponse, VehiclesResponse } from './types';

export const API_BASE = PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export async function fetchVehicles(lineId?: string): Promise<VehiclesResponse> {
  const url = new URL('/api/vehicles', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as VehiclesResponse;
}

export async function fetchLines(): Promise<LinesResponse> {
  const response = await fetch(new URL('/api/lines', API_BASE));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as LinesResponse;
}

export async function fetchRoutes(lineId?: string): Promise<RoutesResponse> {
  const url = new URL('/api/routes', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as RoutesResponse;
}

export async function fetchStops(lineId?: string): Promise<StopsResponse> {
  const url = new URL('/api/stops', API_BASE);
  if (lineId) {
    url.searchParams.set('lineId', lineId);
  }
  const response = await fetch(url);
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
