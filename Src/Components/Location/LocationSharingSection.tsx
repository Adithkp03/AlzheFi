import React, { useCallback, useEffect, useState, useRef } from 'react';
import { getMessaging,getToken } from '@react-native-firebase/messaging';
import { AppState } from 'react-native';
import { careLinkEvents, AUTO_REFRESH_MS } from '../../Services/careLinkEvents';
import { View, Text, StyleSheet, Switch, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { apiService } from '../../Services/apiService';
import { SharingStatus, BatteryReading } from '../../Types';
import { locationSession, batteryReporter } from '../../Services/locationNative';
import { pushFocus } from '../../Services/pushFocus';
import { showTestAlert,scheduleTestAlert,cancelTestAlert } from '../../Services/testAlerts';
import { fullScreenAllowed, notificationsEnabled, openFullScreenSettings, disableFullScreenAlerts } from '../../Services/boundaryAlerts';
import LiveLocationCard from './LiveLocationCard';
import { YELLOW, DARK, MUTED, BORDER, WHITE, DANGER } from '../CareLinks/theme';

/**
 * Location sharing controls. Hidden entirely when the server has the feature off (404).
 * Patient: choose which linked caregiver may see where you are; one switch turns everything off.
 * Caregiver: your own switch for "nearby" alerts; the primary caregiver can set the safe-area boundary.
 * Test-only build: values and behaviour are not clinically validated.
 */
export default function LocationSharingSection() {
  const [testRun,setTestRun]=useState<any>(null);
  const [testBusy,setTestBusy]=useState(false);
  const [testError,setTestError]=useState('');
  const testAction=async(fn:()=>Promise<any>)=>{setTestBusy(true);setTestError('');try{setTestRun(await fn());}catch(e:any){setTestError(e?.response?.status===409?'Wait at least 60 seconds from starting, then confirm.':'Test request failed. No patient boundary was changed. Try checking the result.');}finally{setTestBusy(false);}};
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [fsi, setFsi] = useState(false);
  useEffect(() => { const check=()=>{fullScreenAllowed().then(setFsi);notificationsEnabled().then(setNotificationsOn);};check();const sub=AppState.addEventListener('change',x=>{if(x==='active')check();});return ()=>sub.remove(); }, []);
  const [st, setSt] = useState<SharingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [off, setOff] = useState(false);          // feature disabled on server
  const [busy, setBusy] = useState(false);
  const [batt, setBatt] = useState<Record<string, BatteryReading>>({});
  const loadInFlight = useRef(false);
  const zoneRequest = useRef(0);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState('');
  const [saved, setSaved] = useState('');
  const [zoneVersion, setZoneVersion] = useState(0);
  const [zoneFor, setZoneFor] = useState<string | null>(null);
  const [form, setForm] = useState({ lat: '', lon: '', radiusM: '300' });

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const next = await apiService.getSharingStatus(); setSt(next); setOff(false); setLoadError(false);
      if (next.role === 'caregiver') {
        const entries = await Promise.all(next.patients.filter(p => p.role === 'primary' && p.batteryShared).map(async p => [p.patientId, await apiService.getBattery(p.patientId).catch(() => ({ status: 'unknown' } as BatteryReading))] as const));
        setBatt(Object.fromEntries(entries));
      }
    }
    catch (e: any) { if (e?.response?.status === 404) setOff(true); else { setSt(null); setLoadError(true); } }
    finally { loadInFlight.current = false; }
    locationSession.ensurePushRegistered().catch(() => {});
    batteryReporter.reconcile().catch(() => {});
    // Reconcile the phone's tracker with the server's consent state (starts only with an active grant, stops when revoked).
    locationSession.refreshCapture({ auto: true }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => { if (AppState.currentState === 'active') load(); }, AUTO_REFRESH_MS);
    const app = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    const unsub = careLinkEvents.subscribe(load);
    return () => { clearInterval(id); app.remove(); unsub(); };
  }, [load]);

  // A tapped "left the safe area" alert for the signed-in caregiver: show that patient first (the server still decides access).
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    const take = () => { const id = pushFocus.consume(locationSession.owner); if (id) { setFocusId(id); load(); } };
    take();
    return pushFocus.subscribe(take);
  }, [load]);

  const act = async (fn: () => Promise<void>, fail: string) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { Alert.alert('Not done', e?.response?.data?.error ?? fail); }
    finally {
      setBusy(false); await load();
      await locationSession.refreshCapture().catch(() => {});
      if (locationSession.lastError) Alert.alert('Location not started', locationSession.lastError + ' Allow location for this app in Settings, then turn sharing off and on again.');
    }
  };

  useEffect(() => () => { zoneRequest.current++; }, []);
  const openZone = async (patientId: string) => {
    const request = ++zoneRequest.current;
    setZoneFor(patientId); setZoneLoading(true); setZoneError(''); setSaved('');
    setForm({ lat: '', lon: '', radiusM: '300' });
    // Read in parallel. Do not let a slow zone request postpone the live read.
    const [zone, live] = await Promise.allSettled([
      apiService.getZone(patientId), apiService.getLiveLocation(patientId),
    ]);
    if (request !== zoneRequest.current) return;
    if (zone.status === 'rejected') {
      // Never overwrite an existing boundary just because its read failed.
      setZoneError('Could not read the saved safe area. Retry before editing.');
    } else if (zone.value) {
      const z = zone.value;
      setForm({ lat: String(z.lat), lon: String(z.lon), radiusM: String(z.radiusM) });
    } else if (live.status === 'fulfilled' && live.value.status === 'live') {
      setForm({ lat: live.value.lat.toFixed(5), lon: live.value.lon.toFixed(5), radiusM: '300' });
    }
    setZoneLoading(false);
  };
  const saveZone = async () => {
    if (busy || zoneLoading || zoneError || !zoneFor) return;
    const nums = [form.lat, form.lon, form.radiusM].map(v => (v.trim() === '' ? NaN : Number(v)));
    if (nums.some(n => !Number.isFinite(n)) || Math.abs(nums[0]) > 90 || Math.abs(nums[1]) > 180 || nums[2] < 100 || nums[2] > 5000 || (nums[0] === 0 && nums[1] === 0)) {
      Alert.alert('Check the safe area', 'Enter a valid latitude, longitude and radius from 100 to 5000 metres. 0, 0 is not a real centre.'); return;
    }
    const id = zoneFor, request = zoneRequest.current;
    setBusy(true); setSaved('');
    try {
      await apiService.setZone(id, { lat: nums[0], lon: nums[1], radiusM: nums[2] });
      if (request === zoneRequest.current) { setZoneFor(null); setSaved('Safe area saved.'); setZoneVersion(v => v + 1); }
    } catch { Alert.alert('Not saved', 'Could not confirm the safe-area save. Reopen it to check the saved values before trying again.'); }
    finally { setBusy(false); }
  };

  if (loadError) return <View style={s.pad}><Text style={s.note}>Could not load location sharing. No position is shown.</Text><TouchableOpacity onPress={load}><Text style={s.note}>Retry location sharing</Text></TouchableOpacity></View>;
  if (off || !st) return st === null && !off ? <View style={s.pad}><ActivityIndicator color={DARK} /></View> : null;

  return (
    <View style={s.section} testID="location-sharing">
      <Text style={s.title}>Location sharing</Text>
      <Text style={s.note} testID="push-status">{locationSession.pushStatus}</Text>
      <View style={s.card}>
        {st.role === 'patient' ? (
          <>
            <Text style={s.note}>Turn this on for a caregiver you trust. It stays on until you turn it off. They are told when you leave the safe area their primary caregiver set, and you are told when a caregiver who also shares is nearby.</Text>
            <Text style={s.muted} testID="tracking-status">{locationSession.statusLine()}</Text>
            {st.caregivers.length === 0 && <Text style={s.muted}>No caregivers are linked to your account.</Text>}
            {st.caregivers.map(c => (
              <View key={c.caregiverId} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{c.caregiverName}</Text>
                  <Text style={s.muted}>{c.role === 'primary' ? 'Primary caregiver' : 'Secondary caregiver'}</Text>
                </View>
                <Switch value={c.sharing} disabled={busy}
                  onValueChange={v => act(() => apiService.setLocationGrant(c.caregiverId, v), 'Could not change sharing.')} />
              </View>
            ))}
            <View style={[s.row, s.block]}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>Battery alerts</Text>
                <Text style={s.muted}>Your phone's battery level is shared with your primary caregiver only. You and your primary caregiver are told when it is below 25% and not charging; the alert clears when you plug in. The phone sends its battery only while the app is running; with location sharing on it keeps running in the background, otherwise keep the app open.</Text>
                <Text style={s.muted} testID="battery-status">{batteryReporter.statusLine()}</Text>
              </View>
              <Switch value={!!st.batteryOn} disabled={busy}
                onValueChange={v => act(() => apiService.setBatterySharing(v), 'Could not change battery alerts.')} />
            </View>
            {(st.caregivers.some(c => c.sharing) || st.batteryOn) && (
              <TouchableOpacity style={s.danger} disabled={busy} onPress={() => act(() => apiService.stopAllLocationSharing(), 'Could not turn sharing off.')}>
                <Text style={s.dangerText}>Stop sharing with everyone</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {!notificationsOn && <Text style={s.note}>Android notifications are disabled for this app. Enable notifications in Android Settings for background alerts.</Text>}
            <Text style={s.note}>Full-screen boundary alerts: {fsi ? 'locked-screen access enabled' : 'locked-screen access not enabled'}. With this app open, an in-app full-screen alert is available. When using another app, Android may show a heads-up notification instead. Delivery is not guaranteed.</Text>
            <TouchableOpacity style={s.btn} onPress={() => Alert.alert('Full-screen alert access', 'Optional: allow AlzheFi to show a boundary alert over the locked screen. Normal notifications remain the fallback. You can turn this off in Android Settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Enable and open settings', onPress: () => { openFullScreenSettings().then(() => fullScreenAllowed().then(setFsi)).catch(() => {}); } }])}><Text style={s.btnText}>Manage full-screen alert access</Text></TouchableOpacity>
            {fsi && <TouchableOpacity onPress={() => { disableFullScreenAlerts().then(() => setFsi(false)); }}><Text style={s.note}>Turn off locked-screen full-screen alerts</Text></TouchableOpacity>}
            <TouchableOpacity style={s.btn} onPress={()=>Alert.alert('Test alert - this phone only','Local display test only. No patient exit, boundary change or push delivery test.',[
              {text:'Cancel',style:'cancel'},
              {text:'Show test now',onPress:()=>showTestAlert().catch(()=>Alert.alert('Test not started','Sign in as a caregiver and try again.'))},
              {text:'Notify in about 15 seconds',onPress:()=>scheduleTestAlert().then(enabled=>{setSaved(enabled?'Local test scheduled. Lock this phone now. Android may delay it; this does not test push delivery.':'Local notification test scheduled. Locked-screen full-screen access is not enabled.');}).catch(()=>Alert.alert('Test not scheduled','Check Android notification settings and try again.'))},
            ])}><Text style={s.btnText}>Test alert</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>cancelTestAlert().then(()=>setSaved('Local test cancelled.')).catch(()=>{})}><Text style={s.note}>Cancel local test</Text></TouchableOpacity>
            <View style={s.block}>
              <Text style={s.name}>Simulated boundary test</Text>
              <Text style={s.note}>This phone only. Uses synthetic inside/outside points and the same detector with its full 60-second confirmation rule. No real patient, GPS or saved boundary is changed. Tests diagnostic push delivery, not patient consent/link handling or real GPS capture.</Text>
              <TouchableOpacity style={s.btn} disabled={testBusy} onPress={()=>testAction(async()=>{const token=await getToken(getMessaging());await apiService.registerDeviceToken(token);return apiService.startBoundaryTest(token);})}><Text style={s.btnText}>{testBusy?'Working...':'Start synthetic boundary test'}</Text></TouchableOpacity>
              {testRun && <>
                <Text style={s.note}>Test state: {testRun.status}. {testRun.status==='waiting'?'Wait 60 seconds after starting, then confirm below.':''} {testRun.status==='provider_accepted'?'Provider accepted the test. Phone receipt is not yet confirmed.':''} {testRun.status==='received'?'The app handled the diagnostic push. Please confirm you saw the TEST ONLY screen or notification. This is not proof of real GPS or patient-event delivery.':''}</Text>
                {testRun.status==='waiting' && <TouchableOpacity style={s.btn} disabled={testBusy} onPress={()=>testAction(()=>apiService.confirmBoundaryTest(testRun.runId))}><Text style={s.btnText}>Confirm synthetic outside fix after 60 seconds</Text></TouchableOpacity>}
                <TouchableOpacity style={s.btn} disabled={testBusy} onPress={()=>testAction(()=>apiService.readBoundaryTest(testRun.runId))}><Text style={s.btnText}>Check test result</Text></TouchableOpacity>
              </>}
              {!!testError && <Text style={s.note}>{testError}</Text>}
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>Share my location for "nearby" alerts</Text>
                <Text style={s.muted}>Patients who share with you are told when you are close.</Text>
              </View>
              <Switch value={st.mySharing} disabled={busy}
                onValueChange={v => act(() => apiService.setCaregiverSharing(v), 'Could not change sharing.')} />
            </View>
            {!!saved && <Text accessibilityRole="alert" style={s.note}>{saved}</Text>}
            {[...st.patients].sort((a, b) => Number(b.patientId === focusId) - Number(a.patientId === focusId)).map(p => (
              <View key={p.patientId} style={s.block}>
                {p.patientId === focusId && <Text style={s.muted}>Opened from an alert. Live view below.</Text>}
                <Text style={s.name}>{p.patientName}</Text>
                <Text style={s.muted}>
                  {!p.patientSharing ? 'Not sharing their location with you.'
                    : p.canSetBoundary ? 'Sharing with you. You can set the safe area.'
                    : 'Sharing with you. Only the primary caregiver sets the safe area.'}
                </Text>
                {p.role === 'primary' && (
                  <Text style={s.muted} testID={`battery-${p.patientId}`}>{(() => {
                    if (!p.batteryShared) return 'Battery: not shared by the patient.';
                    const b = batt[p.patientId];
                    if (!b || b.status === 'unknown') return 'Battery: no reading yet.';
                    if (b.status === 'stale') return 'Battery: no recent reading.';
                    if (b.status === 'live') return `Battery ${b.pct}%${b.charging ? ', charging' : b.pct < 25 ? ', low' : ''}. ${Math.round(b.ageMs / 1000)}s ago.`;
                    return 'Battery: not shared by the patient.';
                  })()}</Text>
                )}
                {p.patientSharing && <LiveLocationCard patientId={p.patientId} zoneVersion={zoneVersion} />}
                {p.canSetBoundary && zoneFor !== p.patientId && (
                  <TouchableOpacity style={s.btn} onPress={() => openZone(p.patientId)}><Text style={s.btnText}>Set safe area</Text></TouchableOpacity>
                )}
                {zoneFor === p.patientId && (
                  <View>
                    <Text style={s.muted}>Centre of the safe area in decimal degrees, and its radius in metres (100 to 5000, test values). Filled from the patient's live position when there is one.</Text>
                    {zoneLoading && <><ActivityIndicator color={DARK} /><Text style={s.note}>Loading saved safe area and current position...</Text></>}
                    {!!zoneError && <><Text accessibilityRole="alert" style={s.note}>{zoneError}</Text><TouchableOpacity onPress={() => openZone(p.patientId)}><Text style={s.note}>Retry safe area</Text></TouchableOpacity></>}
                    {!zoneLoading && !zoneError && <>
                    {(['lat', 'lon', 'radiusM'] as const).map(k => (
                      <View key={k}><Text style={s.note}>{k === 'lat' ? 'Latitude' : k === 'lon' ? 'Longitude' : 'Radius in metres'}</Text><TextInput accessibilityLabel={k === 'lat' ? 'Latitude' : k === 'lon' ? 'Longitude' : 'Radius in metres'} placeholderTextColor={MUTED} editable={!busy} style={s.input} keyboardType="numeric" value={form[k]} placeholder={k === 'radiusM' ? 'Radius in metres' : k === 'lat' ? 'Latitude' : 'Longitude'}
                        onChangeText={t => setForm(f => ({ ...f, [k]: t }))} /></View>
                    ))}
                    <TouchableOpacity style={s.btn} disabled={busy} onPress={saveZone}><Text style={s.btnText}>{busy ? 'Saving...' : 'Save'}</Text></TouchableOpacity>
                    </>}
                    <TouchableOpacity disabled={busy} onPress={() => { zoneRequest.current++; setZoneFor(null); }}><Text style={s.note}>Cancel</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 20 }, pad: { padding: 16 },
  title: { fontSize: 13, fontWeight: '700', color: MUTED, marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14 },
  note: { color: DARK, fontSize: 13, marginBottom: 10 }, muted: { color: MUTED, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }, name: { color: DARK, fontWeight: '600', fontSize: 15 },
  block: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER, marginTop: 6 },
  btn: { backgroundColor: YELLOW, borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 8 }, btnText: { color: DARK, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, marginTop: 8, color: DARK },
  danger: { marginTop: 10, paddingVertical: 10, alignItems: 'center' }, dangerText: { color: DANGER, fontWeight: '700' },
});
