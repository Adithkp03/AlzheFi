import notifee from '@notifee/react-native';

/**
 * Remove a shown low-battery alert on this phone (patient or caregiver). Called when the phone is charging (patient),
 * and when the server sends a data-only "clear" (both phones). Best effort: if the OS or the phone's state does not
 * let the app run (killed app, battery restrictions, offline), an alert already in the tray stays until dismissed.
 */
export async function clearBatteryAlerts(patientId?: string): Promise<void> {
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
  if (patientId) { try { await notifee.cancelDisplayedNotification(`battery-low-${patientId}`); } catch { /* ignore */ } }
}
