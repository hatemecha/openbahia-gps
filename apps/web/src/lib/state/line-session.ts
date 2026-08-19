import type { TransitRoute, TransitStop, VehiclesMeta, VehiclePosition } from '$lib/types';
import { fetchRoutes, fetchStops } from '$lib/api';

export interface LineStaticState {
  routes: TransitRoute[];
  stops: TransitStop[];
  stopsUnavailable: boolean;
}

export interface LineRealtimeState {
  vehicles: VehiclePosition[];
  meta: VehiclesMeta | null;
  loadFailed: boolean;
  loadingSince: number | null;
}

export function createLineSession() {
  let staticGeneration = 0;
  let staticController: AbortController | null = null;
  let realtimeGeneration = 0;
  let realtimeCleanup: (() => void) | null = null;

  async function loadStatic(
    lineId: string,
    apply: (state: LineStaticState) => void,
  ): Promise<void> {
    const generation = ++staticGeneration;
    staticController?.abort();
    staticController = new AbortController();
    const signal = staticController.signal;

    const [routeResult, stopResult] = await Promise.allSettled([
      fetchRoutes(lineId, signal),
      fetchStops(lineId, signal),
    ]);

    if (generation !== staticGeneration || signal.aborted) {
      return;
    }

    const routes = routeResult.status === 'fulfilled' ? routeResult.value.data : [];
    const stops = stopResult.status === 'fulfilled' ? stopResult.value.data : [];
    const stopsUnavailable = stopResult.status === 'rejected';

    apply({ routes, stops, stopsUnavailable });
  }

  function resetRealtime(
    connect: (generation: number) => () => void,
    onGeneration?: (gen: number) => void,
  ): void {
    realtimeCleanup?.();
    realtimeCleanup = null;
    const generation = ++realtimeGeneration;
    onGeneration?.(generation);
    realtimeCleanup = connect(generation);
  }

  function invalidateRealtime(): void {
    realtimeGeneration += 1;
    realtimeCleanup?.();
    realtimeCleanup = null;
  }

  function isRealtimeGeneration(current: number): boolean {
    return current === realtimeGeneration;
  }

  function destroy(): void {
    staticGeneration += 1;
    staticController?.abort();
    invalidateRealtime();
  }

  return {
    loadStatic,
    resetRealtime,
    invalidateRealtime,
    isRealtimeGeneration,
    destroy,
  };
}

export type LineSession = ReturnType<typeof createLineSession>;
