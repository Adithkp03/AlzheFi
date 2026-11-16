import { BatteryReporter, BatteryDeps, BATTERY_REPORT_MS } from '../Src/Services/batteryReporter';

function mk(want = true) {
  let clock = 1_000_000; let level = { pct: 50, charging: false }; const sent: any[] = []; let timers: Array<() => void> = []; let cleared = 0; let wantNow = want;
  const d: BatteryDeps = {
    read: async () => level, send: async r => { sent.push(r); }, wanted: async () => wantNow,
    clearLocalAlert: async () => { cleared++; }, now: () => clock,
    every: fn => { timers.push(fn); return () => { timers = timers.filter(t => t !== fn); }; },
  };
  return { d, sent, tick: async () => { timers.slice().forEach(t => t()); await new Promise(r => setImmediate(r)); }, set: (l: any) => { level = l; }, setWant: (w: boolean) => { wantNow = w; }, cleared: () => cleared, timers: () => timers.length, adv: (ms: number) => { clock += ms; } };
}
const flush = () => new Promise<void>(r => setImmediate(() => r()));

test('patient with the switch on reports at start and on each tick; caregiver never does', async () => {
  const m = mk(); const r = new BatteryReporter(m.d);
  r.setOwner('cg', 'caregiver'); await flush(); expect(m.sent).toHaveLength(0); expect(r.running).toBe(false);
  r.setOwner('pat', 'patient'); await flush(); await flush();
  expect(m.sent).toHaveLength(1); expect(r.running).toBe(true);
  m.set({ pct: 22, charging: false }); await m.tick();
  expect(m.sent[1]).toMatchObject({ pct: 22, charging: false });
  expect(BATTERY_REPORT_MS).toBe(30_000);
});
test('switch off stops reporting; sign-out stops reporting', async () => {
  const m = mk(); const r = new BatteryReporter(m.d);
  r.setOwner('pat', 'patient'); await flush(); await flush();
  m.setWant(false); await r.reconcile(); expect(r.running).toBe(false); expect(m.timers()).toBe(0);
  m.setWant(true); await r.reconcile(); expect(r.running).toBe(true);
  r.setOwner(null, null); expect(r.running).toBe(false); expect(m.timers()).toBe(0);
});
test('switch off by default: nothing is read or sent', async () => {
  const m = mk(false); const r = new BatteryReporter(m.d);
  r.setOwner('pat', 'patient'); await flush(); await flush();
  expect(m.sent).toHaveLength(0); expect(r.statusLine()).toMatch(/off on this phone/);
});
test('charging removes a shown alert on this phone and is reported', async () => {
  const m = mk(); const r = new BatteryReporter(m.d);
  r.setOwner('pat', 'patient'); await flush(); await flush();
  m.set({ pct: 21, charging: true }); await m.tick();
  expect(m.cleared()).toBe(1); expect(m.sent[m.sent.length - 1]).toMatchObject({ charging: true });
  expect(r.statusLine()).toMatch(/21%, charging/);
});
test('concurrent reconcile starts one timer; failures are visible, not silent', async () => {
  const m = mk(); const r = new BatteryReporter(m.d); r.setOwner('pat', 'patient');
  await Promise.all([r.reconcile(), r.reconcile(), r.reconcile()]); await flush();
  expect(m.timers()).toBe(1);
  m.d.send = async () => { throw { response: { status: 403 } }; }; await m.tick();
  expect(r.statusLine()).toBe('Battery sharing is off.');
  m.d.send = async () => { throw new Error('net'); }; await m.tick();
  expect(r.statusLine()).toMatch(/no network/);
});
test('account switch mid-read never sends under the new owner', async () => {
  const m = mk(); let release: () => void = () => {}; m.d.read = () => new Promise(res => { release = () => res({ pct: 10, charging: false }); });
  const r = new BatteryReporter(m.d); r.setOwner('pat', 'patient'); await flush(); await flush();
  r.setOwner('pat2', 'patient'); release(); await flush(); await flush();
  expect(m.sent.filter(x => x.pct === 10)).toHaveLength(0);
});
