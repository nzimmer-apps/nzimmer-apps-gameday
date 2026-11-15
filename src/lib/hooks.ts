import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, peekJson } from './espn';

/**
 * Fetch an ESPN URL. Pass `pollMs` to refresh on a timer (only while the tab is visible).
 * Shows the cached copy at once when there is one, then refreshes.
 */
export function useEspn<T = any>(url: string | null, pollMs: number | false = false) {
  const [data, setData] = useState<T | undefined>(() => (url ? peekJson<T>(url) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!data);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(
    async (force = false) => {
      if (!url) return;
      try {
        const d = await getJson<T>(url, force ? 0 : pollMs ? Math.min(pollMs, 15_000) : 60_000);
        if (urlRef.current !== url) return;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (urlRef.current === url) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (urlRef.current === url) setLoading(false);
      }
    },
    [url, pollMs],
  );

  useEffect(() => {
    setData(url ? peekJson<T>(url) : undefined);
    setLoading(true);
    void load();
  }, [url, load]);

  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, pollMs);
    const onVis = () => document.visibilityState === 'visible' && void load(true);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [pollMs, load]);

  return { data, error, loading: loading && !data, updatedAt, reload: () => load(true) };
}

// ---- Device settings (localStorage, best effort) ----

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. */
  }
}

const listeners = new Set<() => void>();
export type Theme = 'system' | 'dark' | 'light';
export type Settings = { favorites: string[]; theme: Theme };
let settings: Settings = {
  favorites: read<string[]>('ssz.favorites', ['GB']),
  theme: read<Theme>('ssz.theme', 'system'),
};

export function getSettings() {
  return settings;
}

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  write('ssz.favorites', settings.favorites);
  write('ssz.theme', settings.theme);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return settings;
}

export function toggleFavorite(abbr: string) {
  const f = settings.favorites;
  updateSettings({ favorites: f.includes(abbr) ? f.filter((a) => a !== abbr) : [...f, abbr] });
}
