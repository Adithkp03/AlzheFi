/** Tiny change signal so the patient's Profile sections reload together after an approve/decline/remove. */
type L = () => void;
const ls = new Set<L>();
export const careLinkEvents = {
  emit() { ls.forEach(l => { try { l(); } catch { /* ignore */ } }); },
  subscribe(l: L) { ls.add(l); return () => { ls.delete(l); }; },
};
/** Reload while a screen is mounted and the app is in the foreground. Test-build interval; not a delivery guarantee. */
export const AUTO_REFRESH_MS = 8000;
