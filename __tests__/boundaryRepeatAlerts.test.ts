jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@notifee/react-native', () => ({ __esModule:true,default:{createChannel:jest.fn(async()=>{}),displayNotification:jest.fn(async()=>{}),cancelNotification:jest.fn(async()=>{})},AndroidImportance:{HIGH:4},AndroidVisibility:{PRIVATE:0},EventType:{ACTION_PRESS:1,PRESS:0,DISMISS:2} }));
jest.mock('../Src/Services/apiService',()=>({apiService:{getBoundaryRepeatEvent:jest.fn(),stopBoundaryRepeat:jest.fn()}}));
jest.mock('../Src/Services/boundaryAlerts',()=>({fullScreenAllowed:jest.fn(async()=>true)}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { apiService } from '../Src/Services/apiService';
import { fullScreenAllowed } from '../Src/Services/boundaryAlerts';
import { receiveBoundaryRepeat, stopBoundaryRepeat, handleBoundaryRepeatAction, boundaryRepeatAlerts, repeatText } from '../Src/Services/boundaryRepeatAlerts';
let n=0;
const owner='aaaaaaaaaaaaaaaaaaaaaaaa',patient='bbbbbbbbbbbbbbbbbbbbbbbb',episode='dddddddddddddddddddddddd';
let data:any,event:any;
beforeEach(async()=>{
  jest.clearAllMocks();
  data={kind:'boundary_repeat',eventId:(++n).toString(16).padStart(24,'0'),recipientId:owner,episodeId:episode};
  event={eventId:data.eventId,episodeId:episode,recipientId:owner,patientId:patient,occurredAt:Date.now(),kind:'outside_reminder',lastSeen:{lat:10.004,lon:76,accuracyM:10,recordedAt:Date.now()-60000},openedAt:Date.now()-600000,stopped:false};
  await AsyncStorage.setItem('user',JSON.stringify({id:owner,role:'caregiver'}));
  (apiService.getBoundaryRepeatEvent as jest.Mock).mockResolvedValue(event);
  (apiService.stopBoundaryRepeat as jest.Mock).mockResolvedValue({episodeId:episode,stopped:true,closed:null});
  (fullScreenAllowed as jest.Mock).mockResolvedValue(true);
  Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});
});
test('foreground repeat emits the overlay event and keeps a notification fallback with Stop',async()=>{
  const listener=jest.fn(),un=boundaryRepeatAlerts.subscribe(listener);
  expect(await receiveBoundaryRepeat(data)).toBe(true);
  expect(listener).toHaveBeenCalledWith(event);
  expect(notifee.displayNotification).toHaveBeenCalledWith(expect.objectContaining({
    id:'boundary-repeat-'+event.eventId,
    android:expect.objectContaining({actions:[{title:'Stop alerts',pressAction:{id:'stop-boundary-repeat'}}]}),
  }));
  un();
});
test('background with full-screen access reuses the boundary takeover activity',async()=>{
  Object.defineProperty(AppState,'currentState',{value:'background'});
  await receiveBoundaryRepeat(data);
  expect(notifee.displayNotification).toHaveBeenCalledWith(expect.objectContaining({android:expect.objectContaining({fullScreenAction:{id:'boundary',launchActivity:'com.alzhefi.BoundaryAlertActivity'}})}));
});
test('denied full-screen access still shows the notification with Stop',async()=>{
  Object.defineProperty(AppState,'currentState',{value:'background'});
  (fullScreenAllowed as jest.Mock).mockResolvedValue(false);
  await receiveBoundaryRepeat(data);
  const call=(notifee.displayNotification as jest.Mock).mock.calls[0][0];
  expect(call.android.fullScreenAction).toBeUndefined();
  expect(call.android.actions[0].pressAction.id).toBe('stop-boundary-repeat');
});
test('wrong account, patient role, stopped or server-rejected events show nothing',async()=>{
  await AsyncStorage.setItem('user',JSON.stringify({id:owner,role:'patient'}));
  expect(await receiveBoundaryRepeat(data)).toBe(false);
  await AsyncStorage.setItem('user',JSON.stringify({id:'cccccccccccccccccccccccc',role:'caregiver'}));
  expect(await receiveBoundaryRepeat(data)).toBe(false);
  expect(apiService.getBoundaryRepeatEvent).not.toHaveBeenCalled();
  await AsyncStorage.setItem('user',JSON.stringify({id:owner,role:'caregiver'}));
  (apiService.getBoundaryRepeatEvent as jest.Mock).mockResolvedValue({...event,stopped:true});
  expect(await receiveBoundaryRepeat(data)).toBe(false);
  (apiService.getBoundaryRepeatEvent as jest.Mock).mockRejectedValue({response:{status:404}});
  expect(await receiveBoundaryRepeat(data)).toBe(false);
  expect(notifee.displayNotification).not.toHaveBeenCalled();
});
test('episode/recipient mismatch between push and server event shows nothing',async()=>{
  (apiService.getBoundaryRepeatEvent as jest.Mock).mockResolvedValue({...event,episodeId:'eeeeeeeeeeeeeeeeeeeeeeee'});
  expect(await receiveBoundaryRepeat(data)).toBe(false);
  expect(notifee.displayNotification).not.toHaveBeenCalled();
});
test('same reminder cannot repeatedly take over the screen',async()=>{
  await receiveBoundaryRepeat(data);await receiveBoundaryRepeat(data);
  expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
});
test('reminder copy: outside says still outside; unresolved carries last-seen time and no live-position claim',async()=>{
  expect(repeatText(event).body).toContain('still outside');
  const stale=repeatText({...event,kind:'unresolved_reminder',lastSeen:{lat:10,lon:76,accuracyM:10,recordedAt:1700000000000}});
  expect(stale.body).toContain('Last seen outside at');
  expect(stale.body).toContain(new Date(1700000000000).toLocaleString());
  expect(stale.body).toContain('location is unavailable');
  expect(stale.body).toContain('not their live position');
});
test('Stop calls the server for this episode and clears the reminder; failure throws and keeps it',async()=>{
  await stopBoundaryRepeat(episode,event.eventId);
  expect(apiService.stopBoundaryRepeat).toHaveBeenCalledWith(episode);
  expect(notifee.cancelNotification).toHaveBeenCalledWith('boundary-repeat-'+event.eventId);
  (apiService.stopBoundaryRepeat as jest.Mock).mockRejectedValue(new Error('offline'));
  await expect(stopBoundaryRepeat(episode,event.eventId)).rejects.toThrow();
});
test('notification Stop action stops and dismisses; a failed Stop honestly says Not stopped yet',async()=>{
  const detail={pressAction:{id:'stop-boundary-repeat'},notification:{id:'boundary-repeat-'+event.eventId,data:{episodeId:episode,eventId:event.eventId}}};
  expect(await handleBoundaryRepeatAction(EventType.ACTION_PRESS,detail)).toBe(true);
  expect(apiService.stopBoundaryRepeat).toHaveBeenCalledWith(episode);
  expect(notifee.cancelNotification).toHaveBeenCalledWith('boundary-repeat-'+event.eventId);
  (apiService.stopBoundaryRepeat as jest.Mock).mockRejectedValue(new Error('offline'));
  await handleBoundaryRepeatAction(EventType.ACTION_PRESS,detail);
  expect(notifee.displayNotification).toHaveBeenCalledWith(expect.objectContaining({
    body:'Not stopped yet. Check your connection and tap Stop alerts again.',
    android:expect.objectContaining({actions:[{title:'Stop alerts',pressAction:{id:'stop-boundary-repeat'}}]}),
  }));
  expect(await handleBoundaryRepeatAction(EventType.DISMISS,detail)).toBe(false);
});
