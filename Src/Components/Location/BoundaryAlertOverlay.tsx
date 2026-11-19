import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../Context/AuthContext';
import { boundaryAlerts, BoundaryEvent } from '../../Services/boundaryAlerts';
import { boundaryRepeatAlerts, BoundaryRepeatEvent, repeatText, stopBoundaryRepeat } from '../../Services/boundaryRepeatAlerts';
import { testAlerts } from '../../Services/testAlerts';
import { apiService } from '../../Services/apiService';
import { pushFocus } from '../../Services/pushFocus';
import { openPatientsForPendingAlert } from '../../Navigation/navigationRef';
export default function BoundaryAlertOverlay() {
  const { state } = useAuth();
  const owner = state.user?.id ?? state.user?._id;
  const [testSource,setTestSource]=useState('local');
  const [testOwner,setTestOwner]=useState<string|null>(null);
  const [event, setEvent] = useState<BoundaryEvent | null>(null);
  const [repeat, setRepeat] = useState<BoundaryRepeatEvent | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopFailed, setStopFailed] = useState(false);
  useEffect(()=>testAlerts.subscribe((id,source)=>{if(!event){setTestOwner(id);setTestSource(source??'local');}}),[event]);
  useEffect(() => boundaryAlerts.subscribe(next=>{setTestOwner(null);setRepeat(null);setEvent(next);}), []);
  useEffect(() => boundaryRepeatAlerts.subscribe(next=>{setTestOwner(null);setEvent(null);setStopFailed(false);setRepeat(next);}), []);
  useEffect(() => { setEvent(null);setTestOwner(null);setRepeat(null);setStopFailed(false); }, [owner, state.userToken]);
  useEffect(() => {
    if (!event) return;
    let active = true;
    const check = async () => { try { await apiService.getBoundaryAlert(event.eventId); } catch { if(active) setEvent(null); } };
    const id=setInterval(check,8000); const expiry=setTimeout(()=>setEvent(null),Math.max(0,event.occurredAt+300000-Date.now()));
    return () => { active=false;clearInterval(id);clearTimeout(expiry); };
  },[event]);
  useEffect(() => {
    if (!repeat) return;
    let active = true;
    // The crossing can close (patient back inside, zone changed, sharing off) or be stopped elsewhere.
    const check = async () => { try { const e = await apiService.getBoundaryRepeatEvent(repeat.eventId); if (active && e.stopped) setRepeat(null); } catch { if (active) setRepeat(null); } };
    const id = setInterval(check, 30000);
    return () => { active = false; clearInterval(id); };
  },[repeat]);
  const stopRepeats = async () => {
    if (!repeat || stopBusy) return;
    setStopBusy(true); setStopFailed(false);
    try { await stopBoundaryRepeat(repeat.episodeId, repeat.eventId); setRepeat(null); }
    catch { setStopFailed(true); }
    finally { setStopBusy(false); }
  };
  const isTest=testOwner===owner && !!owner && state.user?.role==='caregiver';
  const shown=isTest || event && state.user?.role==='caregiver' && event.recipientId===owner || repeat && state.user?.role==='caregiver' && repeat.recipientId===owner;
  const repeatCopy = repeat ? repeatText(repeat) : null;
  return <Modal visible={!!shown} onRequestClose={()=>{setEvent(null);setTestOwner(null);setRepeat(null);}} animationType="fade"><View style={s.page}>
    <Text style={s.title}>{isTest ? 'TEST ONLY' : 'Boundary alert'}</Text><Text style={s.body}>{isTest ? (testSource==='synthetic'?'Synthetic boundary diagnostic received. No patient exit occurred.':'Local full-screen display test. No patient exit occurred.') : repeat ? repeatCopy!.body : "A confirmed safe-area exit was reported. Check the patient's current location and contact them if needed."}</Text>
    <Text style={s.body}>{isTest ? (testSource==='synthetic'?'The synthetic detector confirmed an exit and this app handled the diagnostic push. This does not test real GPS, patient consent or real patient-event dispatch.':'This tests the screen only, not boundary detection or push delivery.') : repeat ? 'This reminder repeats every 10 minutes until you stop it or a fresh fix confirms they are back inside. It is not a guarantee of their current position.' : 'This event does not guarantee their current position. Do not rely on this test app as an emergency monitor.'}</Text>
    {!isTest && <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>{if(event)pushFocus.record(owner??null,'caregiver',{kind:'patient_left_zone',patientId:event.patientId});setEvent(null);setRepeat(null);openPatientsForPendingAlert();}}><Text style={s.label}>View current status</Text></TouchableOpacity>}
    {!!repeat && <TouchableOpacity accessibilityRole="button" disabled={stopBusy} style={s.button} onPress={stopRepeats}><Text style={s.label}>{stopBusy ? 'Stopping...' : 'Stop these alerts'}</Text></TouchableOpacity>}
    {!!repeat && stopFailed && <Text style={s.stopError}>Not stopped yet. Check your connection and try again.</Text>}
    {!!repeat && <Text style={s.hint}>Stopping silences only your alerts for this crossing. Dismiss keeps the 10-minute reminders on.</Text>}
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>{setEvent(null);setTestOwner(null);setRepeat(null);}}><Text style={s.label}>Dismiss</Text></TouchableOpacity>
  </View></Modal>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#FFF4EE',justifyContent:'center',padding:28,gap:24},title:{fontSize:34,fontWeight:'700',color:'#8B1E1E'},body:{fontSize:18,lineHeight:27,color:'#1F2937'},button:{padding:16,borderRadius:12,backgroundColor:'#E3F73F',alignItems:'center'},label:{fontSize:18,fontWeight:'700',color:'#1F2937'},stopError:{fontSize:16,fontWeight:'700',color:'#8B1E1E',textAlign:'center'},hint:{fontSize:14,lineHeight:20,color:'#6B7280',textAlign:'center'}});
