/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

import notifee from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

// Required top-level handlers. The system tray shows the alert while the app is in the background; nothing else runs here.
try { setBackgroundMessageHandler(getMessaging(), async () => {}); } catch { /* no push config */ }
notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent(appName, () => App);
