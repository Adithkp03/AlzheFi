import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../Context/AuthContext';
import { boundaryAlerts, BoundaryEvent } from '../../Services/boundaryAlerts';
import { apiService } from '../../Services/apiService';
import { pushFocus } from '../../Services/pushFocus';
import { openPatientsForPendingAlert } from '../../Navigation/navigationRef';
export default function BoundaryAlertOverlay() {
  const { state } = useAuth();
  const owner = state.user?.id ?? state.user?._id;
  const [event, setEvent] = useState<BoundaryEvent | null>(null);
  useEffect(() => boundaryAlerts.subscribe(setEvent), []);
  useEffect(() => { setEvent(null); }, [owner, state.userToken]);
  useEffect(() => {
    if (!event) return;
    let active = true;
    const check = async () => { try { await apiService.getBoundaryAlert(event.eventId); } catch { if(active) setEvent(null); } };
    const id=setInterval(check,8000); const expiry=setTimeout(()=>setEvent(null),Math.max(0,event.occurredAt+300000-Date.now()));
    return () => { active=false;clearInterval(id);clearTimeout(expiry); };
  },[event]);
  const shown=event && state.user?.role==='caregiver' && event.recipientId===owner;
  return <Modal visible={!!shown} onRequestClose={()=>setEvent(null)} animationType="fade"><View style={s.page}>
    <Text style={s.title}>Boundary alert</Text><Text style={s.body}>A confirmed safe-area exit was reported. Check the patient's current location and contact them if needed.</Text>
    <Text style={s.body}>This event does not guarantee their current position. Do not rely on this test app as an emergency monitor.</Text>
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>{if(event)pushFocus.record(owner??null,'caregiver',{kind:'patient_left_zone',patientId:event.patientId});setEvent(null);openPatientsForPendingAlert();}}><Text style={s.label}>View current status</Text></TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={s.button} onPress={()=>setEvent(null)}><Text style={s.label}>Dismiss</Text></TouchableOpacity>
  </View></Modal>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#FFF4EE',justifyContent:'center',padding:28,gap:24},title:{fontSize:34,fontWeight:'700',color:'#8B1E1E'},body:{fontSize:18,lineHeight:27,color:'#1F2937'},button:{padding:16,borderRadius:12,backgroundColor:'#E3F73F',alignItems:'center'},label:{fontSize:18,fontWeight:'700',color:'#1F2937'}});
