const cancelled: Array<[string, string | undefined]> = [];
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    getDisplayedNotifications: async () => [
      { id: '0', notification: { android: { tag: 'battery-low-aaa' }, title: 'x' } },                 // OS-drawn from the push
      { id: '8123', notification: { id: 'battery-low-aaa', data: { kind: 'battery_low' } } },          // drawn by the app (foreground)
      { id: '77', notification: { id: 'x', data: { kind: 'patient_left_zone' } } },                    // must stay
      { id: '5', notification: { id: 'loc-fg', android: {} } },                                        // foreground service, must stay
    ],
    cancelDisplayedNotification: async (id: string, tag?: string) => { cancelled.push([id, tag]); },
  },
}));
import { clearBatteryAlerts } from '../Src/Services/batteryAlerts';

test('clear removes only battery alerts, by the numeric id and tag the OS reports, on both draw paths', async () => {
  await clearBatteryAlerts('aaa');
  expect(cancelled).toEqual([['0', 'battery-low-aaa'], ['8123', undefined]]);
});
