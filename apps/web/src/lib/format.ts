import {
  COPY,
  directionLabel,
  reasonPhrase,
  realtimeStateLabel,
  type RealtimeState,
  type TravelDirection,
} from '@openbahia/transit-core';
import type { ConnectionState, VehiclePosition } from './types';

export function formatAge(observedAt: string, nowMs = Date.now()): string {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) {
    return 'hora desconocida';
  }
  const age = Math.max(0, nowMs - observed);
  if (age < 15_000) {
    return COPY.updated_now;
  }
  const seconds = Math.round(age / 1000);
  if (seconds < 60) {
    return `hace ${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `hace ${hours} h`;
  }
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

export function connectionLabel(state: ConnectionState | RealtimeState): string {
  switch (state) {
    case 'live':
      return COPY.live;
    case 'delayed':
    case 'very_stale':
      return COPY.delayed;
    case 'unavailable':
    case 'upstream_unavailable':
      return COPY.upstream_unavailable;
    case 'offline':
      return COPY.disconnected;
    case 'no_vehicles':
      return reasonPhrase('no_vehicles');
    case 'initial_loading':
      return COPY.starting;
    case 'demo':
      return COPY.demo;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function statusCaption(state: RealtimeState | undefined, fallback: ConnectionState): string {
  if (state) {
    return realtimeStateLabel(state);
  }
  return connectionLabel(fallback);
}

export function vehicleHeading(vehicle: VehiclePosition): string {
  const line = vehicle.lineId ?? vehicle.routeId ?? '—';
  if (vehicle.direction === 'outbound' || vehicle.direction === 'inbound') {
    return `${line} · ${directionLabel(vehicle.direction)}`;
  }
  return line;
}

export function directionCaption(direction: TravelDirection | undefined): string {
  if (!direction || direction === 'unknown') {
    return 'Sentido sin determinar';
  }
  return directionLabel(direction);
}

export function formatMeters(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value < 1000) {
    return `${Math.round(value)} m`;
  }
  return `${(value / 1000).toFixed(1)} km`;
}
