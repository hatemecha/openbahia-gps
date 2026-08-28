<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { isInBahiaBlancaIngest } from '@openbahia/transit-core';
  import Locate from 'lucide-svelte/icons/locate';
  import LocateFixed from 'lucide-svelte/icons/locate-fixed';
  import ZoomIn from 'lucide-svelte/icons/zoom-in';
  import ZoomOut from 'lucide-svelte/icons/zoom-out';
  import TransitMap from '$lib/components/TransitMap.svelte';
  import { fetchLines, fetchVehicles, realtimeUrl } from '$lib/api';
  import { COPY, routeMatchLabel } from '$lib/copy';
  import { isDirectionVisible } from '$lib/direction-visibility';
  import {
    directionCaption,
    formatAge,
    formatMeters,
    statusCaption,
    vehicleHeading,
  } from '$lib/format';
  import {
    createLocationWatch,
    isNavigationReadyLocation,
    type ClientLocation,
  } from '$lib/location';
  import { loadPrefs, savePrefs } from '$lib/prefs';
  import { connectRealtime } from '$lib/realtime';
  import { createLineSession } from '$lib/state/line-session';
  import type {
    ConnectionState,
    MapControls,
    TransitLine,
    TransitRoute,
    TransitStop,
    VehiclePosition,
    VehiclesMeta,
  } from '$lib/types';

  let lines = $state<TransitLine[]>([]);
  let vehicles = $state<VehiclePosition[]>([]);
  let routes = $state<TransitRoute[]>([]);
  let stops = $state<TransitStop[]>([]);
  let lineId = $state('503');
  let meta = $state<VehiclesMeta | null>(null);
  let now = $state(Date.now());
  let debug = $state(false);
  let ready = $state(false);
  let showOutbound = $state(true);
  let showInbound = $state(true);
  let selected = $state<VehiclePosition | null>(null);
  let selectedStop = $state<TransitStop | null>(null);
  let follow = $state(false);
  let followPaused = $state(false);
  let mapFailed = $state(false);
  let mapControls = $state<MapControls | null>(null);
  let locationNote = $state<string | null>(null);
  let locationActive = $state(false);
  let userLocation = $state<ClientLocation | null>(null);
  let locationCentered = $state(false);
  let locationAutoCenterAllowed = $state(true);
  let locationCenteredAccuracy = $state(Number.POSITIVE_INFINITY);
  let locationErrorShown = $state(false);
  let locationWatch = $state<ReturnType<typeof createLocationWatch> | null>(null);
  let loadingSince = $state<number | null>(null);
  let loadFailed = $state(false);
  let online = $state(true);
  let reducedMotion = $state(false);
  let panel: HTMLDialogElement | undefined = $state();
  let lastFocused: HTMLElement | null = null;
  let stopsUnavailable = $state(false);
  let realtimeGeneration = $state(0);

  const lineSession = createLineSession();

  const feedState: ConnectionState = $derived(meta?.connectionState ?? 'unavailable');
  const realtimeState = $derived(meta?.realtimeState);
  const newest = $derived(
    vehicles.reduce((latest, vehicle) => {
      if (!latest || vehicle.observedAt > latest) {
        return vehicle.observedAt;
      }
      return latest;
    }, ''),
  );
  const visibleVehicles = $derived(
    vehicles.filter((vehicle) => isDirectionVisible(vehicle.direction, showOutbound, showInbound)),
  );
  const lineName = $derived(lines.find((line) => line.id === lineId)?.name ?? lineId);
  const outboundRoutes = $derived(routes.filter((route) => route.direction === 'outbound'));
  const inboundRoutes = $derived(routes.filter((route) => route.direction === 'inbound'));
  const selectedLive = $derived(
    selected
      ? (vehicles.find((vehicle) => vehicle.vehicleId === selected?.vehicleId) ?? selected)
      : null,
  );
  const followId = $derived(
    follow && !followPaused && selectedLive ? selectedLive.vehicleId : null,
  );
  const loadingSlow = $derived(
    loadingSince !== null && now - loadingSince > 8_000 && vehicles.length === 0 && !loadFailed,
  );
  const liveStatus = $derived(statusCaption(realtimeState, feedState));
  const persistentMessage = $derived.by(() => {
    if (!online) {
      return COPY.offline;
    }
    if (loadFailed && vehicles.length === 0) {
      return COPY.failed_update;
    }
    if (loadingSlow) {
      return COPY.slow;
    }
    if (realtimeState === 'no_vehicles') {
      return COPY.no_vehicles;
    }
    if (realtimeState === 'upstream_unavailable' && vehicles.length === 0) {
      return COPY.upstream_unavailable;
    }
    if (realtimeState === 'very_stale' && newest) {
      return COPY.very_stale(formatAge(newest, now));
    }
    if ((realtimeState === 'delayed' || feedState === 'delayed') && newest) {
      return COPY.stale(formatAge(newest, now));
    }
    if (routes.length === 0 && ready) {
      return COPY.no_routes;
    }
    return null;
  });
  const matchNote = $derived(routeMatchLabel(selectedLive?.routeMatchState));

  function applyPayload(payload: { data: VehiclePosition[]; meta: VehiclesMeta }, gen: number) {
    if (!lineSession.isRealtimeGeneration(gen)) {
      return;
    }
    vehicles = payload.data;
    meta = payload.meta;
    loadingSince = null;
    loadFailed = false;
    if (selected) {
      selected =
        payload.data.find((vehicle) => vehicle.vehicleId === selected?.vehicleId) ?? selected;
    }
  }

  async function loadLines() {
    try {
      const response = await fetchLines();
      if (response.data.length) {
        lines = response.data;
        if (!lines.some((line) => line.id === lineId)) {
          lineId = lines[0]?.id ?? '503';
        }
      }
    } catch {
      lines = [{ id: '503', name: '503' }];
    }
  }

  async function pollOnce(selectedLine: string) {
    const gen = realtimeGeneration;
    try {
      applyPayload(await fetchVehicles(selectedLine), gen);
    } catch {
      if (!lineSession.isRealtimeGeneration(gen)) {
        return;
      }
      loadFailed = vehicles.length === 0;
      meta = {
        provider: meta?.provider ?? 'unknown',
        count: vehicles.length,
        generatedAt: new Date().toISOString(),
        stale: true,
        freshness: 'very_stale',
        connectionState: meta?.provider === 'mock' ? 'demo' : 'unavailable',
        available: false,
        lastSuccessfulUpdate: meta?.lastSuccessfulUpdate ?? null,
        reason: COPY.upstream_unavailable,
        realtimeState: vehicles.length ? 'delayed' : 'upstream_unavailable',
      };
    }
  }

  function chooseLine(next: string) {
    if (next === lineId) {
      return;
    }
    lineId = next;
  }

  function openVehicle(vehicle: VehiclePosition, from?: HTMLElement) {
    lastFocused =
      from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    selected = vehicle;
    selectedStop = null;
    followPaused = false;
    panel?.showModal();
  }

  function closePanel() {
    selected = null;
    selectedStop = null;
    follow = false;
    followPaused = false;
    panel?.close();
    lastFocused?.focus();
  }

  function flyIfInCity(location: ClientLocation): boolean {
    const { longitude, latitude, accuracy } = location;
    const controls = mapControls;
    if (!controls || !isInBahiaBlancaIngest({ latitude, longitude })) {
      return false;
    }
    controls.flyTo(longitude, latitude, accuracy);
    return true;
  }

  function showLocation(location: ClientLocation, note: string | null) {
    userLocation = location;
    locationActive = true;
    locationNote = note;
    const accuracy = location.accuracy ?? Number.POSITIVE_INFINITY;
    const substantiallyBetter = accuracy < locationCenteredAccuracy / 2;
    if (
      locationAutoCenterAllowed &&
      (!locationCentered || substantiallyBetter) &&
      flyIfInCity(location)
    ) {
      locationCentered = true;
      locationCenteredAccuracy = accuracy;
    }
  }

  function toggleLocation() {
    const watch = locationWatch;
    if (!watch) {
      return;
    }
    if (locationActive || watch.isActive()) {
      watch.stop();
      locationActive = false;
      userLocation = null;
      locationCentered = false;
      locationAutoCenterAllowed = true;
      locationCenteredAccuracy = Number.POSITIVE_INFINITY;
      locationNote = null;
      return;
    }
    locationNote = COPY.location_searching;
    locationCentered = false;
    locationAutoCenterAllowed = true;
    locationCenteredAccuracy = Number.POSITIVE_INFINITY;
    locationActive = true;
    locationErrorShown = false;
    watch.start();
  }

  onMount(() => {
    debug = new URLSearchParams(window.location.search).has('debug');
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    online = navigator.onLine;
    const prefs = loadPrefs();
    if (prefs.lineId) {
      lineId = prefs.lineId;
    }
    if (prefs.showOutbound === false) {
      showOutbound = false;
    }
    if (prefs.showInbound === false) {
      showInbound = false;
    }
    const clockTimer = setInterval(() => {
      now = Date.now();
    }, 1000);
    const onOnline = () => {
      online = true;
    };
    const onOffline = () => {
      online = false;
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    locationWatch = createLocationWatch({
      onFix(location) {
        const accuracy = location.accuracy;
        const note =
          accuracy === undefined
            ? COPY.location_unknown_accuracy
            : isNavigationReadyLocation(location)
              ? COPY.location_precise(Math.round(accuracy))
              : COPY.location_refining(Math.round(accuracy));
        showLocation(location, note);
      },
      onImprecise(location) {
        showLocation(location, COPY.location_imprecise(Math.round(location.accuracy ?? 0)));
      },
      onError(reason) {
        locationActive = false;
        userLocation = null;
        locationCentered = false;
        locationAutoCenterAllowed = true;
        locationCenteredAccuracy = Number.POSITIVE_INFINITY;
        if (!locationErrorShown) {
          locationErrorShown = true;
          locationNote = reason === 'denied' ? COPY.location_denied : COPY.location_unavailable;
        }
      },
    });
    void loadLines().then(() => {
      ready = true;
    });
    return () => {
      clearInterval(clockTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      locationWatch?.stop();
    };
  });

  $effect(() => {
    if (!browser || !ready) {
      return;
    }
    savePrefs({ lineId, showOutbound, showInbound });
  });

  $effect(() => {
    const location = userLocation;
    if (
      !mapControls ||
      !location ||
      !locationActive ||
      locationCentered ||
      !locationAutoCenterAllowed
    ) {
      return;
    }
    if (flyIfInCity(location)) {
      locationCentered = true;
      locationCenteredAccuracy = location.accuracy ?? Number.POSITIVE_INFINITY;
    }
  });

  $effect(() => {
    if (!browser || !ready) {
      return;
    }
    const selectedLine = lineId;
    routes = [];
    stops = [];
    stopsUnavailable = false;
    void lineSession.loadStatic(selectedLine, (state) => {
      routes = state.routes;
      stops = state.stops;
      stopsUnavailable = state.stopsUnavailable;
    });
  });

  $effect(() => {
    if (!browser || !ready) {
      return;
    }
    const selectedLine = lineId;
    selected = null;
    selectedStop = null;
    follow = false;
    followPaused = false;
    panel?.close();
    loadingSince = Date.now();
    loadFailed = false;
    vehicles = [];
    meta = null;
    lineSession.resetRealtime(
      (gen) =>
        connectRealtime(
          realtimeUrl(selectedLine),
          () => fetchVehicles(selectedLine),
          {
            onPayload: (payload) => applyPayload(payload, gen),
            onStatus: (kind) => {
              if (!lineSession.isRealtimeGeneration(gen)) {
                return;
              }
              if (kind === 'error' && vehicles.length === 0) {
                loadFailed = Date.now() - (loadingSince ?? Date.now()) > 20_000;
              }
            },
          },
          { hidden: () => document.hidden },
        ),
      (gen) => {
        realtimeGeneration = gen;
      },
    );
  });

  onDestroy(() => {
    ready = false;
    locationWatch?.stop();
    lineSession.destroy();
  });
</script>

<a class="skip-link" href="#contenido">{COPY.skip_to_map}</a>

<div class="app">
  <header class="topbar">
    <div class="brand">
      <h1>OpenBahía</h1>
      <p>
        Colectivos de Bahía Blanca ·
        <a href="https://github.com/hatemecha/openbahia-gps" target="_blank" rel="noreferrer"
          >Código fuente</a
        >
      </p>
    </div>
    <div class="controls">
      <label class="line-select" for="line-select">
        {COPY.choose_line}
        <select
          id="line-select"
          value={lineId}
          onchange={(event) => chooseLine((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each lines as line (line.id)}
            <option value={line.id}>{line.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <p class="visually-hidden" aria-live="polite" aria-atomic="true">
      {liveStatus}. {visibleVehicles.length} colectivos. {newest
        ? formatAge(newest, now)
        : COPY.starting}
    </p>
  </header>

  {#if persistentMessage}
    <p class="banner" class:error={loadFailed || !online} role="status">{persistentMessage}</p>
  {/if}

  <main id="contenido" class="workspace">
    {#if mapFailed}
      <div class="map-fallback">
        <p>{COPY.map_unavailable}</p>
        <button class="touch-btn" type="button" onclick={() => location.reload()}
          >{COPY.reload_map}</button
        >
      </div>
    {:else}
      <svelte:boundary
        onerror={() => {
          mapFailed = true;
        }}
      >
        <TransitMap
          {vehicles}
          {routes}
          {stops}
          {debug}
          {showOutbound}
          {showInbound}
          {reducedMotion}
          {userLocation}
          bind:mapFailed
          bind:mapControls
          selectedVehicleId={selectedLive?.vehicleId ?? null}
          followVehicleId={followId}
          onSelectVehicle={(vehicle) => {
            if (vehicle) {
              openVehicle(vehicle);
            }
          }}
          onSelectStop={(stop) => {
            selectedStop = stop;
            selected = null;
            follow = false;
            if (stop) {
              panel?.showModal();
            }
          }}
          onUserPan={() => {
            if (locationActive) {
              locationAutoCenterAllowed = false;
            }
            if (follow) {
              followPaused = true;
            }
          }}
        />
        {#snippet failed()}
          <div class="map-fallback">
            <p>{COPY.map_unavailable}</p>
          </div>
        {/snippet}
      </svelte:boundary>
    {/if}

    <div class="overlay">
      <section class="legend-card" aria-label="Recorrido">
        <strong>{lineName}</strong>
        <div class="direction-toggles" role="group" aria-label="Sentidos visibles">
          {#if outboundRoutes.length}
            <button
              type="button"
              class="direction-toggle outbound"
              class:on={showOutbound}
              aria-pressed={showOutbound}
              onclick={() => (showOutbound = !showOutbound)}
            >
              <span class="swatch outbound" aria-hidden="true"></span>
              {COPY.ida}
            </button>
          {/if}
          {#if inboundRoutes.length}
            <button
              type="button"
              class="direction-toggle inbound"
              class:on={showInbound}
              aria-pressed={showInbound}
              onclick={() => (showInbound = !showInbound)}
            >
              <span class="swatch inbound" aria-hidden="true"></span>
              {COPY.vuelta}
            </button>
          {/if}
        </div>
        {#if stopsUnavailable && routes.length > 0}
          <p class="hint">{COPY.stops_unavailable}</p>
        {/if}
        {#if mapFailed}
          {#if visibleVehicles.length === 0}
            <p class="empty">{COPY.no_vehicles}</p>
          {:else}
            <ul class="vehicle-list">
              {#each visibleVehicles as vehicle (vehicle.vehicleId)}
                <li>
                  <button
                    type="button"
                    onclick={(event) => openVehicle(vehicle, event.currentTarget)}
                  >
                    {vehicleHeading(vehicle)} · {vehicle.vehicleId} · {formatAge(
                      vehicle.observedAt,
                      now,
                    )}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </section>
    </div>

    <div class="map-tools">
      <button
        class="icon-tool"
        type="button"
        aria-label={COPY.zoom_in}
        onclick={() => mapControls?.zoomIn()}
      >
        <ZoomIn size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <button
        class="icon-tool"
        type="button"
        aria-label={COPY.zoom_out}
        onclick={() => mapControls?.zoomOut()}
      >
        <ZoomOut size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <button
        class="icon-tool"
        class:on={locationActive}
        type="button"
        aria-pressed={locationActive}
        aria-label={locationActive ? COPY.hide_my_location : COPY.my_location}
        onclick={() => toggleLocation()}
      >
        {#if locationActive}
          <LocateFixed size={22} strokeWidth={2.25} aria-hidden="true" />
        {:else}
          <Locate size={22} strokeWidth={2.25} aria-hidden="true" />
        {/if}
      </button>
      {#if followPaused && follow}
        <button class="touch-btn" type="button" onclick={() => (followPaused = false)}
          >{COPY.resume_follow}</button
        >
      {/if}
    </div>
    {#if locationNote}
      <p class="location-status" role="status">{locationNote}</p>
    {/if}
  </main>

  {#if loadFailed && vehicles.length === 0}
    <p class="banner error">
      <button class="touch-btn" type="button" onclick={() => void pollOnce(lineId)}
        >{COPY.retry}</button
      >
    </p>
  {/if}
</div>

<dialog
  class="sheet"
  bind:this={panel}
  aria-labelledby="sheet-title"
  onclose={() => {
    selected = null;
    selectedStop = null;
    follow = false;
    followPaused = false;
  }}
>
  {#if selectedLive}
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">{vehicleHeading(selectedLive)}</h2>
        <p>{COPY.unit} {selectedLive.vehicleId}</p>
      </div>
      <button class="icon-btn" type="button" onclick={closePanel}>{COPY.close}</button>
    </div>
    <dl>
      <div>
        <dt>{COPY.direction}</dt>
        <dd>{directionCaption(selectedLive.direction)}</dd>
      </div>
      <div>
        <dt>{COPY.updated}</dt>
        <dd>{formatAge(selectedLive.observedAt, now)}</dd>
      </div>
      <div>
        <dt>{COPY.next_stop}</dt>
        <dd>
          {#if selectedLive.routeMatchState === 'off-route' || selectedLive.routeMatchState === 'uncertain'}
            {matchNote}
          {:else if selectedLive.nextStop?.name}
            {selectedLive.nextStop.name} · {formatMeters(selectedLive.nextStop.distanceMeters)}
          {:else if selectedLive.nextStop}
            {formatMeters(selectedLive.nextStop.distanceMeters)}
          {:else}
            {COPY.undetermined_stop}
          {/if}
        </dd>
      </div>
      {#if matchNote && selectedLive.routeMatchState === 'off-route'}
        <div>
          <dt>Recorrido</dt>
          <dd>{matchNote}</dd>
        </div>
      {/if}
      {#if debug}
        <div>
          <dt>GPS raw</dt>
          <dd>{selectedLive.latitude.toFixed(5)}, {selectedLive.longitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>observedAt</dt>
          <dd>{selectedLive.observedAt}</dd>
        </div>
        <div>
          <dt>age</dt>
          <dd>{Math.round((now - Date.parse(selectedLive.observedAt)) / 1000)} s</dd>
        </div>
        <div>
          <dt>Match</dt>
          <dd>
            {selectedLive.matchedLatitude?.toFixed(5) ?? '—'}, {selectedLive.matchedLongitude?.toFixed(
              5,
            ) ?? '—'}
            · {selectedLive.distanceFromRouteMeters ?? '—'} m · {selectedLive.positionKind}
          </dd>
        </div>
      {/if}
    </dl>
    <button
      class="follow-btn"
      class:active={follow && !followPaused}
      type="button"
      onclick={() => {
        follow = !follow;
        followPaused = false;
      }}
    >
      {follow && !followPaused ? COPY.unfollow : COPY.follow}
    </button>
  {:else if selectedStop}
    <div class="sheet-head">
      <div>
        <h2 id="sheet-title">Parada</h2>
        <p>{selectedStop.name ?? (debug ? selectedStop.id : 'Sin nombre publicado')}</p>
      </div>
      <button class="icon-btn" type="button" onclick={closePanel}>{COPY.close}</button>
    </div>
  {/if}
</dialog>
