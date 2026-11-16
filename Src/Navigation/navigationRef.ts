import { createNavigationContainerRef } from '@react-navigation/native';
import { pushFocus } from '../Services/pushFocus';

export const navigationRef = createNavigationContainerRef<any>();

/** Go to the caregiver Patients tab (where the live view is) when an alert was tapped. Safe to call early: retried when ready. */
export function openPatientsForPendingAlert() {
  if (!pushFocus.hasPending) return;
  try { if (navigationRef.isReady()) navigationRef.navigate('Patients' as never); } catch { /* retried on next state change */ }
}
