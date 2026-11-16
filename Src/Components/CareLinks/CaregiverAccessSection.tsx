import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { apiService } from '../../Services/apiService';
import { CareLinkRole, IncomingCareLink } from '../../Types';
import { YELLOW, DARK, MUTED, BORDER, WHITE, DANGER } from './theme';

/**
 * Patient-side control: who may see my information. Nothing is shared until the
 * patient approves, and every caregiver can be removed at any time.
 * Approval covers the categories listed in the request text only. It does not include location.
 */
export default function CaregiverAccessSection() {
  const [links, setLinks] = useState<IncomingCareLink[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLinks(await apiService.getIncomingCareLinks());
    } catch {
      setError('Could not load caregivers. Pull to try again later.');
      setLinks(l => l ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => Promise<void>, failMsg: string) => {
    setBusyId(id);
    try { await fn(); }
    catch (e: any) {
      const status = e?.response?.status;
      Alert.alert('Not done', status === 409
        ? 'You already have a primary caregiver. Choose "Secondary" or remove the current primary first.'
        : failMsg);
    } finally { setBusyId(null); await load(); }
  };

  const approve = (l: IncomingCareLink, role: CareLinkRole) =>
    run(l.id, () => apiService.approveCareLink(l.id, role), 'Could not approve this request.');
  const decline = (l: IncomingCareLink) =>
    run(l.id, () => apiService.declineCareLink(l.id), 'Could not decline this request.');
  const remove = (l: IncomingCareLink) =>
    Alert.alert('Remove access?', `${l.caregiverName} will no longer be able to see your information.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(l.id, () => apiService.revokeCareLink(l.id), 'Could not remove access.') },
    ]);

  const pending = (links ?? []).filter(l => l.status === 'pending');
  const active = (links ?? []).filter(l => l.status === 'active');

  return (
    <View style={s.section} testID="caregiver-access">
      <Text style={s.sectionTitle}>Caregivers</Text>
      <View style={s.card}>
        {links === null ? (
          <View style={s.pad}><ActivityIndicator color={DARK} /></View>
        ) : (
          <>
            {error && <Text style={s.error}>{error}</Text>}

            {pending.length > 0 && <Text style={s.group}>Requests waiting for you</Text>}
            {pending.map(l => (
              <View key={l.id} style={s.item}>
                <View style={s.rowTop}>
                  <View style={s.avatar}><Icon name="account-heart-outline" size={18} color={DARK} /></View>
                  <View style={s.info}>
                    <Text style={s.name}>{l.caregiverName}</Text>
                    <Text style={s.sub}>wants to be linked as your caregiver</Text>
                  </View>
                </View>
                <Text style={s.hint}>If you approve, they can: see your name, email and recent chats with the assistant; see, add, change and delete your reminders; and add memories for you. They cannot see your location. You can remove them any time.</Text>
                <View style={s.btnRow}>
                  <TouchableOpacity disabled={busyId === l.id} style={s.btnPrimary} onPress={() => approve(l, 'primary')} accessibilityLabel={`Approve ${l.caregiverName} as primary`}>
                    <Text style={s.btnPrimaryText}>Approve as primary</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busyId === l.id} style={s.btnGhost} onPress={() => approve(l, 'secondary')} accessibilityLabel={`Approve ${l.caregiverName} as secondary`}>
                    <Text style={s.btnGhostText}>Secondary</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busyId === l.id} style={s.btnGhost} onPress={() => decline(l)} accessibilityLabel={`Decline ${l.caregiverName}`}>
                    <Text style={s.btnGhostText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {active.length > 0 && <Text style={s.group}>Linked caregivers</Text>}
            {active.map(l => (
              <View key={l.id} style={s.item}>
                <View style={s.rowTop}>
                  <View style={s.avatar}><Icon name="account-check-outline" size={18} color={DARK} /></View>
                  <View style={s.info}>
                    <Text style={s.name}>{l.caregiverName}</Text>
                    <Text style={s.sub}>{l.role === 'primary' ? 'Primary caregiver' : 'Secondary caregiver'}{l.legacy ? ' · linked before approvals existed' : ''}</Text>
                  </View>
                  <TouchableOpacity disabled={busyId === l.id} onPress={() => remove(l)} accessibilityLabel={`Remove ${l.caregiverName}`}>
                    <Text style={s.remove}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {pending.length === 0 && active.length === 0 && (
              <View style={s.pad}>
                <Text style={s.empty}>No caregivers are linked to your account.</Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: WHITE, borderRadius: 20, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  pad: { padding: 18 },
  group: { fontSize: 12, fontWeight: '700', color: MUTED, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  item: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: YELLOW, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: DARK },
  sub: { fontSize: 13, color: MUTED, marginTop: 2 },
  hint: { fontSize: 13, color: DARK, marginTop: 10, lineHeight: 18 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  btnPrimary: { backgroundColor: DARK, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, marginBottom: 6 },
  btnPrimaryText: { color: WHITE, fontWeight: '700', fontSize: 14 },
  btnGhost: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, marginRight: 8, marginBottom: 6 },
  btnGhostText: { color: DARK, fontWeight: '600', fontSize: 14 },
  remove: { color: DANGER, fontWeight: '700', fontSize: 14, padding: 6 },
  empty: { fontSize: 14, color: MUTED, textAlign: 'center' },
  error: { color: DANGER, fontSize: 13, padding: 16, paddingBottom: 0 },
});
