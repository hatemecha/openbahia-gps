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
});
