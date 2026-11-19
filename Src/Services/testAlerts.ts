import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {AndroidImportance, AndroidVisibility, TriggerType} from '@notifee/react-native';
import {fullScreenAllowed} from './boundaryAlerts';
const ID='local-alert-test';
const listeners=new Set<(owner:string,source?:string)=>void>();
export const testAlerts={subscribe(fn:(owner:string,source?:string)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}};
async function caregiver(){let u:any;try{u=JSON.parse(await AsyncStorage.getItem('user')??'null');}catch{}if(u?.role!=='caregiver'||!(u.id??u._id))throw new Error('Sign in as a caregiver first.');return String(u.id??u._id);}
export async function showTestAlert(){const owner=await caregiver();listeners.forEach(fn=>fn(owner));}
export async function cancelTestAlert(){await notifee.cancelNotification(ID);await notifee.cancelTriggerNotification(ID);}
export async function scheduleTestAlert(){
 const owner=await caregiver();const fsi=await fullScreenAllowed();
 await notifee.createChannel({id:'boundary-alerts-v1',name:'Boundary alerts',importance:AndroidImportance.HIGH,sound:'default',vibration:true});
 if(owner!==await caregiver())throw new Error('Account changed. Try again.');
 await cancelTestAlert();
 await notifee.createTriggerNotification({id:ID,title:'TEST ONLY - AlzheFi alert',body:'Local display test. No patient exit occurred. This does not test push delivery.',data:{kind:'local_alert_test'},android:{channelId:'boundary-alerts-v1',visibility:AndroidVisibility.PRIVATE,smallIcon:'ic_launcher',pressAction:{id:'test',launchActivity:'default'},...(fsi?{fullScreenAction:{id:'test',launchActivity:'com.alzhefi.BoundaryAlertTestActivity'}}:{}),timeoutAfter:60000}},{type:TriggerType.TIMESTAMP,timestamp:Date.now()+15000});
 return fsi;
}

const receivedRuns=new Set<string>();
export async function receiveBoundaryTest(data:any){
 if(data?.kind!=='boundary_test'||!/^[a-f0-9]{24}$/i.test(String(data.runId)))return false;
 let owner:string;try{owner=await caregiver();}catch{return false;}if(owner!==data.recipientId)return false;
 if(receivedRuns.has(data.runId))return true;
 const {apiService}=require('./apiService');
 const run=await apiService.readBoundaryTest(data.runId);if(!['dispatching','provider_accepted','received'].includes(run.status)||Date.now()-run.startedAt>300000)return false;
 if(owner!==await caregiver())return false;
 const {AppState}=require('react-native');
 if(AppState.currentState==='active')listeners.forEach(fn=>fn(owner,'synthetic'));
 const fsi=AppState.currentState!=='active'&&await fullScreenAllowed();
 await notifee.createChannel({id:'boundary-alerts-v1',name:'Boundary alerts',importance:AndroidImportance.HIGH,sound:'default',vibration:true});
 const android:any={channelId:'boundary-alerts-v1',visibility:AndroidVisibility.PRIVATE,smallIcon:'ic_launcher',pressAction:{id:'test',launchActivity:'default'},timeoutAfter:60000};
 if(fsi)android.fullScreenAction={id:'test',launchActivity:'com.alzhefi.BoundaryAlertTestActivity'};
 if(owner!==await caregiver())return false;
 const notification={id:'boundary-simulation-test',title:'TEST ONLY - simulated boundary exit',body:'Synthetic detector test received. No patient exit occurred.',data:{kind:'boundary_test'},android};
 try{await notifee.displayNotification(notification);}catch(e){if(!fsi)throw e;delete android.fullScreenAction;await notifee.displayNotification(notification);}
 receivedRuns.add(data.runId);if(receivedRuns.size>30)receivedRuns.delete(receivedRuns.values().next().value!);
 await apiService.ackBoundaryTest(data.runId);return true;
}
