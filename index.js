import {receiveLocationHealthAlert} from './Src/Services/locationHealthAlerts';
import {receiveMedicationFollowup} from './Src/Services/medicationFollowups';
import { receiveBoundaryTest } from './Src/Services/testAlerts';
import { receiveBoundaryRepeat, handleBoundaryRepeatAction } from './Src/Services/boundaryRepeatAlerts';
/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import { receiveBoundaryAlert } from './Src/Services/boundaryAlerts';
import { clearBatteryAlerts } from './Src/Services/batteryAlerts';
import notifee from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// Required top-level handlers. The system tray shows the alert while the app is in the background; nothing else runs here.
try { setBackgroundMessageHandler(getMessaging(), async msg => { if(msg?.data?.kind==='location_unavailable')await receiveLocationHealthAlert(msg.data); if(msg?.data?.kind==='medication_followup')await receiveMedicationFollowup(msg.data); if(msg?.data?.kind==='boundary_test')await receiveBoundaryTest(msg.data); if (msg?.data?.kind === 'patient_left_zone') await receiveBoundaryAlert(msg.data); if (msg?.data?.kind === 'boundary_repeat') await receiveBoundaryRepeat(msg.data); if (msg?.data?.kind === 'battery_clear') await clearBatteryAlerts(String(msg.data.patientId ?? '')); }); } catch { /* no push config */ }
notifee.onBackgroundEvent(async ({ type, detail }) => { await handleBoundaryRepeatAction(type, detail); });

AppRegistry.registerComponent(appName, () => App);
