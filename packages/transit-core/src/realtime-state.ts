import { assertNever, type ConnectionState, type FreshnessLevel, type RealtimeState } from './types.js';

export function deriveRealtimeState(args: {
  providerId: string;
  available: boolean;
  vehicleCount: number;
  freshness: FreshnessLevel;
  lastSuccessfulUpdate: string | null;
  refreshFailed: boolean;
  started: boolean;
}): RealtimeState {
  if (args.providerId === 'mock') {
    if (args.available && args.vehicleCount === 0) {
      return 'no_vehicles';
    }
    return 'demo';
  }
  if (!args.started || (!args.lastSuccessfulUpdate && !args.available && args.vehicleCount === 0)) {
    return args.lastSuccessfulUpdate ? 'upstream_unavailable' : 'initial_loading';
  }
  if (!args.available && args.vehicleCount === 0 && !args.lastSuccessfulUpdate) {
    return 'upstream_unavailable';
  }
  if (args.available && args.vehicleCount === 0) {
    return 'no_vehicles';
  }
  if (args.refreshFailed || !args.available) {
    switch (args.freshness) {
      case 'live':
      case 'stale':
        return 'delayed';
      case 'very_stale':
        return 'very_stale';
      default:
        return assertNever(args.freshness);
    }
  }
  switch (args.freshness) {
    case 'live':
      return 'live';
    case 'stale':
      return 'delayed';
    case 'very_stale':
      return 'very_stale';
    default:
      return assertNever(args.freshness);
  }
}

export function connectionStateFromRealtime(state: RealtimeState): ConnectionState {
  switch (state) {
    case 'live':
      return 'live';
    case 'delayed':
    case 'very_stale':
    case 'no_vehicles':
      return 'delayed';
    case 'offline':
    case 'upstream_unavailable':
    case 'initial_loading':
      return 'unavailable';
    case 'demo':
      return 'demo';
    default:
      return assertNever(state);
  }
}
