import type {
  ConnectionState,
  RealtimeState,
  StaticDataState,
  TransitLine,
  TransitRoute,
  TransitStop,
  VehiclePosition,
} from '@openbahia/transit-core';

export interface VehiclesMeta {
  provider: string;
  count: number;
  generatedAt: string;
  stale: boolean;
  freshness: 'live' | 'stale' | 'very_stale';
  connectionState: ConnectionState;
  available: boolean;
  lastSuccessfulUpdate: string | null;
  reason?: string;
  lineId?: string;
  realtimeState?: RealtimeState;
  staticDataState?: StaticDataState;
}

export interface VehiclesResponse {
  data: VehiclePosition[];
  meta: VehiclesMeta;
}

export interface LinesResponse {
  data: TransitLine[];
  meta: { provider: string; count: number; generatedAt: string };
}

export interface RoutesResponse {
  data: TransitRoute[];
  meta: { source: string; count: number; generatedAt: string; lineId?: string };
}

export interface StopsResponse {
  data: TransitStop[];
  meta: { source: string; count: number; generatedAt: string; lineId?: string };
}

export interface MapControls {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (longitude: number, latitude: number, accuracy?: number) => void;
  fitLine: () => void;
}

export type { ConnectionState, TransitLine, TransitRoute, TransitStop, VehiclePosition };
