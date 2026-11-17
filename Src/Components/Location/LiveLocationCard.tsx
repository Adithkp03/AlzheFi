import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { apiService } from '../../Services/apiService';
import { LiveLocation, Zone } from '../../Types';
import { layoutRadar } from './radarGeometry';
import { YELLOW, DARK, MUTED, BORDER, DANGER } from '../CareLinks/theme';

/** Test-only poll interval while the card is mounted. Not a guarantee of achieved GPS updates. */
export const LIVE_POLL_MS = 15000;

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

/**
 * Caregiver live view for one patient. Polls only while mounted and the app is showing it.
 * Coordinates are shown only when the server says the fix is live; stale or unknown never shows a position.
 */
export default function LiveLocationCard({ patientId, zoneVersion = 0 }: { patientId: string; zoneVersion?: number }) {
  const [loc, setLoc] = useState<LiveLocation | null>(null);
  const [boundary, setBoundary] = useState<any>(null);
  const [err, setErr] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let active = true, inFlight = false;
    setLoc(null); setZone(null);
    apiService.getZone(patientId).then(z => { if (active) setZone(z); }).catch(() => {});
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await apiService.getLiveLocation(patientId);
        if (!active) return;
        setLoc(r); setErr(false); setFetchedAt(Date.now());
        try { const b = await apiService.getBoundaryDiagnostic(patientId); if (active) setBoundary(b); }
        catch { if (active) setBoundary(null); }
      } catch { if (active) { setErr(true); setLoc(null); setBoundary(null); } }  // never keep an old position on error
      finally { inFlight = false; }
    };
    tick();
    const id = setInterval(tick, LIVE_POLL_MS);
    return () => { active = false; alive.current = false; clearInterval(id); };
  }, [patientId, zoneVersion]);

  return (
    <View style={s.card}>
      <Text style={s.title}>Live location</Text>
      {err && <Text style={s.stale}>Cannot reach the server. No position is shown.</Text>}
      {!err && loc?.status === 'live' && (
        <>
          <Text style={s.live}>Updated {ago(loc.ageMs)}</Text>
          <Radar loc={loc} zone={zone} />
          <Text style={s.coord}>{loc.lat.toFixed(5)}, {loc.lon.toFixed(5)} (accuracy about {Math.round(loc.accuracyM)} m)</Text>
          <TouchableOpacity style={s.btn} onPress={() => Alert.alert(
            'Open in another app?',
            'This sends the patient\'s current position to the maps app on your phone, which may share it with its own provider. Nothing is sent unless you continue.',
            [{ text: 'Cancel', style: 'cancel' },
             { text: 'Open', onPress: () => Linking.openURL(`geo:${loc.lat},${loc.lon}?q=${loc.lat},${loc.lon}`) }])}>
            <Text style={s.btnText}>Open in Maps</Text>
          </TouchableOpacity>
        </>
      )}
      {!err && loc?.status === 'stale' && <Text style={s.stale}>Stale: last update was {ago(loc.ageMs)}. The position is hidden because it may be out of date.</Text>}
      {!err && loc?.status === 'unknown' && <Text style={s.muted}>No location received yet.</Text>}
      {!err && !loc && <Text style={s.muted}>Checking...</Text>}
      {boundary && <Text testID="boundary-status" style={s.muted}>
        {boundary.position === 'unknown' ? 'Alert check: position is uncertain or not recent enough. No confirmed exit.'
          : boundary.position === 'inside' ? 'Alert check: inside the safe area.'
          : !boundary.armed ? 'Alert check: this exit was already confirmed. Re-entry is needed before another exit alert.'
          : `Alert check: waiting for confirmation (${boundary.outsideCount}/${boundary.requiredFixes} fixes, ${Math.floor(boundary.outsideSpanMs / 1000)}/${boundary.requiredSpanMs / 1000}s).`}
      </Text>}
      <Text style={s.muted}>Exit alerts need sufficiently accurate outside fixes spanning at least 60 seconds. Push delivery is not guaranteed. This test app is not an emergency monitor.</Text>
      <Text style={s.muted}>Refreshes about every {LIVE_POLL_MS / 1000}s while this screen is open{fetchedAt ? '' : ''}. Not guaranteed continuous.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 8, padding: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 10 },
  title: { fontWeight: '700', color: DARK, marginBottom: 4 },
  live: { color: DARK, fontWeight: '600' },
  coord: { color: DARK, marginTop: 2 },
  stale: { color: DANGER, fontWeight: '600' },
  muted: { color: MUTED, fontSize: 12, marginTop: 4 },
  btn: { marginTop: 6, backgroundColor: YELLOW, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnText: { color: DARK, fontWeight: '700' },
});

const SIZE = 220;
/**
 * In-app position view with no map tiles: the safe area, the patient and an accuracy ring, drawn locally.
 * No coordinates leave the app for a third-party map service. It is not a street map.
 */
function Radar({ loc, zone }: { loc: Extract<LiveLocation, { status: 'live' }>; zone: Zone | null }) {
  const l = layoutRadar({ lat: loc.lat, lon: loc.lon, accuracyM: loc.accuracyM }, zone, SIZE);
  const out = l.patientOutside === true;
  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <View style={[r.box, { width: SIZE, height: SIZE }]}>
        {l.zone && <View style={[r.zone, { left: l.zone.cx - l.zone.r, top: l.zone.cy - l.zone.r, width: l.zone.r * 2, height: l.zone.r * 2, borderRadius: l.zone.r, borderColor: out ? DANGER : '#16A34A' }]} />}
        <View style={[r.acc, { left: l.patient.x - l.patient.accR, top: l.patient.y - l.patient.accR, width: l.patient.accR * 2, height: l.patient.accR * 2, borderRadius: l.patient.accR }]} />
        <View style={[r.dot, { left: l.patient.x - 6, top: l.patient.y - 6, backgroundColor: out ? DANGER : DARK }]} />
        <Text style={r.n}>N</Text>
      </View>
      <View style={{alignSelf:'stretch',marginTop:8}}>
        {zone && <><Text style={s.live}>Saved boundary radius: {zone.radiusM} m</Text><Text style={s.coord}>Patient distance from centre: about {Math.round(l.distanceM!)} m</Text><Text style={s.muted}>Radius is centre to edge. GPS accuracy: about {Math.round(loc.accuracyM)} m. Distance alone does not confirm an alert.</Text></>}
        <View style={{alignItems:'center',marginVertical:8}} accessibilityLabel={`Radar scale: this line represents ${l.scaleLabel}`}>
          <View style={{width:l.scaleBarPx,height:8,borderBottomWidth:2,borderLeftWidth:2,borderRightWidth:2,borderColor:DARK}} />
          <Text style={s.coord}>Scale line: {l.scaleLabel}</Text>
        </View>
      </View>
      <Text style={s.muted}>
        {l.patientOutside === null ? 'No safe area set.' : out ? 'Position is outside the safe-area circle. This alone does not mean an alert was sent.' : 'Inside the safe area.'} Not a street map. Scale changes to fit the position and saved boundary.
      </Text>
    </View>
  );
}
const r = StyleSheet.create({
  box: { backgroundColor: '#F5F5F4', borderWidth: 1, borderColor: BORDER, borderRadius: 8, overflow: 'hidden' },
  zone: { position: 'absolute', borderWidth: 2, backgroundColor: 'rgba(22,163,74,0.08)' },
  acc: { position: 'absolute', backgroundColor: 'rgba(37,99,235,0.15)' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  n: { position: 'absolute', top: 4, alignSelf: 'center', left: SIZE / 2 - 4, fontWeight: '700', color: MUTED, fontSize: 11 },
});
