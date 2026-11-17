import { createNavigationContainerRef } from '@react-navigation/native';
import { pushFocus } from '../Services/pushFocus';

export const navigationRef = createNavigationContainerRef<any>();

/** Go to the caregiver Patients tab (where the live view is) when an alert was tapped. Safe to call early: retried when ready. */
export function openPatientsForPendingAlert() {
  if (!pushFocus.hasPending) return;
  try { if (navigationRef.isReady()) navigationRef.navigate('Patients' as never); } catch { /* retried on next state change */ }
}

/** Patient tapped a "caregiver request" notification: open Profile, where the request is approved or declined. Never approves anything. */
export function openProfileForRequest() {
  try { if (navigationRef.isReady()) navigationRef.navigate('Profile' as never); } catch { /* ignore */ }
}

let pendingMedication:{owner:string;patientId:string}|null=null;
export function queueMedicationAlert(owner:string,patientId:string){pendingMedication={owner,patientId};}
export function clearPendingMedicationAlert(){pendingMedication=null;}
export function openMedicationAlert(owner:string|null){if(!pendingMedication)return;if(owner!==pendingMedication.owner){pendingMedication=null;return;}try{if(navigationRef.isReady()&&navigationRef.getRootState()?.routes.some(r=>r.name==='App')){const p=pendingMedication;pendingMedication=null;navigationRef.navigate('Reminders',{patientId:p.patientId});}}catch{/* retry once navigation is ready */}}
