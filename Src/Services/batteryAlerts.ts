import notifee from '@notifee/react-native';

/**
 * Matching: an alert the app drew itself (foreground) carries data.kind 'battery_low'; one the OS drew from the push
 * has android.tag 'battery-low-<patientId>' (set by the server). Cancelling uses the numeric id and tag that
 * getDisplayedNotifications reports for the posted notification (the installed notifee core parses ids as integers),
 * never a made-up string id. Source-read only, not run on a device.
 *
 * Remove a shown low-battery alert on this phone (patient or caregiver). Called when the phone is charging (patient),
 * and when the server sends a data-only "clear" (both phones). Best effort: if the OS or the phone's state does not
 * let the app run (killed app, battery restrictions, offline), an alert already in the tray stays until dismissed.
 */
export async function clearBatteryAlerts(_patientId?: string): Promise<void> {
  try {
    const shown: any[] = await notifee.getDisplayedNotifications();
    for (const d of shown) {
      const n = d?.notification ?? {};
      const tag = n?.android?.tag ?? d?.tag;
      const id = String(d?.id ?? n?.id ?? '');
      const isBattery = n?.data?.kind === 'battery_low' || String(tag ?? '').startsWith('battery-low') || id.startsWith('battery-low');
      if (isBattery) { try { await notifee.cancelDisplayedNotification(id, tag); } catch { /* ignore */ } }
    }
  } catch { /* ignore */ }
}
