<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { BAHIA_BLANCA_CENTER, routesToGeoJson, stopsToGeoJson } from '@openbahia/transit-core';
  import type { MapControls, TransitRoute, TransitStop, VehiclePosition } from '$lib/types';
  import {
    directionSpokenLabel,
    isDirectionVisible,
    markerDirectionClass,
  } from '$lib/direction-visibility';
  import { createRouteArrowImage, createStopIconImage } from '$lib/map-icons';
  import type { ClientLocation } from '$lib/location';
  import { displayCoords, displayPoint, type AnimatedVehicle } from '$lib/motion';

  const COLOR_OUTBOUND = '#b42318';
  const COLOR_INBOUND = '#0b6e99';

  let {
    vehicles,
    routes = [],
    stops = [],
    debug = false,
    showOutbound = true,
    showInbound = true,
    selectedVehicleId = null,
    followVehicleId = null,
    reducedMotion = false,
    userLocation = null,
    /* eslint-disable no-useless-assignment -- $bindable is the parent contract */
    mapFailed = $bindable(false),
    mapControls = $bindable<MapControls | null>(null),
    /* eslint-enable no-useless-assignment */
    onSelectVehicle,
    onSelectStop,
    onUserPan,
  }: {
    vehicles: VehiclePosition[];
    routes?: TransitRoute[];
    stops?: TransitStop[];
    debug?: boolean;
    showOutbound?: boolean;
    showInbound?: boolean;
    selectedVehicleId?: string | null;
    followVehicleId?: string | null;
    reducedMotion?: boolean;
    userLocation?: ClientLocation | null;
    mapFailed?: boolean;
    mapControls?: MapControls | null;
    onSelectVehicle?: (vehicle: VehiclePosition | null) => void;
    onSelectStop?: (stop: TransitStop | null) => void;
    onUserPan?: () => void;
  } = $props();

  let container: HTMLDivElement | undefined = $state();
  let map: import('maplibre-gl').Map | undefined;
  const markers = new Map<string, import('maplibre-gl').Marker>();
  const animated = new Map<string, AnimatedVehicle>();
  let userMarker: import('maplibre-gl').Marker | undefined;
  let raf = 0;
  let maplibre: typeof import('maplibre-gl') | undefined;
  let mapReady = $state(false);
  let lastFittedLine = '';
  let destroyed = false;

  const DURATION_MS = 0;
  const STOP_MIN_ZOOM = 14.5;

  const visibleRoutes = $derived(
    routes.filter((route) => isDirectionVisible(route.direction, showOutbound, showInbound)),
  );
  const visibleStops = $derived(
    stops.filter((stop) => {
      const ids = new Set(visibleRoutes.map((route) => route.id));
      return stop.routeIds.some((id) => ids.has(id));
    }),
  );
  const visibleVehicles = $derived(
    vehicles.filter((vehicle) => isDirectionVisible(vehicle.direction, showOutbound, showInbound)),
  );
  const lineRouteKey = $derived(
    routes
      .map((route) => route.id)
      .slice()
      .sort()
      .join(','),
  );

  function createMarkerElement(vehicle: VehiclePosition, selected: boolean): HTMLButtonElement {
    const label = vehicle.lineId ?? vehicle.routeId ?? '—';
    const dir = markerDirectionClass(vehicle.direction);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `bus-marker ${dir}${selected ? ' selected' : ''}`;
    button.setAttribute(
      'aria-label',
      `Colectivo ${label} ${directionSpokenLabel(vehicle.direction)} unidad ${vehicle.vehicleId}`,
    );
    const dot = document.createElement('span');
    dot.className = 'bus-dot';
    dot.textContent = label;
    button.append(dot);
    return button;
  }

  function paintMarker(el: HTMLElement, vehicle: VehiclePosition, selected: boolean): void {
    const dir = markerDirectionClass(vehicle.direction);
    el.className = `bus-marker ${dir}${selected ? ' selected' : ''}`;
    el.setAttribute(
      'aria-label',
      `Colectivo ${vehicle.lineId ?? vehicle.routeId ?? '—'} ${directionSpokenLabel(vehicle.direction)} unidad ${vehicle.vehicleId}`,
    );
    const dot = el.querySelector('.bus-dot');
    if (dot) {
      dot.textContent = vehicle.lineId ?? vehicle.routeId ?? '—';
    }
  }

  function upsertAnimated(vehicle: VehiclePosition): AnimatedVehicle {
    const to = displayCoords(vehicle);
    const previous = animated.get(vehicle.vehicleId);
    if (!previous) {
      const created: AnimatedVehicle = {
        vehicleId: vehicle.vehicleId,
        lineId: vehicle.lineId,
        routeId: vehicle.routeId,
        from: to,
        to,
        fromBearing: vehicle.bearing,
        toBearing: vehicle.bearing,
        startedAt: performance.now(),
        durationMs: DURATION_MS,
        observedAt: vehicle.observedAt,
        receivedAt: vehicle.receivedAt,
        source: vehicle.source,
        skipInterpolation: true,
        fromProgress: vehicle.routeProgress,
        toProgress: vehicle.routeProgress,
        matchedRouteId: vehicle.matchedRouteId,
        vehicle,
      };
      animated.set(vehicle.vehicleId, created);
      return created;
    }
    const route = routes.find((item) => item.id === previous.matchedRouteId);
    const from = displayPoint(previous, performance.now(), route);
    const next: AnimatedVehicle = {
      vehicleId: vehicle.vehicleId,
      lineId: vehicle.lineId,
      routeId: vehicle.routeId,
      from,
      to,
      fromBearing: from.bearing,
      toBearing: vehicle.bearing,
      startedAt: performance.now(),
      durationMs: DURATION_MS,
      observedAt: vehicle.observedAt,
      receivedAt: vehicle.receivedAt,
      source: vehicle.source,
      skipInterpolation: true,
      fromProgress: previous.toProgress,
      toProgress: vehicle.routeProgress,
      matchedRouteId: vehicle.matchedRouteId,
      vehicle,
    };
    animated.set(vehicle.vehicleId, next);
    return next;
  }

  function matchDebugGeoJson() {
    if (!debug) {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    const features: Array<{
      type: 'Feature';
      properties: { kind: string; vehicleId: string };
      geometry:
        | { type: 'LineString'; coordinates: [number, number][] }
        | { type: 'Point'; coordinates: [number, number] };
    }> = [];
    for (const vehicle of visibleVehicles) {
      if (vehicle.matchedLatitude === undefined || vehicle.matchedLongitude === undefined) {
        continue;
      }
      features.push({
        type: 'Feature',
        properties: { kind: 'link', vehicleId: vehicle.vehicleId },
        geometry: {
          type: 'LineString',
          coordinates: [
            [vehicle.longitude, vehicle.latitude],
            [vehicle.matchedLongitude, vehicle.matchedLatitude],
          ],
        },
      });
      features.push({
        type: 'Feature',
        properties: { kind: 'matched', vehicleId: vehicle.vehicleId },
        geometry: {
          type: 'Point',
          coordinates: [vehicle.matchedLongitude, vehicle.matchedLatitude],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function syncSources() {
    if (!map || !mapReady) {
      return;
    }
    const routeSource = map.getSource('routes') as import('maplibre-gl').GeoJSONSource | undefined;
    routeSource?.setData(routesToGeoJson(visibleRoutes) as never);
    const stopSource = map.getSource('stops') as import('maplibre-gl').GeoJSONSource | undefined;
    stopSource?.setData(stopsToGeoJson(visibleStops) as never);
    const debugSource = map.getSource('debug-match') as
      import('maplibre-gl').GeoJSONSource | undefined;
    debugSource?.setData(matchDebugGeoJson() as never);
  }

  function createUserMarkerElement(): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'user-marker';
    root.setAttribute('aria-label', 'Tu ubicación');
    const halo = document.createElement('span');
    halo.className = 'user-marker-halo';
    const dot = document.createElement('span');
    dot.className = 'user-marker-dot';
    root.append(halo, dot);
    return root;
  }

  function syncUserMarker() {
    if (!map || !maplibre || !mapReady) {
      return;
    }
    if (!userLocation) {
      userMarker?.remove();
      userMarker = undefined;
      return;
    }
    if (!userMarker) {
      userMarker = new maplibre.Marker({ element: createUserMarkerElement(), anchor: 'center' })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(map);
      return;
    }
    userMarker.setLngLat([userLocation.longitude, userLocation.latitude]);
  }

  function fitRoutes() {
    if (!map || !maplibre || routes.length === 0) {
      return;
    }
    const bounds = new maplibre.LngLatBounds();
    let count = 0;
    for (const route of routes) {
      for (const point of route.path) {
        bounds.extend([point.longitude, point.latitude]);
        count += 1;
      }
    }
    if (count < 2) {
      return;
    }
    map.fitBounds(bounds, {
      padding: 56,
      maxZoom: 14,
      duration: reducedMotion ? 0 : 600,
      pitch: 0,
    });
  }

  function needsAnimationFrame(): boolean {
    if (followVehicleId) {
      return true;
    }
    const now = performance.now();
    for (const item of animated.values()) {
      if (!item.skipInterpolation && now - item.startedAt < item.durationMs) {
        return true;
      }
    }
    return false;
  }

  function scheduleFrame() {
    if (!raf && map && maplibre) {
      raf = requestAnimationFrame(renderFrame);
    }
  }

  function renderFrame() {
    if (!map || !maplibre || document.hidden) {
      raf = 0;
      return;
    }
    const seen = new Set<string>();
    const now = performance.now();
    for (const item of animated.values()) {
      if (!isDirectionVisible(item.vehicle.direction, showOutbound, showInbound)) {
        continue;
      }
      seen.add(item.vehicleId);
      const route = routes.find((candidate) => candidate.id === item.matchedRouteId);
      const point = displayPoint(item, now, route);
      let marker = markers.get(item.vehicleId);
      const selected = item.vehicleId === selectedVehicleId;
      if (!marker) {
        const vehicleId = item.vehicleId;
        const node = createMarkerElement(item.vehicle, selected);
        node.addEventListener('click', (event) => {
          event.stopPropagation();
          const current = animated.get(vehicleId);
          onSelectVehicle?.(current?.vehicle ?? item.vehicle);
        });
        marker = new maplibre.Marker({ element: node, anchor: 'center' })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);
        markers.set(item.vehicleId, marker);
      }
      marker.setLngLat([point.longitude, point.latitude]);
      const el = marker.getElement();
      paintMarker(el, item.vehicle, selected);
      if (followVehicleId === item.vehicleId) {
        if (reducedMotion) {
          map.jumpTo({ center: [point.longitude, point.latitude], pitch: 0 });
        } else {
          map.setCenter([point.longitude, point.latitude]);
        }
      }
    }
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
        animated.delete(id);
      }
    }
    raf = needsAnimationFrame() ? requestAnimationFrame(renderFrame) : 0;
  }

  $effect(() => {
    for (const vehicle of visibleVehicles) {
      upsertAnimated(vehicle);
    }
    const incoming = new Set(visibleVehicles.map((vehicle) => vehicle.vehicleId));
    for (const id of [...animated.keys()]) {
      if (!incoming.has(id)) {
        animated.delete(id);
      }
    }
    scheduleFrame();
  });

  $effect(() => {
    void visibleRoutes;
    void visibleStops;
    void visibleVehicles;
    void debug;
    syncSources();
  });

  $effect(() => {
    void userLocation;
    void mapReady;
    syncUserMarker();
  });

  $effect(() => {
    if (!mapReady || lineRouteKey === lastFittedLine || routes.length === 0) {
      return;
    }
    lastFittedLine = lineRouteKey;
    fitRoutes();
  });

  onMount(async () => {
    try {
      maplibre = await import('maplibre-gl');
      if (!container || destroyed) {
        return;
      }
      map = new maplibre.Map({
        container,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [BAHIA_BLANCA_CENTER.longitude, BAHIA_BLANCA_CENTER.latitude],
        zoom: 13,
        pitch: 0,
        maxPitch: 0,
        bearing: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
        fadeDuration: reducedMotion ? 0 : 300,
      });
      map.on('error', (event) => {
        if (import.meta.env.DEV) {
          console.debug('map recoverable error', event.error?.message ?? event);
        }
      });
      map.on('load', () => {
        if (!map) {
          return;
        }
        const routeArrow = createRouteArrowImage();
        const stopIcon = createStopIconImage();
        if (routeArrow && !map.hasImage('route-arrow')) {
          map.addImage('route-arrow', routeArrow, { pixelRatio: 2 });
        }
        if (stopIcon && !map.hasImage('bus-stop')) {
          map.addImage('bus-stop', stopIcon, { pixelRatio: 2 });
        }
        map.addSource('routes', { type: 'geojson', data: routesToGeoJson([]) as never });
        map.addSource('stops', { type: 'geojson', data: stopsToGeoJson([]) as never });
        map.addSource('debug-match', { type: 'geojson', data: matchDebugGeoJson() as never });
        map.addLayer({
          id: 'routes-outbound',
          type: 'line',
          source: 'routes',
          filter: ['==', ['get', 'direction'], 'outbound'],
          paint: {
            'line-color': COLOR_OUTBOUND,
            'line-width': 5,
            'line-opacity': 0.95,
          },
        });
        map.addLayer({
          id: 'routes-inbound',
          type: 'line',
          source: 'routes',
          filter: ['==', ['get', 'direction'], 'inbound'],
          paint: {
            'line-color': COLOR_INBOUND,
            'line-width': 5,
            'line-opacity': 0.95,
          },
        });
        if (map.hasImage('route-arrow')) {
          map.addLayer({
            id: 'routes-outbound-arrows',
            type: 'symbol',
            source: 'routes',
            filter: ['==', ['get', 'direction'], 'outbound'],
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 70,
              'icon-image': 'route-arrow',
              'icon-size': 0.9,
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
          map.addLayer({
            id: 'routes-inbound-arrows',
            type: 'symbol',
            source: 'routes',
            filter: ['==', ['get', 'direction'], 'inbound'],
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 70,
              'icon-image': 'route-arrow',
              'icon-size': 0.9,
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
        }
        const stopLayer = map.hasImage('bus-stop') ? 'stops-icon' : 'stops-circle';
        if (stopLayer === 'stops-icon') {
          map.addLayer({
            id: 'stops-icon',
            type: 'symbol',
            source: 'stops',
            minzoom: STOP_MIN_ZOOM,
            layout: {
              'icon-image': 'bus-stop',
              'icon-size': 0.7,
              'icon-allow-overlap': false,
              'icon-ignore-placement': true,
            },
          });
        } else {
          map.addLayer({
            id: 'stops-circle',
            type: 'circle',
            source: 'stops',
            minzoom: STOP_MIN_ZOOM,
            paint: {
              'circle-radius': 3.5,
              'circle-color': '#e8ebef',
              'circle-stroke-color': '#6b7280',
              'circle-stroke-width': 1,
              'circle-opacity': 0.85,
            },
          });
        }
        map.addLayer({
          id: 'debug-match-lines',
          type: 'line',
          source: 'debug-match',
          filter: ['==', ['get', 'kind'], 'link'],
          paint: {
            'line-color': '#7c3aed',
            'line-width': 1.5,
            'line-opacity': 0.75,
          },
        });
        map.addLayer({
          id: 'debug-match-points',
          type: 'circle',
          source: 'debug-match',
          filter: ['==', ['get', 'kind'], 'matched'],
          paint: {
            'circle-radius': 4,
            'circle-color': '#7c3aed',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        });
        map.on('click', stopLayer, (event) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          const stop = stops.find((item) => item.id === id) ?? null;
          onSelectStop?.(stop);
        });
        map.on('click', (event) => {
          const hits = map?.queryRenderedFeatures(event.point, { layers: [stopLayer] });
          if (!hits?.length) {
            onSelectStop?.(null);
          }
        });
        map.on('dragstart', (event) => {
          if (event.originalEvent) {
            onUserPan?.();
          }
        });
        // originalEvent is only present on user gestures, so our own easeTo/fitBounds
        // camera moves do not cancel follow mode.
        map.on('zoomstart', (event) => {
          if (event.originalEvent) {
            onUserPan?.();
          }
        });
        mapReady = true;
        mapFailed = false;
        syncSources();
        syncUserMarker();
      });
      mapControls = {
        zoomIn: () => map?.zoomIn({ duration: reducedMotion ? 0 : 250 }),
        zoomOut: () => map?.zoomOut({ duration: reducedMotion ? 0 : 250 }),
        flyTo: (longitude: number, latitude: number) => {
          map?.easeTo({
            center: [longitude, latitude],
            zoom: Math.max(map.getZoom(), 14),
            pitch: 0,
            duration: reducedMotion ? 0 : 500,
          });
        },
        fitLine: () => fitRoutes(),
      };
      scheduleFrame();
    } catch {
      mapFailed = true;
    }
  });

  onDestroy(() => {
    destroyed = true;
    mapControls = null;
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(raf);
    }
    for (const marker of markers.values()) {
      marker.remove();
    }
    markers.clear();
    userMarker?.remove();
    userMarker = undefined;
    map?.remove();
  });
</script>

<div class="map-wrap">
  <div class="map" bind:this={container} role="application" aria-label="Mapa de colectivos"></div>
  {#if debug}
    <div class="debug-float">
      <div>{vehicles.length} GPS · {routes.length} recorridos · {stops.length} paradas</div>
      {#each visibleVehicles as vehicle (vehicle.vehicleId)}
        <div>
          {vehicle.vehicleId}
          raw {vehicle.latitude.toFixed(5)},{vehicle.longitude.toFixed(5)}
          obs {vehicle.observedAt}
          age {Math.round((Date.now() - Date.parse(vehicle.observedAt)) / 1000)}s dir {vehicle.direction ??
            '—'}
          matched {vehicle.matchedLatitude?.toFixed(5) ?? '—'},{vehicle.matchedLongitude?.toFixed(
            5,
          ) ?? '—'}
          dist {vehicle.distanceFromRouteMeters ?? '—'}
          {vehicle.positionKind ?? 'gps'}
        </div>
      {/each}
    </div>
  {/if}
</div>
