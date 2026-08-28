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

const MANAGED_MARKER_CLASSES = ['outbound', 'inbound', 'unknown', 'selected'] as const;

/** Preserve MapLibre's own marker classes while updating OpenBahía presentation state. */
export function markerPresentationClassName(
  currentClassName: string,
  direction: TravelDirection | undefined,
  selected: boolean,
): string {
  const classes = new Set(currentClassName.split(/\s+/).filter(Boolean));
  classes.add('bus-marker');
  for (const className of MANAGED_MARKER_CLASSES) {
    classes.delete(className);
  }
  classes.add(markerDirectionClass(direction));
  if (selected) {
    classes.add('selected');
  }
  return [...classes].join(' ');
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
