import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { apiService } from '../../Services/apiService';
import { LiveLocation } from '../../Types';
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
export default function LiveLocationCard({ patientId }: { patientId: string }) {
  const [loc, setLoc] = useState<LiveLocation | null>(null);
  const [err, setErr] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoc(null);
    const tick = async () => {
      try {
        const r = await apiService.getLiveLocation(patientId);
        if (!alive.current) return;
        setLoc(r); setErr(false); setFetchedAt(Date.now());
      } catch { if (alive.current) { setErr(true); setLoc(null); } }  // never keep an old position on error
    };
    tick();
    const id = setInterval(tick, LIVE_POLL_MS);
    return () => { alive.current = false; clearInterval(id); };
  }, [patientId]);

  return (
    <View style={s.card}>
      <Text style={s.title}>Live location</Text>
      {err && <Text style={s.stale}>Cannot reach the server. No position is shown.</Text>}
      {!err && loc?.status === 'live' && (
        <>
          <Text style={s.live}>Updated {ago(loc.ageMs)}</Text>
          <Text style={s.coord}>{loc.lat.toFixed(5)}, {loc.lon.toFixed(5)} (accuracy about {Math.round(loc.accuracyM)} m)</Text>
          <TouchableOpacity style={s.btn} onPress={() => Linking.openURL(`geo:${loc.lat},${loc.lon}?q=${loc.lat},${loc.lon}`)}>
            <Text style={s.btnText}>Open in Maps</Text>
          </TouchableOpacity>
        </>
      )}
      {!err && loc?.status === 'stale' && <Text style={s.stale}>Stale: last update was {ago(loc.ageMs)}. The position is hidden because it may be out of date.</Text>}
      {!err && loc?.status === 'unknown' && <Text style={s.muted}>No location received yet.</Text>}
      {!err && !loc && <Text style={s.muted}>Checking...</Text>}
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
