import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../Context/AuthContext';
import { boundaryAlerts, BoundaryEvent } from '../../Services/boundaryAlerts';
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
  useEffect(()=>testAlerts.subscribe((id,source)=>{if(!event){setTestOwner(id);setTestSource(source??'local');}}),[event]);
  useEffect(() => boundaryAlerts.subscribe(next=>{setTestOwner(null);setEvent(next);}), []);
  useEffect(() => { setEvent(null);setTestOwner(null); }, [owner, state.userToken]);
  useEffect(() => {
    if (!event) return;
    let active = true;
    const check = async () => { try { await apiService.getBoundaryAlert(event.eventId); } catch { if(active) setEvent(null); } };
    const id=setInterval(check,8000); const expiry=setTimeout(()=>setEvent(null),Math.max(0,event.occurredAt+300000-Date.now()));
    return () => { active=false;clearInterval(id);clearTimeout(expiry); };
  },[event]);
  const isTest=testOwner===owner && !!owner && state.user?.role==='caregiver';
  const shown=isTest || event && state.user?.role==='caregiver' && event.recipientId===owner;
  return <Modal visible={!!shown} onRequestClose={()=>{setEvent(null);setTestOwner(null);}} animationType="fade"><View style={s.page}>
    <Text style={s.title}>{isTest ? 'TEST ONLY' : 'Boundary alert'}</Text><Text style={s.body}>{isTest ? (testSource==='synthetic'?'Synthetic boundary diagnostic received. No patient exit occurred.':'Local full-screen display test. No patient exit occurred.') : "A confirmed safe-area exit was reported. Check the patient's current location and contact them if needed."}</Text>
    <Text style={s.body}>{isTest ? (testSource==='synthetic'?'The synthetic detector confirmed an exit and this app handled the diagnostic push. This does not test real GPS, patient consent or real patient-event dispatch.':'This tests the screen only, not boundary detection or push delivery.') : 'This event does not guarantee their current position. Do not rely on this test app as an emergency monitor.'}</Text>
    {!isTest && <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>{if(event)pushFocus.record(owner??null,'caregiver',{kind:'patient_left_zone',patientId:event.patientId});setEvent(null);openPatientsForPendingAlert();}}><Text style={s.label}>View current status</Text></TouchableOpacity>}
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>{setEvent(null);setTestOwner(null);}}><Text style={s.label}>Dismiss</Text></TouchableOpacity>
  </View></Modal>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#FFF4EE',justifyContent:'center',padding:28,gap:24},title:{fontSize:34,fontWeight:'700',color:'#8B1E1E'},body:{fontSize:18,lineHeight:27,color:'#1F2937'},button:{padding:16,borderRadius:12,backgroundColor:'#E3F73F',alignItems:'center'},label:{fontSize:18,fontWeight:'700',color:'#1F2937'}});
