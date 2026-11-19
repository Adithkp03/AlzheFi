import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { apiService } from './apiService';
export type BoundaryEvent = { eventId: string; patientId: string; recipientId: string; occurredAt: number };
const ids = /^[a-f0-9]{24}$/i;
const seen = new Set<string>();
const listeners = new Set<(event: BoundaryEvent) => void>();
export const boundaryAlerts = { subscribe(fn: (event: BoundaryEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
async function preferenceKey(): Promise<string | null> {
  try { const u=JSON.parse(await AsyncStorage.getItem('user') ?? 'null');return u?.role==='caregiver' && (u.id ?? u._id) ? `fullScreenBoundary:${u.id ?? u._id}` : null; } catch { return null; }
}
export async function fullScreenAllowed(): Promise<boolean> {
  try { const key=await preferenceKey();return !!key && await AsyncStorage.getItem(key)==='enabled' && !!(await NativeModules.BoundaryAlertAccess?.status()); } catch { return false; }
}
export async function notificationsEnabled(): Promise<boolean> { try { return !!(await NativeModules.BoundaryAlertAccess?.notificationsEnabled()); } catch { return false; } }
export async function openFullScreenSettings() {
  const key=await preferenceKey();if(!key)return;
  // Called only after the caregiver's explicit confirmation in the UI.
  await AsyncStorage.setItem(key,'enabled');NativeModules.BoundaryAlertAccess?.openSettings();
}
export async function disableFullScreenAlerts() { const key=await preferenceKey();if(key)await AsyncStorage.removeItem(key); }


/** Called from both FCM foreground and background handlers. A push is never proof of access. */
export async function receiveBoundaryAlert(data: any): Promise<boolean> {
  if (data?.kind !== 'patient_left_zone' || !ids.test(String(data.eventId)) || !ids.test(String(data.recipientId))) return false;
  const before = await AsyncStorage.getItem('user');
  let user: any; try { user = JSON.parse(before ?? 'null'); } catch { return false; }
  if (user?.role !== 'caregiver' || String(user.id ?? user._id) !== data.recipientId) return false;
  let event: BoundaryEvent;
  try { event = await apiService.getBoundaryAlert(data.eventId); } catch { return false; }
  if (before !== await AsyncStorage.getItem('user') || event.recipientId !== data.recipientId || event.eventId !== data.eventId || !ids.test(String(event.patientId)) || !Number.isFinite(event.occurredAt) || Date.now() - event.occurredAt > 300000 || Date.now() < event.occurredAt - 30000) return false;
  if (seen.has(event.eventId)) return true;
  seen.add(event.eventId); if (seen.size > 100) seen.delete(seen.values().next().value!);
  const foreground = AppState.currentState === 'active';
  if (foreground) listeners.forEach(fn => fn(event));
  await notifee.createChannel({ id: 'boundary-alerts-v1', name: 'Boundary alerts', importance: AndroidImportance.HIGH, sound: 'default', vibration: true });
  const fsi = !foreground && await fullScreenAllowed();
  const notification = {
    id: `boundary-${event.eventId}`, title: 'AlzheFi boundary alert', body: 'Open the app to check the current status.',
    data: { kind: 'patient_left_zone', patientId: event.patientId, eventId: event.eventId, recipientId: event.recipientId },
    android: { channelId: 'boundary-alerts-v1', visibility: AndroidVisibility.PRIVATE, smallIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(fsi ? { fullScreenAction: { id: 'boundary', launchActivity: 'com.alzhefi.BoundaryAlertActivity' } } : {}),
      timeoutAfter: 300000,
    },
  };
  if (before !== await AsyncStorage.getItem('user')) return false;
  try { await notifee.displayNotification(notification); } catch (error) {
    if (!fsi) throw error;
    // A settings change or platform rejection must retain the ordinary fallback.
    const { fullScreenAction: _fullScreenAction, ...android } = notification.android;
    await notifee.displayNotification({ ...notification, android });
  }
  return true;
}
