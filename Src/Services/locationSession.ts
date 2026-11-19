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
export const NO_FIX_NOTICE_MS = 60_000;       // wording only: after this long without any fix, say so (no threshold or accuracy rule changes)

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
  /** patient: at least one active per-caregiver grant. caregiver: own explicit 'share my location for nearby alerts' switch is on. */
  shouldCapture(role: 'patient' | 'caregiver'): Promise<boolean>;
  nativeHealth?():Promise<{running:boolean;issue:string}|null>;
  now(): number;
}

export class LocationSession {
  private ownerId: string | null = null;
  private role: 'patient' | 'caregiver' | null = null;
  private stopWatch: (() => void) | null = null;
  private lastUpload = 0;
  private lastToken: string | null = null;
  private gen = 0;
  private pushInFlight: Promise<void> | null = null;
  pushStatus = 'Checking notification registration.';
  private inflight: Promise<void> | null = null;   // single flight: one start/stop decision at a time
  private startedAt: number | null = null;
  private lastWant: boolean | null = null;          // last answer from the server about whether capture is wanted
  lastCheckError: string | null = null;
  constructor(private d: SessionDeps) {}

  get owner() { return this.ownerId; }
  get ownerRole() { return this.role; }
  lastError: string | null = null;
  /** Evidence for testing, no coordinates: when the phone last got a GPS fix, last upload result, last OS watch error. */
  lastFixAt: number | null = null; lastFixRecordedAt: number | null = null; lastUploadAt: number | null = null; lastUploadError: string | null = null; lastWatchError: string | null = null;
  private nativeHealthLine:string|null=null;
  async refreshNativeHealth(){const g=this.gen;const h=await this.d.nativeHealth?.().catch(()=>null);if(g===this.gen)this.nativeHealthLine=h?.issue??null;}
  async restartCapture(){await this.stopCapture();this.nativeHealthLine=null;this.lastError=null;await this.refreshCapture();}
  statusLine(): string {
    if(this.nativeHealthLine)return this.nativeHealthLine;
    if (!this.stopWatch) {
      if (this.lastError) return this.lastError;
      if (this.lastCheckError) return this.lastCheckError;
      if (this.lastWant === false) return 'Tracking is off: no caregiver is currently receiving your location.';
      if (this.ownerId && this.lastWant === null) return 'Tracking has not started yet. Checking sharing status.';
      return 'Tracking is not running on this phone.';
    }
    const ago = (t: number | null) => t ? `${Math.max(0, Math.round((this.d.now() - t) / 1000))}s ago` : null;
    if (this.lastWatchError && !this.lastFixAt) return `No GPS fix yet (phone reported: ${this.lastWatchError}).`;
    if (!this.lastFixAt && this.startedAt !== null && this.d.now() - this.startedAt >= NO_FIX_NOTICE_MS)
      return `Still no GPS fix after ${Math.round((this.d.now() - this.startedAt) / 1000)}s. Check that Location is on for this phone and try near a window or outdoors.`;
    if (!this.lastFixAt) return 'Tracking started. Waiting for the first GPS fix.';
    if (this.d.now() - this.lastFixAt >= NO_FIX_NOTICE_MS) return `No new GPS callback for ${Math.round((this.d.now() - this.lastFixAt) / 1000)}s. Last successful send: ${ago(this.lastUploadAt) ?? 'none'}. Tracking may be interrupted.`;
    if (this.lastFixRecordedAt !== null && (this.d.now() - this.lastFixRecordedAt > 120_000 || this.lastFixRecordedAt > this.d.now() + 30_000)) return 'The phone returned an old or future-dated location. This is not a fresh location update.';
    if (this.lastUploadError) return `GPS fix ${ago(this.lastFixAt)}, but sending failed (${this.lastUploadError}).`;
    return this.lastUploadAt ? `GPS fix ${ago(this.lastFixAt)}. Last sent ${ago(this.lastUploadAt)}.` : `GPS fix ${ago(this.lastFixAt)}. Not sent yet.`;
  }
  get capturing() { return this.stopWatch !== null; }

  /** Call whenever the signed-in user changes (null = signed out). */
  async setOwner(userId: string | null, role: 'patient' | 'caregiver' | null): Promise<void> {
    if (userId === this.ownerId) return;
    await this.teardown();
    const g = ++this.gen;
    this.ownerId = userId; this.role = role;
    this.nativeHealthLine=null;this.lastError = null; this.lastCheckError = null; this.lastWatchError = null; this.lastWant = null;
    this.lastFixAt = null; this.lastFixRecordedAt = null; this.lastUploadAt = null; this.lastUploadError = null; this.startedAt = null;
    if (!userId) return;
    await this.ensurePushRegistered();
    if (role) await this.refreshCapture();
  }

  /** Retries a failed initial registration on the next refresh, without leaking another owner's token. */
  async ensurePushRegistered(): Promise<void> {
    if (!this.ownerId || this.lastToken) return;
    if (this.pushInFlight) return this.pushInFlight;
    const g = this.gen, owner = this.ownerId;
    const task = (async () => {
      try {
        const token = await this.d.getPushToken();
        if (g !== this.gen || owner !== this.ownerId) return;
        if (!token) { this.pushStatus = 'Notifications are not registered on this phone. Check notification permission and Google Play services.'; return; }
        await this.d.registerToken(token);
        if (g !== this.gen || owner !== this.ownerId) { try { await this.d.unregisterToken(token); } catch {} return; }
        this.lastToken = token; this.pushStatus = 'This phone is registered for alerts. Delivery is not guaranteed.';
      } catch { if (g === this.gen) this.pushStatus = 'Could not register this phone for alerts. Retrying when the screen refreshes.'; }
    })();
    this.pushInFlight = task;
    try { await task; } finally { if (this.pushInFlight === task) this.pushInFlight = null; }
  }

  /**
   * FCM rotated this device's token. Applies only to the account that is still signed in: a callback that lands
   * after sign-out or an account switch is dropped, and a registration that finished after such a change is undone.
   */
  async onTokenRefreshed(newToken: string): Promise<void> {
    const g = this.gen; const owner = this.ownerId;
    if (!owner || !newToken || newToken === this.lastToken) return;
    const old = this.lastToken;
    try {
      await this.d.registerToken(newToken);
      if (g !== this.gen || owner !== this.ownerId) { try { await this.d.unregisterToken(newToken); } catch { /* best effort */ } return; }
      this.lastToken = newToken;
      if (old) { try { await this.d.unregisterToken(old); } catch { /* server prunes invalid tokens */ } }
    } catch { /* next refresh or sign-in retries */ }
  }

  /** Start or stop capture to match the patient's grants. Sharing stays on until the patient turns it off. */
  async refreshCapture(opts: { auto?: boolean } = {}): Promise<void> {
    // Single flight: a call that arrives while one is running joins it, so two starts can never leak a second watch.
    if (this.inflight) return opts.auto ? this.inflight : this.inflight.then(() => this.refreshCapture(opts));   // a person's action re-reads state after the running one
    // Automatic reconciliation never retries a start that already failed (e.g. permission refused): only the person does.
    if (opts.auto && this.lastError) return;
    const run = this.doRefresh().finally(() => { this.inflight = null; });
    this.inflight = run;
    return run;
  }

  private async doRefresh(): Promise<void> {
    const g = this.gen; const owner = this.ownerId;
    if (!owner || !this.role) return;
    let want = false;
    try { want = await this.d.shouldCapture(this.role); this.lastCheckError = null; }
    catch { if (g === this.gen) this.lastCheckError = 'Could not check sharing status. Will try again.'; return; }
    if (g !== this.gen || owner !== this.ownerId) return;   // signed out or switched while asking: never start for the old owner
    this.lastWant = want;
    await this.refreshNativeHealth();
    if (want && !this.stopWatch) {
      this.lastError = null; this.lastWatchError = null;
      try {
        await this.d.startForeground();
        if (g !== this.gen) { await this.d.stopForeground(); return; }
        const stop = await this.d.watch(f => this.onFix(g, f), (e: any) => { this.lastWatchError = String(e?.message ?? e?.code ?? 'unknown').slice(0, 60); });
        if (g !== this.gen) { stop(); await this.d.stopForeground(); return; }
        this.stopWatch = stop; this.startedAt = this.d.now(); this.lastFixAt = null;
      } catch (e: any) {
        // Say so instead of failing silently: no capture means no location is ever uploaded.
        this.lastError = /denied/i.test(String(e?.message)) ? 'Location permission was not granted.' : 'Could not start location sharing on this phone.';
        try { await this.d.stopForeground(); } catch { /* ignore */ }
      }
    } else if (!want && this.stopWatch) {
      await this.stopCapture();
    }
  }

  private async onFix(g: number, f: Fix) {
    if (g !== this.gen || !this.ownerId) return;           // fix from a previous owner is dropped
    const t = this.d.now();
    this.lastFixAt = t; this.lastFixRecordedAt = f.recordedAt; this.lastWatchError = null;
    const owner = this.ownerId;
    if (t - this.lastUpload < MIN_UPLOAD_GAP_MS) return;
    this.lastUpload = t;
    try { await this.d.sendFix(f); if (g !== this.gen || owner !== this.ownerId) return; this.lastUploadAt = this.d.now(); this.lastUploadError = null; }
    catch (e: any) { if (g !== this.gen || owner !== this.ownerId) return; this.lastUploadError = e?.response?.status ? `HTTP ${e.response.status}` : 'no network or server'; }   // next fix retries; server shows stale meanwhile
  }

  private async stopCapture() {
    const s = this.stopWatch; this.stopWatch = null; this.startedAt = null;
    if (s) { s(); await this.d.stopForeground(); }
  }

  /** Logout / account switch: stop capture, remove push token on server and device. */
  async teardown(): Promise<void> {
    this.gen++;
    this.pushInFlight = null;
    this.pushStatus = 'Notifications are not registered.';
    await this.stopCapture();
    const t = this.lastToken; this.lastToken = null; this.lastUpload = 0;
    try { if (t) await this.d.unregisterToken(t); } catch { /* still delete device token below */ }
    try { await this.d.deletePushToken(); } catch { /* ignore */ }
    this.ownerId = null; this.role = null;
  }
}
