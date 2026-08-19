import type { VehiclesResponse } from './types';

export interface RealtimeHandlers {
  onPayload: (payload: VehiclesResponse) => void;
  onStatus?: (kind: 'sse' | 'poll' | 'error') => void;
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

  const pollOnce = () => {
    void poll()
      .then((payload) => {
        handlers.onPayload(payload);
        handlers.onStatus?.('poll');
      })
      .catch(() => {
        handlers.onStatus?.('error');
      });
  };

  const connect = () => {
    if (stopped) {
      return;
    }
    eventSource?.close();
    try {
      eventSource = new EventSource(url);
      eventSource.addEventListener('vehicles', (event) => {
        attempt = 0;
        handlers.onPayload(JSON.parse(event.data) as VehiclesResponse);
        handlers.onStatus?.('sse');
      });
      eventSource.onerror = () => {
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
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    eventSource?.close();
    clearTimers();
  };
}
