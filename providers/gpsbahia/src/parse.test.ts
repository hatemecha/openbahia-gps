import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyGpsBahiaTrack, extractPublicPageToken, parseGpsBahiaTrackPayload } from './parse.js';

const root = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(root, '../fixtures/track-data-503.json'), 'utf8')) as unknown;
const emptyLine = JSON.parse(
  readFileSync(join(root, '../../../test/fixtures/gpsbahia/empty-line.json'), 'utf8'),
) as unknown;
const invalidSession = JSON.parse(
  readFileSync(join(root, '../../../test/fixtures/gpsbahia/invalid-session.json'), 'utf8'),
) as unknown;

describe('gpsbahia parser', () => {
  it('normalizes public track_data vehicles and keeps provider direction', () => {
    const vehicles = parseGpsBahiaTrackPayload(fixture, {
      routeId: '503',
      rawRouteId: '6',
      receivedAt: '2026-08-19T12:21:30.000Z',
      source: 'gpsbahia',
    });
    expect(vehicles.length).toBe(9);
    expect(vehicles[0]?.vehicleId).toBe('SG 20');
    expect(vehicles[0]?.routeId).toBe('503');
    expect(vehicles[0]?.lineId).toBe('503');
    expect(vehicles[0]?.direction).toBe('outbound');
    expect(vehicles[0]?.routeAssignmentSource).toBe('provider');
    expect(vehicles[0]?.source).toBe('gpsbahia');
    expect(vehicles[0]?.latitude).toBeCloseTo(-38.754752, 5);
    expect(vehicles[0]?.observedAt).toBe('2026-08-19T12:05:10.000Z');
    expect(vehicles[0]?.bearing).toBe(104);
  });

  it('drops invalid coordinates', () => {
    const vehicles = parseGpsBahiaTrackPayload({
      status: 'ok',
      data: [{ interno: 'X', lat: '999', lng: '0', dt_tracker: '2026-08-19 12:00:00' }],
    });
    expect(vehicles).toEqual([]);
  });

  it('extracts the public homepage token', () => {
    expect(extractPublicPageToken("var vgggaxqq = 'abc123def'")).toBe('abc123def');
    expect(extractPublicPageToken('<html></html>')).toBeNull();
  });

  it('classifies empty line vs invalid session vs vehicles', () => {
    expect(classifyGpsBahiaTrack(fixture)).toBe('vehicles');
    expect(classifyGpsBahiaTrack(emptyLine)).toBe('empty');
    expect(classifyGpsBahiaTrack(invalidSession)).toBe('invalid-session');
    expect(classifyGpsBahiaTrack({ status: 'error', error: 'invalidToken' })).toBe('invalid-token');
  });

  it('does not relabel a row whose observed line id belongs to another line', () => {
    const vehicles = parseGpsBahiaTrackPayload(
      {
        status: 'ok',
        data: [
          {
            interno: 'SG 99',
            lat: '-38.70',
            lng: '-62.25',
            dt_tracker: '2026-08-19 12:00:00',
            direccion: 'ida',
            linea_id: '9',
          },
          {
            interno: 'SG 12',
            lat: '-38.71',
            lng: '-62.26',
            dt_tracker: '2026-08-19 12:00:00',
            direccion: 'ida',
            linea_id: '12',
          },
        ],
      },
      { routeId: '513', rawRouteId: '12', receivedAt: '2026-08-19T12:00:00.000Z' },
    );
    expect(vehicles.map((vehicle) => vehicle.vehicleId)).toEqual(['SG 12']);
    expect(vehicles[0]?.lineId).toBe('513');
    expect(vehicles[0]?.rawRouteId).toBe('12');
  });

  it('keeps rows when the payload has no line identity fields', () => {
    const vehicles = parseGpsBahiaTrackPayload(
      {
        status: 'ok',
        data: [
          {
            interno: 'SG 1',
            lat: '-38.70',
            lng: '-62.25',
            dt_tracker: '2026-08-19 12:00:00',
            direccion: 'ida',
          },
        ],
      },
      { routeId: '513', rawRouteId: '12', receivedAt: '2026-08-19T12:00:00.000Z' },
    );
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]?.lineId).toBe('513');
  });

  it('treats track_data lat/lng as the official Leaflet position with no transform', () => {
    const payload = {
      status: 'ok',
      data: [
        {
          interno: 'F 25',
          lat: -38.731093,
          lng: -62.232635,
          dt_tracker: '2026-08-20 12:32:43',
          direccion: 'ida',
          angle: 95,
        },
      ],
    };
    const vehicles = parseGpsBahiaTrackPayload(payload, {
      routeId: '513',
      rawRouteId: '12',
      receivedAt: '2026-08-20T12:32:43.000Z',
    });
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]?.latitude).toBe(-38.731093);
    expect(vehicles[0]?.longitude).toBe(-62.232635);
  });
});
