import { PushFocus } from '../Src/Services/pushFocus';
import { LocationSession, SessionDeps } from '../Src/Services/locationSession';

const PID = 'a'.repeat(24);
const left = { kind: 'patient_left_zone', patientId: PID };

test('only a caregiver exit alert with a valid patient id is recorded', () => {
  const f = new PushFocus();
  expect(f.record('cg1', 'patient', left)).toBe(false);
  expect(f.record(null, 'caregiver', left)).toBe(false);
  expect(f.record('cg1', 'caregiver', { kind: 'caregiver_nearby', patientId: PID })).toBe(false);
  expect(f.record('cg1', 'caregiver', { kind: 'patient_left_zone', patientId: '../etc' })).toBe(false);
  expect(f.record('cg1', 'caregiver', left)).toBe(true);
  expect(f.consume('cg1')).toBe(PID);
  expect(f.consume('cg1')).toBeNull();
});

test('a tap made by one account is not shown to another after an account switch', () => {
  const f = new PushFocus();
  f.record('cg1', 'caregiver', left);
  expect(f.consume('cg2')).toBeNull();      // switched account: dropped
  expect(f.hasPending).toBe(false);
  f.record('cg1', 'caregiver', left);
  expect(f.consume(null)).toBeNull();        // signed out: dropped
});

function mk() {
  const log: string[] = [];
  let release: (() => void) | null = null;
  const d: SessionDeps = {
    now: () => 1, getPushToken: async () => 'tok-1', deletePushToken: async () => {},
    registerToken: async (t: string) => { log.push('reg:' + t); if (t === 'tok-slow') await new Promise<void>(r => { release = r; }); },
    unregisterToken: async (t: string) => { log.push('unreg:' + t); },
    sendFix: async () => {}, watch: async () => () => {}, startForeground: async () => {}, stopForeground: async () => {},
    shouldCapture: async () => false,
  } as any;
  return { d, log, release: () => release?.() };
}

test('token refresh re-registers for the signed-in account and drops the old token', async () => {
  const h = mk(); const s = new LocationSession(h.d);
  await s.setOwner('cg1', 'caregiver');
  await s.onTokenRefreshed('tok-2');
  expect(h.log).toEqual(['reg:tok-1', 'reg:tok-2', 'unreg:tok-1']);
});

test('token refresh with nobody signed in does nothing', async () => {
  const h = mk(); const s = new LocationSession(h.d);
  await s.onTokenRefreshed('tok-2');
  expect(h.log).toEqual([]);
});

test('a delayed refresh that finishes after sign-out is undone, never kept for the next account', async () => {
  const h = mk(); const s = new LocationSession(h.d);
  await s.setOwner('cg1', 'caregiver');
  const p = s.onTokenRefreshed('tok-slow');
  await new Promise<void>(r => setImmediate(() => r()));
  await s.setOwner(null, null);               // sign out while the registration is in flight
  h.release();
  await p;
  expect(h.log).toContain('unreg:tok-slow');
  await s.setOwner('cg2', 'caregiver');
  expect(h.log.filter(x => x === 'reg:tok-slow').length).toBe(1);
});
