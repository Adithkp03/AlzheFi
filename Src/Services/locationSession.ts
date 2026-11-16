/**
 * Owns everything that is tied to the signed-in account: push token registration and (patient only)
 * foreground location capture. Everything is bound to one owner id. Changing or clearing the owner
 * stops capture and removes the push token before the new owner starts, so one account's location or
 * alerts cannot continue under another account on the same phone.
 *
 * Test-only values: not clinically validated. SAMPLE_REQUEST_MS is what we ASK the OS for; the device
 * decides what it actually delivers, and the server treats any fix older than its stale limit as not live.
 */
export const SAMPLE_REQUEST_MS = 30_000;      // requested interval
export const FASTEST_REQUEST_MS = 15_000;     // fastest we accept
export const MIN_UPLOAD_GAP_MS = 15_000;      // never upload more often than this, whatever the OS delivers

export interface Fix { lat: number; lon: number; accuracyM: number; recordedAt: number }
export interface SessionDeps {
  getPushToken(): Promise<string | null>;
  deletePushToken(): Promise<void>;
  registerToken(token: string): Promise<void>;
  unregisterToken(token: string): Promise<void>;
  sendFix(fix: Fix): Promise<void>;
  /** start OS watch; returns a stop function */
  watch(onFix: (f: Fix) => void, onError: (e: unknown) => void): Promise<() => void>;
  startForeground(): Promise<void>;
  stopForeground(): Promise<void>;
  /** true when the patient has at least one active per-caregiver grant. */
  hasActiveGrant(): Promise<boolean>;
  now(): number;
}

export class LocationSession {
  private ownerId: string | null = null;
  private stopWatch: (() => void) | null = null;
  private lastUpload = 0;
  private lastToken: string | null = null;
  private gen = 0;
  constructor(private d: SessionDeps) {}

  get owner() { return this.ownerId; }
  get capturing() { return this.stopWatch !== null; }

  /** Call whenever the signed-in user changes (null = signed out). */
  async setOwner(userId: string | null, role: 'patient' | 'caregiver' | null): Promise<void> {
    if (userId === this.ownerId) return;
    await this.teardown();
    const g = ++this.gen;
    this.ownerId = userId;
    if (!userId) return;
    try {
      const t = await this.d.getPushToken();
      if (g !== this.gen) return;
      if (t) { await this.d.registerToken(t); this.lastToken = t; }
    } catch { /* push is best effort */ }
    if (role === 'patient') await this.refreshCapture();
  }

  /** Start or stop capture to match the patient's grants. Sharing stays on until the patient turns it off. */
  async refreshCapture(): Promise<void> {
    const g = this.gen; const owner = this.ownerId;
    if (!owner) return;
    let want = false;
    try { want = await this.d.hasActiveGrant(); } catch { return; }
    if (g !== this.gen) return;
    if (want && !this.stopWatch) {
      await this.d.startForeground();
      const stop = await this.d.watch(f => this.onFix(g, f), () => { /* OS error: no fix, server shows stale */ });
      if (g !== this.gen) { stop(); await this.d.stopForeground(); return; }
      this.stopWatch = stop;
    } else if (!want && this.stopWatch) {
      await this.stopCapture();
    }
  }

  private async onFix(g: number, f: Fix) {
    if (g !== this.gen || !this.ownerId) return;           // fix from a previous owner is dropped
    const t = this.d.now();
    if (t - this.lastUpload < MIN_UPLOAD_GAP_MS) return;
    this.lastUpload = t;
    try { await this.d.sendFix(f); } catch { /* next fix retries; server shows stale meanwhile */ }
  }

  private async stopCapture() {
    const s = this.stopWatch; this.stopWatch = null;
    if (s) { s(); await this.d.stopForeground(); }
  }

  /** Logout / account switch: stop capture, remove push token on server and device. */
  async teardown(): Promise<void> {
    this.gen++;
    await this.stopCapture();
    const t = this.lastToken; this.lastToken = null; this.lastUpload = 0;
    try { if (t) await this.d.unregisterToken(t); } catch { /* still delete device token below */ }
    try { await this.d.deletePushToken(); } catch { /* ignore */ }
    this.ownerId = null;
  }
}
