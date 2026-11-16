import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { apiService } from '../../Services/apiService';
import { OutgoingCareLink } from '../../Types';
import { YELLOW, DARK, MUTED, BORDER, WHITE, DANGER } from './theme';

type Props = { visible: boolean; onClose: () => void; onChanged?: () => void };

/**
 * Caregiver-side: ask a patient to link. The reply is deliberately generic, so this screen
 * never confirms whether an email belongs to a patient. Access starts only after approval.
 */
export default function LinkPatientModal({ visible, onClose, onChanged }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<OutgoingCareLink[]>([]);

  const load = useCallback(async () => {
    try { setMine(await apiService.getOutgoingCareLinks()); } catch { /* list is optional */ }
  }, []);
  useEffect(() => { if (visible) { setNotice(null); setError(null); load(); } }, [visible, load]);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const send = async () => {
    if (!valid || sending) return;
    setSending(true); setError(null); setNotice(null);
    try {
      setNotice(await apiService.requestCareLink(email.trim().toLowerCase()));
      setEmail('');
      await load(); onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not send the request. Try again.');
    } finally { setSending(false); }
  };

  const cancel = async (id: string) => {
    try { await apiService.revokeCareLink(id); } catch { setError('Could not cancel the request.'); }
    await load(); onChanged?.();
  };

  const waiting = mine.filter(l => l.status === 'pending');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID="link-patient-modal">
          <Text style={s.title}>Link a patient</Text>
          <Text style={s.body}>Enter the email the patient signed up with. They will get a request and choose whether to approve. You see nothing until they do.</Text>
          <TextInput
            style={s.input} value={email} onChangeText={setEmail} placeholder="patient@example.com"
            placeholderTextColor={MUTED} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          />
          {notice && <Text style={s.notice}>{notice}</Text>}
          {error && <Text style={s.error}>{error}</Text>}
          <TouchableOpacity style={[s.cta, !valid && s.ctaOff]} disabled={!valid || sending} onPress={send} accessibilityLabel="Send link request">
            {sending ? <ActivityIndicator color={DARK} /> : <Text style={s.ctaText}>Send request</Text>}
          </TouchableOpacity>

          {waiting.length > 0 && (
            <View style={s.waiting}>
              <Text style={s.waitingTitle}>Waiting for approval ({waiting.length})</Text>
              {waiting.map(l => (
                <View key={l.id} style={s.waitRow}>
                  <Text style={s.waitText}>Pending request</Text>
                  <TouchableOpacity onPress={() => cancel(l.id)} accessibilityLabel="Cancel request"><Text style={s.cancel}>Cancel</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={s.close} accessibilityLabel="Close"><Text style={s.closeText}>Close</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: DARK },
  body: { fontSize: 14, color: DARK, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: DARK },
  notice: { color: DARK, fontSize: 13, lineHeight: 18, marginTop: 12, backgroundColor: '#F4F1EC', padding: 10, borderRadius: 12 },
  error: { color: DANGER, fontSize: 13, marginTop: 10 },
  cta: { backgroundColor: YELLOW, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: DARK, fontWeight: '800', fontSize: 16 },
  waiting: { marginTop: 20 },
  waitingTitle: { fontSize: 13, fontWeight: '700', color: MUTED, marginBottom: 6 },
  waitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  waitText: { color: DARK, fontSize: 14 },
  cancel: { color: DANGER, fontWeight: '700' },
  close: { alignItems: 'center', marginTop: 16 },
  closeText: { color: MUTED, fontWeight: '600' },
});
