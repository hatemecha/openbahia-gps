export type ProviderId = 'gpsbahia' | 'gpsbus' | 'mock';

export type TravelDirection = 'outbound' | 'inbound' | 'unknown';

export type RouteAssignmentSource = 'provider' | 'map-matching' | 'unknown';

export type PositionKind = 'gps' | 'map-matched';

export type RealtimeState =
  | 'live'
  | 'delayed'
  | 'very_stale'
  | 'no_vehicles'
  | 'offline'
  | 'upstream_unavailable'
  | 'initial_loading'
  | 'demo';

export type StaticDataState = 'ready' | 'cached' | 'partial' | 'unavailable';

export type RouteMatchState = 'matched' | 'uncertain' | 'off-route' | 'not-available';

export type GpsRejectReason =
  | 'ok'
  | 'nan'
  | 'null-island'
  | 'out-of-bounds'
  | 'future-timestamp'
  | 'jump';

export interface NextStopHint {
  stopId: string;
  name?: string;
  distanceMeters: number;
}

export interface VehiclePosition {
  vehicleId: string;
  lineId?: string;
  routeId?: string;
  matchedRouteId?: string;
  tripId?: string;
  latitude: number;
  longitude: number;
  matchedLatitude?: number;
  matchedLongitude?: number;
  bearing?: number;
  speed?: number;
  observedAt: string;
  receivedAt: string;
  source: string;
  rawRouteId?: string;
  direction?: TravelDirection;
  routeProgress?: number;
  routeConfidence?: number;
  distanceFromRouteMeters?: number;
  nextStop?: NextStopHint;
  routeAssignmentSource?: RouteAssignmentSource;
  positionKind?: PositionKind;
  routeMatchState?: RouteMatchState;
}

export interface TransitLine {
  id: string;
  name: string;
  shortName?: string;
  rawRouteId?: string;
  hasRoutes?: boolean;
  hasRealtime?: boolean;
  branch?: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface TransitRoute {
  id: string;
  lineId: string;
  name?: string;
  direction: TravelDirection;
  branch?: string;
  path: GeoPoint[];
  source: string;
}

export interface TransitStop {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  routeIds: string[];
  source: string;
}

export interface StaticDatasetMetadata {
  source: string;
  version: string;
  fetchedAt: string;
  checksum: string;
  schemaVersion?: number;
}

export interface StaticTransitProvider {
  readonly id: string;
  getLines(): Promise<TransitLine[]>;
  getRoutes(options?: { lineId?: string }): Promise<TransitRoute[]>;
  getStops(options?: { lineId?: string; routeId?: string }): Promise<TransitStop[]>;
}

export interface RouteMatch {
  routeId: string;
  direction: TravelDirection;
  distanceFromRouteMeters: number;
  progress: number;
  confidence: number;
  matchedPoint: GeoPoint;
  assignmentSource: RouteAssignmentSource;
}

export interface ProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface GetVehiclesOptions {
  routeId?: string;
  lineId?: string;
}

export interface RealtimeProvider {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  getAvailability(): Promise<ProviderAvailability>;
  getLines(): Promise<TransitLine[]>;
  getVehicles(options?: GetVehiclesOptions): Promise<VehiclePosition[]>;
}

export type FreshnessLevel = 'live' | 'stale' | 'very_stale';

export type ConnectionState = 'live' | 'delayed' | 'unavailable' | 'demo';

export interface FreshnessConfig {
  liveAfterMs: number;
  staleAfterMs: number;
  veryStaleAfterMs: number;
}

export function assertNever(value: never, message = 'Unhandled union member'): never {
  throw new Error(`${message}: ${String(value)}`);
}
