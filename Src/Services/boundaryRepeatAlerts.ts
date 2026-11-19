import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import { apiService } from './apiService';
import { fullScreenAllowed } from './boundaryAlerts';

/**
 * Repeat reminders for an unresolved safe-area crossing. The push is only a hint:
 * the event is re-fetched over the authenticated API and displayed only while the
 * crossing is still open and this caregiver has not stopped it. Stop is a durable
 * server action for this caregiver and this crossing only; a failed Stop is shown
 * as 'Not stopped yet', never as success.
 */
export type BoundaryRepeatEvent = {
  eventId: string; episodeId: string; patientId: string; recipientId: string;
  occurredAt: number; kind: 'outside_reminder' | 'unresolved_reminder';
  lastSeen: { lat: number; lon: number; accuracyM: number; recordedAt: number } | null;
  openedAt: number; stopped: boolean;
};
const ids = /^[a-f0-9]{24}$/i;
const seen = new Set<string>();
const listeners = new Set<(event: BoundaryRepeatEvent) => void>();
export const boundaryRepeatAlerts = { subscribe(fn: (event: BoundaryRepeatEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; } };

export function repeatText(e: BoundaryRepeatEvent): { title: string; body: string } {
  if (e.kind === 'outside_reminder')
    return { title: 'AlzheFi boundary alert', body: 'They are still outside the safe area. Open the app for their current location.' };
  const when = e.lastSeen && Number.isFinite(e.lastSeen.recordedAt) ? new Date(e.lastSeen.recordedAt).toLocaleString() : 'earlier';
  return { title: 'AlzheFi boundary alert', body: `Still unresolved. Last seen outside at ${when}; current location is unavailable. This is not their live position.` };
}

/** Called from both FCM foreground and background handlers. */
export async function receiveBoundaryRepeat(data: any): Promise<boolean> {
  if (data?.kind !== 'boundary_repeat' || !ids.test(String(data.eventId)) || !ids.test(String(data.recipientId)) || !ids.test(String(data.episodeId))) return false;
  const before = await AsyncStorage.getItem('user');
  let user: any; try { user = JSON.parse(before ?? 'null'); } catch { return false; }
  if (user?.role !== 'caregiver' || String(user.id ?? user._id) !== data.recipientId) return false;
  let event: BoundaryRepeatEvent;
  try { event = await apiService.getBoundaryRepeatEvent(data.eventId); } catch { return false; }
  if (before !== await AsyncStorage.getItem('user') || event.recipientId !== data.recipientId || event.eventId !== data.eventId || event.episodeId !== data.episodeId) return false;
  if (!ids.test(String(event.patientId)) || !Number.isFinite(event.occurredAt) || event.stopped) return false;
  if (event.kind !== 'outside_reminder' && event.kind !== 'unresolved_reminder') return false;
  if (seen.has(event.eventId)) return true;
  seen.add(event.eventId); if (seen.size > 100) seen.delete(seen.values().next().value!);
  const foreground = AppState.currentState === 'active';
  if (foreground) listeners.forEach(fn => fn(event));
  await notifee.createChannel({ id: 'boundary-alerts-v1', name: 'Boundary alerts', importance: AndroidImportance.HIGH, sound: 'default', vibration: true });
  const fsi = !foreground && await fullScreenAllowed();
  const { title, body } = repeatText(event);
  const notification = {
    id: `boundary-repeat-${event.eventId}`, title, body,
    data: { kind: 'boundary_repeat', patientId: event.patientId, eventId: event.eventId, episodeId: event.episodeId, recipientId: event.recipientId },
    android: { channelId: 'boundary-alerts-v1', visibility: AndroidVisibility.PRIVATE, smallIcon: 'ic_launcher',
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [{ title: 'Stop alerts', pressAction: { id: 'stop-boundary-repeat' } }],
      ...(fsi ? { fullScreenAction: { id: 'boundary', launchActivity: 'com.alzhefi.BoundaryAlertActivity' } } : {}),
    },
  };
  if (before !== await AsyncStorage.getItem('user')) return false;
  try { await notifee.displayNotification(notification); } catch (error) {
    if (!fsi) throw error;
    const { fullScreenAction: _fullScreenAction, ...android } = notification.android;
    await notifee.displayNotification({ ...notification, android });
  }
  return true;
}

/** Durable server-side Stop for this caregiver and this crossing. Throws on failure; callers must not pretend success. */
export async function stopBoundaryRepeat(episodeId: string, eventId?: string): Promise<void> {
  if (!ids.test(episodeId)) throw new Error('Unknown alert');
  await apiService.stopBoundaryRepeat(episodeId);
  if (eventId) await notifee.cancelNotification(`boundary-repeat-${eventId}`).catch(() => undefined);
}

/**
 * Notification action presses, foreground and background. A failed Stop keeps the reminder
 * visible with an honest 'Not stopped yet' body instead of disappearing.
 */
export async function handleBoundaryRepeatAction(type: EventType, detail: any): Promise<boolean> {
  if (type !== EventType.ACTION_PRESS || detail?.pressAction?.id !== 'stop-boundary-repeat') return false;
  const d = detail.notification?.data ?? {};
  const episodeId = String(d.episodeId ?? ''), eventId = String(d.eventId ?? '');
  try {
    await stopBoundaryRepeat(episodeId, eventId);
    if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id).catch(() => undefined);
  } catch {
    try {
      await notifee.displayNotification({
        id: detail.notification?.id ?? `boundary-repeat-${eventId}`,
        title: 'AlzheFi boundary alert',
        body: 'Not stopped yet. Check your connection and tap Stop alerts again.',
        data: detail.notification?.data ?? {},
        android: { channelId: 'boundary-alerts-v1', visibility: AndroidVisibility.PRIVATE, smallIcon: 'ic_launcher',
          pressAction: { id: 'default', launchActivity: 'default' },
          actions: [{ title: 'Stop alerts', pressAction: { id: 'stop-boundary-repeat' } }] },
      });
    } catch { /* nothing more we can do headless */ }
  }
  return true;
}
