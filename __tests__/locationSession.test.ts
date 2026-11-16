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
    registerToken: async (t: string) => { log.push('reg:' + t); },
    unregisterToken: async (t: string) => { log.push('unreg:' + t); },
    sendFix: async (f: Fix) => { log.push('fix:' + f.lat); },
    watch: async (onFix: (f: Fix) => void) => { emit = onFix; log.push('watch'); return () => { emit = null; log.push('unwatch'); }; },
    startForeground: async () => { log.push('fgOn'); },
    stopForeground: async () => { log.push('fgOff'); },
    shouldCapture: async () => grant,
  } as any;
  return { d, log, tick: (ms: number) => { clock += ms; }, emit: (f: Fix) => emit?.(f), setToken: (t: string) => { token = t; }, hasWatch: () => emit !== null };
}
const F = (lat: number): Fix => ({ lat, lon: 0, accuracyM: 5, recordedAt: 0 });
const flush = () => new Promise<void>(r => setImmediate(() => r()));

test('patient with a grant starts capture; caregiver captures only while their own switch is on', async () => {
  const p = mk(); const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  expect(s.capturing).toBe(true);
  const off = mk(); off.d.shouldCapture = async () => false;
  const s2 = new LocationSession(off.d);
  await s2.setOwner('cg', 'caregiver');
  expect(s2.capturing).toBe(false);
  expect(off.log).toContain('reg:tok-A');
  const on = mk(); const s3 = new LocationSession(on.d);
  await s3.setOwner('cg', 'caregiver');
  expect(s3.capturing).toBe(true);
  on.emit(F(5)); await flush();
  expect(on.log).toContain('fix:5');
  await s3.setOwner(null, null);                          // logout: caregiver capture stops too
  expect(s3.capturing).toBe(false);
  expect(on.log).toEqual(expect.arrayContaining(['unwatch', 'fgOff', 'unreg:tok-A']));
});

test('role-aware switch: shouldCapture receives the owner role', async () => {
  const p = mk(); const seen: string[] = []; p.d.shouldCapture = async r => { seen.push(r); return false; };
  await new LocationSession(p.d).setOwner('cg', 'caregiver');
  expect(seen).toEqual(['caregiver']);
});

test('no grant, no capture; capture starts when a grant appears and stops when all are revoked', async () => {
  let grant = false; const p = mk(); p.d.shouldCapture = async () => grant;
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
  expect(s.owner).toBe('cg'); expect(p.log.filter(x => x === 'watch')).toHaveLength(2);   // new owner has their own fresh watch
});

test('a fix delivered by the OS after teardown is never uploaded under the next owner', async () => {
  const p = mk(); let cb: ((f: Fix) => void) | null = null;
  const orig = p.d.watch; p.d.watch = async (on, er) => { cb = cb ?? on; return orig(on, er); };
  const s = new LocationSession(p.d);
  await s.setOwner('pat', 'patient');
  await s.setOwner('cg', 'caregiver');
  cb!(F(7)); await flush();   // late callback from the old watch, still holding the old callback
  expect(p.log.filter(x => x === 'fix:7')).toHaveLength(0);
});
