import AsyncStorage from '@react-native-async-storage/async-storage';
import {NativeModules,Platform} from 'react-native';
import notifee,{AndroidImportance,AndroidNotificationSetting,AndroidVisibility,TriggerType} from '@notifee/react-native';
import {medicationSettings,medicineQueue} from './medicationReminders';
const prefix='med-refill-';
async function owns(owner:string){const u=JSON.parse(await AsyncStorage.getItem('user')??'null');return u?.role==='patient'&&String(u.id??u._id)===owner;}
export async function saveLocalMedicationPhoto(owner:string,plan:string,data:string){if(!await owns(owner))throw Error('Account changed');if(!NativeModules.LocationTracking?.saveMedicationPhoto)throw Error('Encrypted local photo unavailable');await NativeModules.LocationTracking.saveMedicationPhoto(owner,plan,data);}
export async function loadLocalMedicationPhoto(owner:string,plan:string){if(!await owns(owner)||!NativeModules.LocationTracking?.loadMedicationPhoto)return '';const data=await NativeModules.LocationTracking.loadMedicationPhoto(owner,plan);return await owns(owner)?data:'';}
export async function clearRefillReminders(){for(const id of [...await notifee.getTriggerNotificationIds(),...(await notifee.getDisplayedNotifications()).map(x=>x.id).filter((x):x is string=>!!x)])if(id.startsWith(prefix))await notifee.cancelNotification(id);}
export function syncRefillReminders(owner:string,plans:any[]){return medicineQueue(async()=>{
 if(!await owns(owner))return '';const pref=await medicationSettings(owner);if(!pref.enabled){await clearRefillReminders();return 'No refill reminders queued.';}
 const settings=await notifee.getNotificationSettings();if(settings.authorizationStatus<1||Platform.OS==='android'&&Number(Platform.Version)>=31&&settings.android.alarm!==AndroidNotificationSetting.ENABLED){await clearRefillReminders();return 'No refill reminders queued.';}
 const all=await notifee.getTriggerNotificationIds(),available=Math.max(0,48-all.filter(id=>!id.startsWith(prefix)).length);
 const upcoming=plans.filter(p=>p.active&&Number.isFinite(p.refillAt)&&p.refillAt>Date.now()+1000).sort((a,b)=>a.refillAt-b.refillAt).slice(0,available),wanted=new Set(upcoming.map(p=>prefix+p._id));
 for(const id of all)if(id.startsWith(prefix)&&!wanted.has(id))await notifee.cancelNotification(id);
 await notifee.createChannel({id:'medication-refill-v1',name:'Medicine supply checks',importance:AndroidImportance.HIGH,sound:'default'});
 for(const p of upcoming){if(!await owns(owner)||!(await medicationSettings(owner)).enabled)return '';await notifee.createTriggerNotification({id:prefix+p._id,title:'Check medicine supply',body:'Open AlzheFi to review your chosen refill reminder. This does not renew a prescription.',data:{kind:'medication_due',patientId:owner},android:{channelId:'medication-refill-v1',visibility:AndroidVisibility.PRIVATE,smallIcon:'ic_launcher',pressAction:{id:'default',launchActivity:'default'},timeoutAfter:3600000}},{type:TriggerType.TIMESTAMP,timestamp:p.refillAt,alarmManager:{allowWhileIdle:true}});}
 return `${upcoming.length} optional refill checks queued on this phone. ${plans.filter(p=>p.active&&Number.isFinite(p.refillAt)&&p.refillAt>Date.now()).length>upcoming.length?'Some refill checks could not fit the shared phone alarm limit.':''}`;
});}
