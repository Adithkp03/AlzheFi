import { LocationSession, SessionDeps, Fix, MIN_UPLOAD_GAP_MS } from '../Src/Services/locationSession';

function mk(grant = true) {
  let clock = 1_000_000;
  const log: string[] = [];
  let emit: ((f: Fix) => void) | null = null;
  let token = 'tok-A';
  const d: SessionDeps = {
    now: () => clock,
    getPushToken: async () => token,
    deletePushToken: async () => { log.push('deviceTokenDeleted'); },
    registerToken: async t => { log.push('reg:' + t); },
    unregisterToken: async t => { log.push('unreg:' + t); },
    sendFix: async f => { log.push('fix:' + f.lat); },
    watch: async onFix => { emit = onFix; log.push('watch'); return () => { emit = null; log.push('unwatch'); }; },
    startForeground: async () => { log.push('fgOn'); },
    stopForeground: async () => { log.push('fgOff'); },
    hasActiveGrant: async () => grant,
  } as any;
  return { d, log, tick: (ms: number) => { clock += ms; }, emit: (f: Fix) => emit?.(f), setToken: (t: string) => { token = t; }, hasWatch: () => emit !== null };
}
const F = (lat: number): Fix => ({ lat, lon: 0, accuracyM: 5, recordedAt: 0 });
const flush = () => new Promise(r => setImmediate(r));

test('patient with a grant starts capture; caregiver never captures', async () => {
  const p = mk(); const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  expect(s.capturing).toBe(true);
  const c = mk(); const s2 = new LocationSession(c.d);
  await s2.setOwner('cg', 'caregiver');
  expect(s2.capturing).toBe(false);
  expect(c.log).toContain('reg:tok-A');
});

test('no grant, no capture; capture starts when a grant appears and stops when all are revoked', async () => {
  let grant = false; const p = mk(); p.d.hasActiveGrant = async () => grant;
  const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient'); expect(s.capturing).toBe(false);
  grant = true; await s.refreshCapture(); expect(s.capturing).toBe(true);
  grant = false; await s.refreshCapture(); expect(s.capturing).toBe(false);
  expect(p.log).toContain('fgOff');
});

test('uploads are throttled to the minimum gap regardless of how often the OS delivers', async () => {
  const p = mk(); const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  p.emit(F(1)); await flush(); p.tick(1000); p.emit(F(2)); await flush();
  p.tick(MIN_UPLOAD_GAP_MS); p.emit(F(3)); await flush();
  expect(p.log.filter(x => x.startsWith('fix:'))).toEqual(['fix:1', 'fix:3']);
});

test('logout stops capture and foreground service and clears the push token on server and device', async () => {
  const p = mk(); const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  await s.setOwner(null, null);
  expect(s.capturing).toBe(false); expect(s.owner).toBeNull();
  expect(p.log).toEqual(expect.arrayContaining(['unwatch', 'fgOff', 'unreg:tok-A', 'deviceTokenDeleted']));
  p.emit(F(9)); await flush();
  expect(p.log.filter(x => x === 'fix:9')).toHaveLength(0);
});

test('account switch: old account capture and token are gone before the new account registers', async () => {
  const p = mk(); const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  p.setToken('tok-B');
  await s.setOwner('cg', 'caregiver');
  const i = (x: string) => p.log.indexOf(x);
  expect(i('unwatch')).toBeLessThan(i('reg:tok-B'));
  expect(i('unreg:tok-A')).toBeLessThan(i('reg:tok-B'));
  expect(s.capturing).toBe(false); expect(s.owner).toBe('cg');
});

test('a fix delivered by the OS after teardown is never uploaded under the next owner', async () => {
  const p = mk(); let cb: ((f: Fix) => void) | null = null;
  const orig = p.d.watch; p.d.watch = async (on, er) => { cb = on; return orig(on, er); };
  const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  await s.setOwner('cg', 'caregiver');
  cb!(F(7)); await flush();   // late callback from the old watch, still holding the old callback
  expect(p.log.filter(x => x === 'fix:7')).toHaveLength(0);
});
