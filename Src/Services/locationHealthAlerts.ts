import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee,{AndroidImportance,AndroidVisibility} from '@notifee/react-native';
import {apiService} from './apiService';
const ids=/^[a-f0-9]{24}$/i,seen=new Set<string>();
export async function receiveLocationHealthAlert(d:any){
 if(d?.kind!=='location_unavailable'||!ids.test(String(d.eventId))||!ids.test(String(d.recipientId)))return false;
 const before=await AsyncStorage.getItem('user');let user:any;try{user=JSON.parse(before??'null');}catch{return false;}
 const owner=String(user?.id??user?._id??'');if(user?.role!=='caregiver'||owner!==d.recipientId)return false;
 let e:any;try{e=await apiService.getLocationHealthEvent(d.eventId);}catch{return false;}
 if(before!==await AsyncStorage.getItem('user')||e.recipientId!==owner||e.eventId!==d.eventId||!ids.test(String(e.patientId))||!Number.isFinite(e.occurredAt)||Date.now()-e.occurredAt>300000||e.occurredAt>Date.now()+30000||(e.lastFreshAt!==null&&!Number.isFinite(e.lastFreshAt)))return false;
 await notifee.createChannel({id:'location-health-v1',name:'Location update warnings',importance:AndroidImportance.HIGH,sound:'default'});
 if(before!==await AsyncStorage.getItem('user')||seen.has(e.eventId))return false;
 seen.add(e.eventId);if(seen.size>100)seen.delete(seen.values().next().value!);
 await notifee.displayNotification({id:'location-health-'+e.eventId,title:'Location updates stopped',body:e.lastFreshAt===null?'No fresh location received since sharing started. Open AlzheFi to check.':`Last fresh location: ${new Date(e.lastFreshAt).toLocaleString()}. This is not a boundary alert.`,data:{kind:'location_unavailable',eventId:e.eventId,patientId:e.patientId,recipientId:e.recipientId},android:{channelId:'location-health-v1',visibility:AndroidVisibility.PRIVATE,pressAction:{id:'default',launchActivity:'default'},timeoutAfter:300000}});return true;
}
export async function clearLocationHealthAlerts(){const displayed=await notifee.getDisplayedNotifications();for(const n of displayed)if(n.id?.startsWith('location-health-'))await notifee.cancelNotification(n.id);seen.clear();}
