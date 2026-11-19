import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { careLinkEvents, AUTO_REFRESH_MS } from './careLinkEvents';

/** Run `fn` on mount, when the app returns to the foreground, on a link-change signal, and every few seconds while mounted. */
export function useAutoRefresh(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const run = () => { try { ref.current(); } catch { /* ignore */ } };
    run();
    const id = setInterval(() => { if (AppState.currentState === 'active') run(); }, AUTO_REFRESH_MS);
    const app = AppState.addEventListener('change', s => { if (s === 'active') run(); });
    const unsub = careLinkEvents.subscribe(run);
    return () => { clearInterval(id); app.remove(); unsub(); };
  }, []);
}
