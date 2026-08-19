import {
  assertNever,
  type RealtimeState,
  type RouteMatchState,
  type StaticDataState,
} from './types.js';

/** Stable internal reason codes. API `reason` is the Spanish phrase below. */
export type PublicReasonCode =
  | 'starting'
  | 'loading'
  | 'slow'
  | 'upstream_unavailable'
  | 'no_vehicles'
  | 'no_routes'
  | 'no_stops'
  | 'offline'
  | 'timeout'
  | 'invalid_line'
  | 'stale'
  | 'very_stale'
  | 'off_route'
  | 'uncertain_route'
  | 'no_gps'
  | 'map_unavailable';

export const COPY = {
  starting: 'Estamos cargando la línea…',
  loading: (line: string) => `Cargando línea ${line}…`,
  slow: 'Está tardando más de lo habitual…',
  failed_update: 'No pudimos actualizarla.',
  retry: 'Reintentar',
  upstream_unavailable: 'No pudimos actualizar las ubicaciones en vivo.',
  no_vehicles: 'Ahora no hay colectivos de esta línea en el mapa.',
  no_routes: 'No tenemos el recorrido de esta línea.',
  no_stops: 'No hay paradas publicadas para esta línea.',
  stops_unavailable: 'Paradas no disponibles por ahora.',
  offline: 'Sin conexión. Las ubicaciones en vivo no pueden actualizarse.',
  timeout: 'La consulta tardó demasiado.',
  invalid_line: 'Esa línea no está en el catálogo.',
  stale: (age: string) => `Última ubicación ${age}`,
  very_stale: (age: string) => `Última ubicación conocida ${age}. Puede no estar actualizada.`,
  off_route: 'Recorrido habitual no confirmado',
  uncertain_route: 'Recorrido no confirmado del todo',
  no_gps: 'Sin GPS',
  map_unavailable:
    'El mapa no se pudo mostrar. Podés elegir la línea y ver los colectivos en la lista.',
  choose_line: '¿Qué colectivo querés ver?',
  line_label: 'Línea',
  search_line: 'Buscar línea',
  no_search: 'Ninguna línea coincide con esa búsqueda.',
  see_buses: 'Ver colectivos de esta línea',
  hide_buses: 'Ocultar lista',
  follow: 'Seguir colectivo',
  unfollow: 'Dejar de seguir',
  resume_follow: 'Seguir de nuevo',
  my_location: 'Mi ubicación',
  location_why:
    'Usamos tu ubicación solo en este teléfono para centrar el mapa. No la enviamos al servidor.',
  location_denied: 'No hay permiso de ubicación. El mapa sigue funcionando igual.',
  location_unavailable: 'No pudimos leer tu ubicación. El mapa sigue funcionando.',
  close: 'Cerrar',
  reload_map: 'Recargar mapa',
  zoom_in: 'Acercar',
  zoom_out: 'Alejar',
  back_line: (line: string) => `Volver a ${line}`,
  updated_now: 'actualizado ahora',
  next_stop: 'Próxima parada',
  undetermined_stop: 'Sin determinar',
  unit: 'Unidad',
  direction: 'Sentido',
  updated: 'Actualizado',
  ida: 'IDA',
  vuelta: 'VUELTA',
  view_ida: 'Ver ida',
  view_vuelta: 'Ver vuelta',
  all: 'Todos',
  live: 'En vivo',
  delayed: 'Demorado',
  disconnected: 'Sin conexión',
  demo: 'Modo demostración',
  skip_to_map: 'Ir al contenido',
} as const;

export function reasonPhrase(code: PublicReasonCode, extra?: string): string {
  switch (code) {
    case 'starting':
    case 'loading':
      return extra ? COPY.loading(extra) : COPY.starting;
    case 'slow':
      return COPY.slow;
    case 'upstream_unavailable':
      return COPY.upstream_unavailable;
    case 'no_vehicles':
      return COPY.no_vehicles;
    case 'no_routes':
      return COPY.no_routes;
    case 'no_stops':
      return COPY.no_stops;
    case 'offline':
      return COPY.offline;
    case 'timeout':
      return COPY.timeout;
    case 'invalid_line':
      return COPY.invalid_line;
    case 'stale':
      return extra ? COPY.stale(extra) : 'Los datos se están demorando.';
    case 'very_stale':
      return extra ? COPY.very_stale(extra) : COPY.upstream_unavailable;
    case 'off_route':
      return COPY.off_route;
    case 'uncertain_route':
      return COPY.uncertain_route;
    case 'no_gps':
      return COPY.no_gps;
    case 'map_unavailable':
      return COPY.map_unavailable;
    default:
      return assertNever(code);
  }
}

export function realtimeStateLabel(state: RealtimeState): string {
  switch (state) {
    case 'live':
      return COPY.live;
    case 'delayed':
      return COPY.delayed;
    case 'very_stale':
      return 'Datos viejos';
    case 'no_vehicles':
      return COPY.no_vehicles;
    case 'offline':
      return COPY.disconnected;
    case 'upstream_unavailable':
      return COPY.upstream_unavailable;
    case 'initial_loading':
      return COPY.starting;
    case 'demo':
      return COPY.demo;
    default:
      return assertNever(state);
  }
}

export function routeMatchLabel(state: RouteMatchState | undefined): string | null {
  switch (state) {
    case undefined:
    case 'matched':
      return null;
    case 'uncertain':
      return COPY.uncertain_route;
    case 'off-route':
      return COPY.off_route;
    case 'not-available':
      return null;
    default:
      return assertNever(state);
  }
}

export function staticDataStateLabel(state: StaticDataState): string | null {
  switch (state) {
    case 'ready':
    case 'cached':
      return null;
    case 'partial':
      return 'Hay recorrido, pero faltan paradas.';
    case 'unavailable':
      return COPY.no_routes;
    default:
      return assertNever(state);
  }
}
