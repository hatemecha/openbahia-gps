<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { isInBahiaBlancaIngest } from '@openbahia/transit-core';
  import Eye from 'lucide-svelte/icons/eye';
  import EyeOff from 'lucide-svelte/icons/eye-off';
  import Locate from 'lucide-svelte/icons/locate';
  import ZoomIn from 'lucide-svelte/icons/zoom-in';
  import ZoomOut from 'lucide-svelte/icons/zoom-out';
  import TransitMap from '$lib/components/TransitMap.svelte';
  import { fetchLines, fetchRoutes, fetchStops, fetchVehicles, realtimeUrl } from '$lib/api';
  import { COPY, routeMatchLabel } from '$lib/copy';
  import { isDirectionVisible } from '$lib/direction-visibility';
  import {
    directionCaption,
    formatAge,
    formatMeters,
    statusCaption,
    vehicleHeading,
  } from '$lib/format';
  import { requestClientLocation } from '$lib/location';
  import { loadPrefs, savePrefs } from '$lib/prefs';
  import { connectRealtime } from '$lib/realtime';
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
  let previousLineId = $state<string | null>(null);
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
  let loadingSince = $state<number | null>(null);
  let loadFailed = $state(false);
  let online = $state(true);
  let reducedMotion = $state(false);
  let panel: HTMLDialogElement | undefined = $state();
  let lastFocused: HTMLElement | null = null;
  let askedLocation = false;

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

  function applyPayload(payload: { data: VehiclePosition[]; meta: VehiclesMeta }) {
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

  async function loadStatic(selectedLine: string) {
    try {
      const [routeRes, stopRes] = await Promise.all([
        fetchRoutes(selectedLine),
        fetchStops(selectedLine),
      ]);
      routes = routeRes.data;
      stops = stopRes.data;
    } catch {
      routes = routes.filter((route) => route.lineId === selectedLine);
      stops = stops;
    }
  }

  async function pollOnce(selectedLine: string) {
    try {
      applyPayload(await fetchVehicles(selectedLine));
    } catch {
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
    previousLineId = lineId;
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

  function flyIfInCity(longitude: number, latitude: number): boolean {
    if (!isInBahiaBlancaIngest({ latitude, longitude })) {
      return false;
    }
    mapControls?.flyTo(longitude, latitude);
    return true;
  }

  async function locateMe() {
    locationNote = COPY.location_why;
    const result = await requestClientLocation();
    if (result.ok && flyIfInCity(result.longitude, result.latitude)) {
      locationNote = null;
      return;
    }
    if (result.ok) {
      locationNote = COPY.location_unavailable;
      return;
    }
    locationNote = result.reason === 'denied' ? COPY.location_denied : COPY.location_unavailable;
  }

  async function locateOnLoad() {
    const result = await requestClientLocation();
    if (result.ok) {
      flyIfInCity(result.longitude, result.latitude);
    }
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
    void loadLines().then(() => {
      ready = true;
    });
    return () => {
      clearInterval(clockTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  });

  $effect(() => {
    if (!browser || !ready) {
      return;
    }
    savePrefs({ lineId, showOutbound, showInbound });
  });

  $effect(() => {
    if (!browser || !mapControls || askedLocation) {
      return;
    }
    askedLocation = true;
    void locateOnLoad();
  });

  $effect(() => {
    if (!browser || !ready) {
      return;
    }
    const selectedLine = lineId;
    void loadStatic(selectedLine);
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
    return connectRealtime(
      realtimeUrl(selectedLine),
      () => fetchVehicles(selectedLine),
      {
        onPayload: applyPayload,
        onStatus: (kind) => {
          if (kind === 'error' && vehicles.length === 0) {
            loadFailed = Date.now() - (loadingSince ?? Date.now()) > 20_000;
          }
        },
      },
      { hidden: () => document.hidden },
    );
  });

  onDestroy(() => {
    ready = false;
  });
</script>

<a class="skip-link" href="#contenido">{COPY.skip_to_map}</a>

<div class="app">
  <header class="topbar">
    <div class="brand">
      <h1>OpenBahía</h1>
      <p>Colectivos de Bahía Blanca</p>
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
              {#if showOutbound}
                <Eye size={18} strokeWidth={2.25} aria-hidden="true" />
              {:else}
                <EyeOff size={18} strokeWidth={2.25} aria-hidden="true" />
              {/if}
              <span class="swatch outbound" aria-hidden="true"></span>
              {COPY.view_ida}
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
              {#if showInbound}
                <Eye size={18} strokeWidth={2.25} aria-hidden="true" />
              {:else}
                <EyeOff size={18} strokeWidth={2.25} aria-hidden="true" />
              {/if}
              <span class="swatch inbound" aria-hidden="true"></span>
              {COPY.view_vuelta}
            </button>
          {/if}
        </div>
        {#if previousLineId}
          <button
            class="touch-btn"
            type="button"
            onclick={() => chooseLine(previousLineId ?? lineId)}
          >
            {COPY.back_line(previousLineId)}
          </button>
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
        type="button"
        aria-label={COPY.my_location}
        onclick={() => void locateMe()}
      >
        <Locate size={22} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {#if followPaused && follow}
        <button class="touch-btn" type="button" onclick={() => (followPaused = false)}
          >{COPY.resume_follow}</button
        >
      {/if}
    </div>
  </main>

  {#if locationNote}
    <p class="banner" role="status">{locationNote}</p>
  {/if}

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
          <dt>GPS</dt>
          <dd>{selectedLive.latitude.toFixed(5)}, {selectedLive.longitude.toFixed(5)}</dd>
        </div>
        <div>
          <dt>Match</dt>
          <dd>
            {selectedLive.routeAssignmentSource ?? '—'} · {selectedLive.distanceFromRouteMeters ??
              '—'} m ·
            {Math.round((selectedLive.routeConfidence ?? 0) * 100)}% · {selectedLive.positionKind}
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
