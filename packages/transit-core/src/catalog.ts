import type { TransitLine } from './types.js';

export interface CatalogLine extends TransitLine {
  rawRouteId: string;
}

export const BAHIA_BLANCA_LINES: CatalogLine[] = [
  { id: '319', name: '319', shortName: '319', rawRouteId: '3' },
  { id: '500', name: '500', shortName: '500', rawRouteId: '4' },
  { id: '502', name: '502', shortName: '502', rawRouteId: '34' },
  { id: '503', name: '503', shortName: '503', rawRouteId: '6' },
  { id: '503-uns', name: '503 UNS Palihue', shortName: '503 UNS', rawRouteId: '39' },
  { id: '504', name: '504', shortName: '504', rawRouteId: '7' },
  { id: '505', name: '505', shortName: '505', rawRouteId: '8' },
  { id: '506', name: '506', shortName: '506', rawRouteId: '9' },
  { id: '507', name: '507', shortName: '507', rawRouteId: '10' },
  { id: '509', name: '509', shortName: '509', rawRouteId: '1' },
  { id: '512', name: '512', shortName: '512', rawRouteId: '11' },
  { id: '513', name: '513', shortName: '513', rawRouteId: '12' },
  { id: '513ex', name: '513 EX', shortName: '513 EX', rawRouteId: '13' },
  { id: '514', name: '514', shortName: '514', rawRouteId: '14' },
  { id: '516', name: '516', shortName: '516', rawRouteId: '15' },
  { id: '517', name: '517', shortName: '517', rawRouteId: '16' },
  { id: '517-rondin', name: '517 Rondín', shortName: '517 R', rawRouteId: '42' },
  { id: '518', name: '518', shortName: '518', rawRouteId: '17' },
  { id: '519', name: '519', shortName: '519', rawRouteId: '18' },
  { id: '519a', name: '519 A', shortName: '519 A', rawRouteId: '19' },
  { id: '520', name: '520', shortName: '520', rawRouteId: '30' },
  { id: '520-aero', name: '520 Aeropuerto', shortName: '520 AERO', rawRouteId: '40' },
  { id: '521-bosque', name: '521 Bosque Alto', shortName: '521 BA', rawRouteId: '37' },
  { id: '521-conicet', name: '521 Conicet', shortName: '521 C', rawRouteId: '38' },
];

export function lineById(id: string): CatalogLine | undefined {
  return BAHIA_BLANCA_LINES.find((line) => line.id === id);
}

export function lineByRawRouteId(rawRouteId: string): CatalogLine | undefined {
  return BAHIA_BLANCA_LINES.find((line) => line.rawRouteId === rawRouteId);
}

export function resolveRouteId(input: string | undefined): CatalogLine | undefined {
  if (!input) {
    return undefined;
  }
  return lineById(input) ?? lineByRawRouteId(input);
}
