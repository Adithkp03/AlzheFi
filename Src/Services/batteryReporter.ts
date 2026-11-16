/**
 * Patient phone only, and only while the patient's own battery switch is on (server-side consent).
 * Reads percent + charging and uploads on start, then every REPORT_MS, whenever the app comes to the foreground.
 * Never starts for a signed-out or switched account. When the phone is charging it removes a shown low-battery alert locally.
 * Test build: needs the app process alive; no background guarantee.
 */
export const BATTERY_REPORT_MS = 30_000;
export interface BatteryDeps {
  read(): Promise<{ pct: number; charging: boolean }>;
  send(r: { pct: number; charging: boolean; recordedAt: number }): Promise<void>;
  wanted(): Promise<boolean>;                 // server: this patient's battery switch is on
  clearLocalAlert(): Promise<void>;
  now(): number;
  every(fn: () => void, ms: number): () => void;
}
export class BatteryReporter {
  private ownerId: string | null = null; private role: 'patient' | 'caregiver' | null = null;
  private stopTimer: (() => void) | null = null; private gen = 0; private inflight: Promise<void> | null = null;
  lastError: string | null = null; lastSentAt: number | null = null; lastPct: number | null = null; lastCharging: boolean | null = null;
  constructor(private d: BatteryDeps) {}
  get running() { return this.stopTimer !== null; }

  setOwner(id: string | null, role: 'patient' | 'caregiver' | null) {
    if (id === this.ownerId && role === this.role) return;
    this.stop(); this.gen++; this.ownerId = id; this.role = role;
    this.lastError = null; this.lastSentAt = null; this.lastPct = null; this.lastCharging = null;
    if (id && role === 'patient') this.reconcile().catch(() => {});
  }
  private stop() { this.stopTimer?.(); this.stopTimer = null; }

  /** Start or stop to match the server's battery switch. Single flight. */
  async reconcile(): Promise<void> {
    if (this.inflight) return this.inflight;
    const run = this.doReconcile().finally(() => { this.inflight = null; });
    this.inflight = run; return run;
  }
  private async doReconcile() {
    const g = this.gen;
    if (!this.ownerId || this.role !== 'patient') return;
    let want = false;
    try { want = await this.d.wanted(); } catch { return; }
    if (g !== this.gen) return;
    if (want && !this.stopTimer) {
      this.stopTimer = this.d.every(() => { this.tick(g).catch(() => {}); }, BATTERY_REPORT_MS);
      await this.tick(g);
    } else if (!want && this.stopTimer) { this.stop(); }
  }
  async tick(g: number = this.gen) {
    if (g !== this.gen || !this.ownerId) return;
    try {
      const r = await this.d.read();
      if (g !== this.gen) return;
      this.lastPct = r.pct; this.lastCharging = r.charging;
      if (r.charging) await this.d.clearLocalAlert();
      await this.d.send({ pct: r.pct, charging: r.charging, recordedAt: this.d.now() });
      if (g === this.gen) { this.lastSentAt = this.d.now(); this.lastError = null; }
    } catch (e: any) {
      if (g === this.gen) this.lastError = e?.response?.status === 403 ? 'Battery sharing is off.' : e?.response?.status ? `Battery not sent (HTTP ${e.response.status})` : 'Battery not sent (no network or reading unavailable)';
    }
  }
  statusLine(): string {
    if (!this.running) return 'Battery alerts are off on this phone.';
    if (this.lastError) return this.lastError;
    if (this.lastSentAt === null) return 'Reading the battery...';
    return `Battery ${this.lastPct}%${this.lastCharging ? ', charging' : ''}. Sent ${Math.max(0, Math.round((this.d.now() - this.lastSentAt) / 1000))}s ago.`;
  }
  teardown() { this.stop(); this.gen++; this.ownerId = null; this.role = null; }
}
