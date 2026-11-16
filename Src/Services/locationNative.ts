import { PermissionsAndroid, Platform, AppState } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';
import { getMessaging, getToken, deleteToken, onMessage, onTokenRefresh, onNotificationOpenedApp, getInitialNotification } from '@react-native-firebase/messaging';
import { EventType } from '@notifee/react-native';
import { pushFocus } from './pushFocus';
import { careLinkEvents } from './careLinkEvents';
import { openPatientsForPendingAlert, openProfileForRequest } from '../Navigation/navigationRef';
import { apiService } from './apiService';
import { LocationSession, SessionDeps, SAMPLE_REQUEST_MS, FASTEST_REQUEST_MS } from './locationSession';

const CHANNEL = 'location-sharing';
let fgResolve: (() => void) | null = null;
let registered = false;

function registerFgService() {
  if (registered) return; registered = true;
  // Keeps the service (and its notification) alive until stopForeground() is called.
  notifee.registerForegroundService(() => new Promise<void>(res => { fgResolve = res; }));
}

const deps: SessionDeps = {
  now: () => Date.now(),
  async getPushToken() {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
      return await getToken(getMessaging());
    } catch { return null; }  // no google-services.json / Play services: push unavailable
  },
  async deletePushToken() { try { await deleteToken(getMessaging()); } catch { /* ignore */ } },
  registerToken: t => apiService.registerDeviceToken(t),
  unregisterToken: t => apiService.removeDeviceToken(t),
  sendFix: f => apiService.sendLocationFix(f),
  async shouldCapture(role) {
    const st = await apiService.getSharingStatus();
    if (role === 'patient') return st.role === 'patient' && st.caregivers.some(c => c.sharing);
    return st.role === 'caregiver' && st.mySharing;
  },
  async startForeground() {
    // Android 14+: a location foreground service may only start once location permission is granted, so ask first.
    const perm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (perm !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('location permission denied');
    if (Platform.OS === 'android' && Platform.Version >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
    registerFgService();
    await notifee.createChannel({ id: CHANNEL, name: 'Location sharing', importance: AndroidImportance.LOW });
    await notifee.displayNotification({
      id: 'loc-fg', title: 'Location sharing is on',
      body: 'Your location is being shared. Turn this off in the app.',
      android: { channelId: CHANNEL, asForegroundService: true, foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_LOCATION], ongoing: true, pressAction: { id: 'default' } },
    });
  },
  async stopForeground() {
    fgResolve?.(); fgResolve = null;
    try { await notifee.stopForegroundService(); await notifee.cancelNotification('loc-fg'); } catch { /* ignore */ }
  },
  async watch(onFix, onError) {
    const perm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (perm !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('location permission denied');
    Geolocation.setRNConfiguration({ skipPermissionRequests: true, authorizationLevel: 'whenInUse', locationProvider: 'playServices' });
    const id = Geolocation.watchPosition(
      p => onFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy ?? 9999, recordedAt: p.timestamp }),
      onError,
      { enableHighAccuracy: true, interval: SAMPLE_REQUEST_MS, fastestInterval: FASTEST_REQUEST_MS, distanceFilter: 0 },
    );
    return () => Geolocation.clearWatch(id);
  },
};

export const locationSession = new LocationSession(deps);

AppState.addEventListener('change', st => { if (st === 'active') locationSession.refreshCapture({ auto: true }).catch(() => {}); });

apiService.beforeLogout = () => locationSession.teardown();

const ALERT_CHANNEL = 'location-alerts';

/** A tapped alert: remember the patient for the signed-in caregiver and go to the live view. Never carries a position. */
function handleTap(data: any) {
  if (data?.kind === 'care_link_request') {
    if (locationSession.owner && locationSession.ownerRole === 'patient') { openProfileForRequest(); careLinkEvents.emit(); }
    return;
  }
  if (pushFocus.record(locationSession.owner, locationSession.ownerRole, data)) openPatientsForPendingAlert();
}

/**
 * Push listeners (call once at app start; returns an unsubscribe).
 * - Foreground: FCM does not show a tray notification while the app is open, so show a local one (signed-in account only).
 * - Tap on a local or system-tray notification (running, background or cold start): open the caregiver live view.
 * - Token refresh: re-register the new token for the signed-in account only.
 * Test build: no claim that delivery works on a given phone; that is checked on the devices.
 */
export function startPushListeners(): () => void {
  const m = getMessaging();
  const subs: Array<() => void> = [];
  try {
    subs.push(onMessage(m, async msg => {
      if (!locationSession.owner) return;
      const d: any = msg.data ?? {};
      const title = msg.notification?.title ?? 'Alzhefi alert';
      const body = msg.notification?.body ?? 'Open the app.';
      await notifee.createChannel({ id: ALERT_CHANNEL, name: 'Location alerts', importance: AndroidImportance.HIGH });
      await notifee.displayNotification({
        title, body, data: { kind: String(d.kind ?? ''), patientId: String(d.patientId ?? '') },
        android: { channelId: ALERT_CHANNEL, pressAction: { id: 'default' } },
      });
    }));
    subs.push(onNotificationOpenedApp(m, msg => handleTap(msg?.data)));
    subs.push(onTokenRefresh(m, t => { locationSession.onTokenRefreshed(t).catch(() => {}); }));
  } catch { /* no Play services / google-services: push unavailable */ }
  subs.push(notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS) handleTap(detail.notification?.data);
  }));
  // Cold start from a tapped notification.
  getInitialNotification(m).then(msg => { if (msg) handleTap(msg.data); }).catch(() => {});
  notifee.getInitialNotification().then(n => { if (n?.notification) handleTap(n.notification.data); }).catch(() => {});
  return () => subs.forEach(u => { try { u(); } catch { /* ignore */ } });
}
