const KEY = 'openbahia.prefs.v1';

export interface UserPrefs {
  lineId?: string;
  showOutbound?: boolean;
  showInbound?: boolean;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function migrateVisibility(
  record: Record<string, unknown>,
): Pick<UserPrefs, 'showOutbound' | 'showInbound'> {
  if (typeof record.showOutbound === 'boolean' || typeof record.showInbound === 'boolean') {
    return {
      showOutbound: asBoolean(record.showOutbound, true),
      showInbound: asBoolean(record.showInbound, true),
    };
  }
  if (record.directionFilter === 'outbound') {
    return { showOutbound: true, showInbound: false };
  }
  if (record.directionFilter === 'inbound') {
    return { showOutbound: false, showInbound: true };
  }
  return { showOutbound: true, showInbound: true };
}

export function loadPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const lineId =
      typeof record.lineId === 'string' && /^[0-9A-Za-z][0-9A-Za-z-]{0,31}$/.test(record.lineId)
        ? record.lineId
        : undefined;
    return { lineId, ...migrateVisibility(record) };
  } catch {
    return {};
  }
}

export function savePrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Quota / private mode — keep working without persistence.
  }
}
