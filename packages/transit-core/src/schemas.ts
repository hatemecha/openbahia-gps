import { z } from 'zod';

const isoDate = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'invalid ISO timestamp');

export const travelDirectionSchema = z.enum(['outbound', 'inbound', 'unknown']);
export const routeAssignmentSourceSchema = z.enum(['provider', 'map-matching', 'unknown']);
export const positionKindSchema = z.enum(['gps', 'map-matched']);
export const routeMatchStateSchema = z.enum(['matched', 'uncertain', 'off-route', 'not-available']);
export const realtimeStateSchema = z.enum([
  'live',
  'delayed',
  'very_stale',
  'no_vehicles',
  'offline',
  'upstream_unavailable',
  'initial_loading',
  'demo',
]);
export const staticDataStateSchema = z.enum(['ready', 'cached', 'partial', 'unavailable']);

export const nextStopHintSchema = z.object({
  stopId: z.string().min(1),
  name: z.string().min(1).optional(),
  distanceMeters: z.number().gte(0),
});

export const geoPointSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
});

export const vehiclePositionSchema = z.object({
  vehicleId: z.string().min(1),
  lineId: z.string().min(1).optional(),
  routeId: z.string().min(1).optional(),
  matchedRouteId: z.string().min(1).optional(),
  tripId: z.string().min(1).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  matchedLatitude: z.number().gte(-90).lte(90).optional(),
  matchedLongitude: z.number().gte(-180).lte(180).optional(),
  bearing: z.number().gte(0).lt(360).optional(),
  speed: z.number().gte(0).optional(),
  observedAt: isoDate,
  receivedAt: isoDate,
  source: z.string().min(1),
  rawRouteId: z.string().min(1).optional(),
  direction: travelDirectionSchema.optional(),
  routeProgress: z.number().gte(0).lte(1).optional(),
  routeConfidence: z.number().gte(0).lte(1).optional(),
  distanceFromRouteMeters: z.number().gte(0).optional(),
  nextStop: nextStopHintSchema.optional(),
  routeAssignmentSource: routeAssignmentSourceSchema.optional(),
  positionKind: positionKindSchema.optional(),
  routeMatchState: routeMatchStateSchema.optional(),
});

export const transitLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1).optional(),
  rawRouteId: z.string().min(1).optional(),
  hasRoutes: z.boolean().optional(),
  hasRealtime: z.boolean().optional(),
  branch: z.string().min(1).optional(),
});

export const transitRouteSchema = z.object({
  id: z.string().min(1),
  lineId: z.string().min(1),
  name: z.string().min(1).optional(),
  direction: travelDirectionSchema,
  branch: z.string().min(1).optional(),
  path: z.array(geoPointSchema).min(2),
  source: z.string().min(1),
});

export const transitStopSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  routeIds: z.array(z.string().min(1)),
  source: z.string().min(1),
});

export const freshnessLevelSchema = z.enum(['live', 'stale', 'very_stale']);

export const connectionStateSchema = z.enum(['live', 'delayed', 'unavailable', 'demo']);

export const vehiclesMetaSchema = z.object({
  provider: z.string().min(1),
  count: z.number().int().gte(0),
  generatedAt: isoDate,
  stale: z.boolean(),
  freshness: freshnessLevelSchema,
  connectionState: connectionStateSchema,
  available: z.boolean(),
  lastSuccessfulUpdate: isoDate.nullable(),
  reason: z.string().optional(),
  lineId: z.string().min(1).optional(),
  realtimeState: realtimeStateSchema.optional(),
  staticDataState: staticDataStateSchema.optional(),
});

export const vehiclesResponseSchema = z.object({
  data: z.array(vehiclePositionSchema),
  meta: vehiclesMetaSchema,
});

export type VehiclePositionInput = z.input<typeof vehiclePositionSchema>;

export function parseVehiclePosition(input: unknown) {
  return vehiclePositionSchema.safeParse(input);
}

export function parseVehiclePositions(input: unknown) {
  return z.array(vehiclePositionSchema).safeParse(input);
}

export function parseTransitRoutes(input: unknown) {
  return z.array(transitRouteSchema).safeParse(input);
}

export function parseTransitStops(input: unknown) {
  return z.array(transitStopSchema).safeParse(input);
}

export function parseTransitLines(input: unknown) {
  return z.array(transitLineSchema).safeParse(input);
}

export function normalizeBearing(value: number): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}
