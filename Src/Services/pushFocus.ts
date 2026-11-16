/**
 * Remembers which patient a tapped alert was about, for the account that was signed in when it was tapped.
 * A tap never carries a position and never grants access: the live view still asks the server, which refuses
 * anyone without current, patient-approved access. A pending focus is dropped if the account changed.
 */
export type PushData = { kind?: unknown; patientId?: unknown };
const ID = /^[a-f0-9]{24}$/i;

type Pending = { ownerId: string; patientId: string };
type Listener = () => void;

export class PushFocus {
  private pending: Pending | null = null;
  private listeners = new Set<Listener>();

  /** Only a caregiver's "patient left the safe area" alert opens a patient's live view. Returns true if recorded. */
  record(ownerId: string | null, role: 'patient' | 'caregiver' | null, data: PushData | null | undefined): boolean {
    if (!ownerId || role !== 'caregiver' || !data) return false;
    if (data.kind !== 'patient_left_zone' || typeof data.patientId !== 'string' || !ID.test(data.patientId)) return false;
    this.pending = { ownerId, patientId: data.patientId };
    this.listeners.forEach(l => l());
    return true;
  }

  get hasPending() { return this.pending !== null; }

  /** The patient to show, only for the account that tapped; otherwise null (and a stale one is dropped). */
  consume(currentOwnerId: string | null): string | null {
    const p = this.pending;
    if (!p) return null;
    this.pending = null;
    return currentOwnerId && p.ownerId === currentOwnerId ? p.patientId : null;
  }

  clear() { this.pending = null; }
  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }
}

export const pushFocus = new PushFocus();
