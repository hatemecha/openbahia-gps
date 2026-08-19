import type { TravelDirection } from '@openbahia/transit-core';

export function isDirectionVisible(
  direction: TravelDirection | undefined,
  showOutbound: boolean,
  showInbound: boolean,
): boolean {
  switch (direction) {
    case 'outbound':
      return showOutbound;
    case 'inbound':
      return showInbound;
    case 'unknown':
    case undefined:
      return showOutbound && showInbound;
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}

export function markerDirectionClass(
  direction: TravelDirection | undefined,
): 'outbound' | 'inbound' | 'unknown' {
  if (direction === 'inbound' || direction === 'outbound') {
    return direction;
  }
  return 'unknown';
}

export function directionSpokenLabel(direction: TravelDirection | undefined): string {
  switch (direction) {
    case 'inbound':
      return 'VUELTA';
    case 'outbound':
      return 'IDA';
    case 'unknown':
    case undefined:
      return 'sentido sin determinar';
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}
