import { assertNever, type TravelDirection } from './types.js';

export function parseTravelDirection(value: string | undefined | null): TravelDirection {
  if (!value) {
    return 'unknown';
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'ida':
    case 'going':
    case 'outbound':
    case 'salida':
      return 'outbound';
    case 'vuelta':
    case 'returning':
    case 'return':
    case 'inbound':
    case 'regreso':
      return 'inbound';
    case 'unknown':
    case 'desconocido':
      return 'unknown';
    default:
      return 'unknown';
  }
}

export function directionLabel(direction: TravelDirection): string {
  switch (direction) {
    case 'outbound':
      return 'IDA';
    case 'inbound':
      return 'VUELTA';
    case 'unknown':
      return 'Sentido sin determinar';
    default:
      return assertNever(direction);
  }
}

export function isDeterminedDirection(direction: TravelDirection | undefined): boolean {
  return direction === 'outbound' || direction === 'inbound';
}
