import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TextInput, TouchableOpacity, Text, Alert, AppState } from 'react-native';
import PatientsScreen from '../Src/Screens/Caregiver/PatientsScreen';
import LocationSharingSection from '../Src/Components/Location/LocationSharingSection';
jest.mock('../Src/Context/AuthContext', () => ({ useAuth: () => ({ state: { user: { id: 'cg' } } }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../Src/Components/CareLinks/LinkPatientModal', () => () => null);
jest.mock('../Src/Components/Location/LiveLocationCard', () => () => null);
jest.mock('../Src/Services/locationNative', () => ({ locationSession: { ensurePushRegistered: jest.fn(async () => {}), refreshCapture: jest.fn(async () => {}), pushStatus: 'registered' }, batteryReporter: { reconcile: jest.fn(async () => {}) } }));
jest.mock('../Src/Services/apiService', () => ({ LOCATION_TEST_BUILD: true, CARE_BUILD_LABEL: 'Location test v7', careReadFailure: () => 'Request timed out', apiService: { getLinkedPatients: jest.fn(), getPatientEvents: jest.fn(), getSharingStatus: jest.fn(), getBattery: jest.fn(), getZone: jest.fn(), getLiveLocation: jest.fn(), setZone: jest.fn() } }));
const { apiService: api } = require('../Src/Services/apiService');
const flush = () => act(async () => { await new Promise(r => setImmediate(r)); });
const deferred = () => { let resolve!: (v: any) => void; let reject!: (v: any) => void; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise, resolve, reject }; };
const treeText = (t: renderer.ReactTestRenderer) => JSON.stringify(t.toJSON());
const press = async (t: renderer.ReactTestRenderer, label: string) => { const el = t.root.findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(x => x.props.children === label)); if(!el) throw Error(label); await act(async () => { el.props.onPress(); }); };
let t: renderer.ReactTestRenderer;
beforeEach(() => {
 jest.clearAllMocks();
 Object.values(api).forEach((f: any) => f.mockReset());
 Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
 api.getLinkedPatients.mockResolvedValue([{ _id: 'p', name: 'Test Patient', email: '', role: 'patient' }]);
 api.getSharingStatus.mockResolvedValue({ role: 'caregiver', mySharing: false, patients: [{ patientId: 'p', patientName: 'Test Patient', role: 'primary', canSetBoundary: true, patientSharing: true }] });
 api.getZone.mockResolvedValue({ lat: 10, lon: 76, radiusM: 300 });
 api.getLiveLocation.mockResolvedValue({ status: 'live', lat: 11, lon: 77 });
 api.setZone.mockResolvedValue({ lat: 10, lon: 76, radiusM: 300 });
});
afterEach(async () => { if(t) await act(async () => t.unmount()); jest.useRealTimers(); });
test('test host list appears without waiting for or requesting unavailable reminders', async () => {
 api.getPatientEvents.mockReturnValue(new Promise(() => {}));
 await act(async () => { t = renderer.create(<PatientsScreen />); }); await flush();
 expect(treeText(t)).toContain('Test Patient'); expect(treeText(t)).toContain('Reminders are not available');
 expect(api.getPatientEvents).not.toHaveBeenCalled();
});
test('patient read failure is an explicit retry state, not no-patients', async () => {
 api.getLinkedPatients.mockRejectedValue(new Error('timeout'));
 await act(async () => { t=renderer.create(<PatientsScreen />); }); await flush();
 expect(treeText(t)).toContain('Could not verify the patient list'); expect(treeText(t)).not.toContain('No patients linked');
});
test('slow patient read does not overlap on refresh', async () => {
 jest.useFakeTimers(); api.getLinkedPatients.mockReturnValue(new Promise(() => {}));
 await act(async () => { t=renderer.create(<PatientsScreen />); });
 await act(async () => { jest.advanceTimersByTime(24000); });
 expect(api.getLinkedPatients).toHaveBeenCalledTimes(1);
});
test('zone and live reads start together; inputs cannot be edited before saved-zone result', async () => {
 const zone=deferred(); api.getZone.mockReturnValue(zone.promise);
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush();
 await press(t,'Set safe area');
 expect(api.getLiveLocation).toHaveBeenCalledWith('p'); expect(treeText(t)).toContain('Loading saved safe area'); expect(t.root.findAllByType(TextInput)).toHaveLength(0);
 await act(async () => zone.resolve({ lat: 10, lon: 76, radiusM: 200 }));
 expect(t.root.findAllByType(TextInput).map(i => i.props.value)).toEqual(['10','76','200']);
});
test('failed zone read blocks saving rather than silently overwriting existing area', async () => {
 api.getZone.mockRejectedValue(new Error('timeout'));
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush(); await press(t,'Set safe area'); await flush();
 expect(treeText(t)).toContain('Could not read the saved safe area'); expect(t.root.findAllByType(TextInput)).toHaveLength(0); expect(api.setZone).not.toHaveBeenCalled();
});
test('only live location fills an absent safe area', async () => {
 api.getZone.mockResolvedValue(null);
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush(); await press(t,'Set safe area'); await flush();
 expect(t.root.findAllByType(TextInput).map(i => i.props.value)).toEqual(['11.00000','77.00000','300']);
});
test('stale location never fills safe-area coordinates', async () => {
 api.getZone.mockResolvedValue(null); api.getLiveLocation.mockResolvedValue({ status: 'stale' });
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush(); await press(t,'Set safe area'); await flush();
 expect(t.root.findAllByType(TextInput).map(i => i.props.value)).toEqual(['','','300']);
});
test('save has an in-progress state and confirmed success; no tracker request gates acknowledgement', async () => {
 const save=deferred(); api.setZone.mockReturnValue(save.promise);
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush(); await press(t,'Set safe area'); await flush(); await press(t,'Save');
 expect(treeText(t)).toContain('Saving...'); expect(api.setZone).toHaveBeenCalledWith('p',{ lat:10,lon:76,radiusM:300 });
 await act(async () => save.resolve({})); expect(treeText(t)).toContain('Safe area saved.');
});
test('cancelled late zone read cannot refill a closed form', async () => {
 const zone=deferred(); api.getZone.mockReturnValue(zone.promise);
 await act(async () => { t=renderer.create(<LocationSharingSection />); }); await flush(); await press(t,'Set safe area'); await press(t,'Cancel');
 await act(async () => zone.resolve({ lat: 10,lon:76,radiusM:200 })); expect(t.root.findAllByType(TextInput)).toHaveLength(0);
});

test('a failed refresh is not an empty list, hides protected details and recovers on success', async () => {
 jest.useFakeTimers();
 await act(async () => { t=renderer.create(<PatientsScreen />); });
 expect(treeText(t)).toContain('Test Patient');
 api.getLinkedPatients.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
 await act(async () => { jest.advanceTimersByTime(8000); });
 expect(treeText(t)).toContain('Patients unverified'); expect(treeText(t)).toContain('Last successful check');
 expect(treeText(t)).not.toContain('Test Patient'); expect(treeText(t)).not.toContain('No patients linked');
 await act(async () => { jest.advanceTimersByTime(8000); });
 expect(treeText(t)).toContain('Test Patient'); expect(treeText(t)).not.toContain('Patients unverified');
});
test('a confirmed empty refreshed list removes the patient immediately', async () => {
 jest.useFakeTimers(); await act(async () => { t=renderer.create(<PatientsScreen />); });
 api.getLinkedPatients.mockResolvedValueOnce([]);
 await act(async () => { jest.advanceTimersByTime(8000); });
 expect(treeText(t)).toContain('No patients linked'); expect(treeText(t)).not.toContain('Test Patient');
});
test('authorization denial discards the last successful list snapshot', async () => {
 jest.useFakeTimers(); await act(async () => { t=renderer.create(<PatientsScreen />); });
 api.getLinkedPatients.mockRejectedValueOnce({ response: { status: 403 } });
 await act(async () => { jest.advanceTimersByTime(8000); });
 expect(treeText(t)).not.toContain('Test Patient'); expect(treeText(t)).not.toContain('Last successful check');
 expect(treeText(t)).toContain('Patients unverified');
});
