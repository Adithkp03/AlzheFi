import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, NativeModules } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { apiService } from './apiService';
export type BoundaryEvent = { eventId: string; patientId: string; recipientId: string; occurredAt: number };
const ids = /^[a-f0-9]{24}$/i;
const seen = new Set<string>();
const listeners = new Set<(event: BoundaryEvent) => void>();
export const boundaryAlerts = { subscribe(fn: (event: BoundaryEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
export async function fullScreenAllowed(): Promise<boolean> { try { return !!(await NativeModules.BoundaryAlertAccess?.status()); } catch { return false; } }
export function openFullScreenSettings() { NativeModules.BoundaryAlertAccess?.openSettings(); }

/** Called from both FCM foreground and background handlers. A push is never proof of access. */
export async function receiveBoundaryAlert(data: any): Promise<boolean> {
  if (data?.kind !== 'patient_left_zone' || !ids.test(String(data.eventId)) || !ids.test(String(data.recipientId))) return false;
  const before = await AsyncStorage.getItem('user');
  let user: any; try { user = JSON.parse(before ?? 'null'); } catch { return false; }
  if (user?.role !== 'caregiver' || String(user.id ?? user._id) !== data.recipientId) return false;
  let event: BoundaryEvent;
  try { event = await apiService.getBoundaryAlert(data.eventId); } catch { return false; }
  if (before !== await AsyncStorage.getItem('user') || event.recipientId !== data.recipientId || event.eventId !== data.eventId || Date.now() - event.occurredAt > 300000 || Date.now() < event.occurredAt - 30000) return false;
  if (seen.has(event.eventId)) return true;
  seen.add(event.eventId); if (seen.size > 100) seen.delete(seen.values().next().value!);
  const foreground = AppState.currentState === 'active';
  if (foreground) listeners.forEach(fn => fn(event));
  await notifee.createChannel({ id: 'boundary-alerts-v1', name: 'Boundary alerts', importance: AndroidImportance.HIGH, sound: 'default', vibration: true });
  const fsi = !foreground && await fullScreenAllowed();
  await notifee.displayNotification({
    id: `boundary-${event.eventId}`, title: 'AlzheFi boundary alert', body: 'Open the app to check the current status.',
    data: { kind: 'patient_left_zone', patientId: event.patientId, eventId: event.eventId, recipientId: event.recipientId },
    android: { channelId: 'boundary-alerts-v1', visibility: AndroidVisibility.PRIVATE, smallIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
      ...(fsi ? { fullScreenAction: { id: 'boundary', launchActivity: 'com.alzhefi.BoundaryAlertActivity' } } : {}),
      timeoutAfter: 300000,
    },
  });
  return true;
}
