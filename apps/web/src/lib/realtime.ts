import type { VehiclesResponse } from './types';

export interface RealtimeHandlers {
  onPayload: (payload: VehiclesResponse) => void;
  onStatus?: (kind: 'sse' | 'poll' | 'error') => void;
}

function isVehiclesResponse(value: unknown): value is VehiclesResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.data) && record.meta !== null && typeof record.meta === 'object';
}

export function connectRealtime(
  url: string,
  poll: () => Promise<VehiclesResponse>,
  handlers: RealtimeHandlers,
  options?: { hidden?: () => boolean },
): () => void {
  let eventSource: EventSource | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;
  let generation = 0;

  const clearTimers = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = undefined;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const deliver = (payload: VehiclesResponse) => {
    if (stopped) {
      return;
    }
    handlers.onPayload(payload);
  };

  const pollOnce = () => {
    const gen = generation;
    void poll()
      .then((payload) => {
        if (stopped || gen !== generation) {
          return;
        }
        deliver(payload);
        handlers.onStatus?.('poll');
      })
      .catch(() => {
        if (stopped || gen !== generation) {
          return;
        }
        handlers.onStatus?.('error');
      });
  };

  const connect = () => {
    if (stopped) {
      return;
    }
    const gen = generation;
    eventSource?.close();
    try {
      eventSource = new EventSource(url);
      eventSource.addEventListener('vehicles', (event) => {
        if (stopped || gen !== generation) {
          return;
        }
        try {
          const parsed = JSON.parse(String(event.data)) as unknown;
          if (!isVehiclesResponse(parsed)) {
            handlers.onStatus?.('error');
            return;
          }
          attempt = 0;
          deliver(parsed);
          handlers.onStatus?.('sse');
        } catch {
          handlers.onStatus?.('error');
        }
      });
      eventSource.onerror = () => {
        if (stopped || gen !== generation) {
          return;
        }
        eventSource?.close();
        eventSource = undefined;
        handlers.onStatus?.('error');
        pollOnce();
        const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    } catch {
      pollOnce();
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      attempt += 1;
      pollTimer = setTimeout(() => {
        pollOnce();
        connect();
      }, delay);
    }
  };

  const onVisibility = () => {
    if (options?.hidden?.()) {
      return;
    }
    pollOnce();
    connect();
  };

  document.addEventListener('visibilitychange', onVisibility);
  connect();

  return () => {
    generation += 1;
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    eventSource?.close();
    eventSource = undefined;
    clearTimers();
  };
}
