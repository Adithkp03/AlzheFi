import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { getMessaging, getToken, deleteToken } from '@react-native-firebase/messaging';
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
    registerFgService();
    await notifee.createChannel({ id: CHANNEL, name: 'Location sharing', importance: AndroidImportance.LOW });
    await notifee.displayNotification({
      id: 'loc-fg', title: 'Location sharing is on',
      body: 'Your location is being shared. Turn this off in the app.',
      android: { channelId: CHANNEL, asForegroundService: true, ongoing: true, pressAction: { id: 'default' } },
    });
  },
  async stopForeground() {
    fgResolve?.(); fgResolve = null;
    try { await notifee.stopForegroundService(); await notifee.cancelNotification('loc-fg'); } catch { /* ignore */ }
  },
  async watch(onFix, onError) {
    const perm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (perm !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('location permission denied');
    Geolocation.setRNConfiguration({ skipPermissionRequests: true, authorizationLevel: 'whenInUse', locationProvider: 'auto' });
    const id = Geolocation.watchPosition(
      p => onFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy ?? 9999, recordedAt: p.timestamp }),
      onError,
      { enableHighAccuracy: true, interval: SAMPLE_REQUEST_MS, fastestInterval: FASTEST_REQUEST_MS, distanceFilter: 0 },
    );
    return () => Geolocation.clearWatch(id);
  },
};

export const locationSession = new LocationSession(deps);

apiService.beforeLogout = () => locationSession.teardown();
