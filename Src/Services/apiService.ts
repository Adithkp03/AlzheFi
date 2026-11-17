import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Types from '../Types';

const API_BASE_URL = Platform.select({
  ios: 'http://localhost:3005/api',
  //android: 'http://10.0.2.2:3005/api',
   android: 'https://alzhefi-location-test.vercel.app/api', // location test host (test accounts only)
  default: 'http://localhost:3005/api',
});

// This APK targets the isolated care test host. Legacy reminder routes remain disabled.
export const LOCATION_TEST_BUILD = API_BASE_URL?.includes('alzhefi-location-test.vercel.app') ?? false;
export const CARE_READ_TIMEOUT_MS = 12000;
export const CARE_BUILD_LABEL = 'Care test v10';

// Fixed categories only. Never render server error bodies, URLs, user ids or tokens.
export function careReadFailure(error: any): string {
  const status = Number(error?.response?.status);
  if (Number.isInteger(status) && status > 0) return `HTTP ${status}`;
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'Request timed out';
  if (error?.code === 'INVALID_PATIENT_LIST') return 'Invalid server response';
  return 'Request did not complete';
}

/**
 * True only when the server rejected the token the request actually presented.
 * A failed login attempt, a 'no token' 401 on a request that carried none, a
 * network failure, or a transient server error must never end a saved session.
 */
export function isPresentedTokenRejected(error: AxiosError): boolean {
  if (error.response?.status !== 401) return false;
  const headers: any = error.config?.headers;
  const presented: unknown =
    headers?.Authorization ?? headers?.authorization ?? headers?.get?.('Authorization');
  if (!presented) return false;
  const data: any = error.response.data ?? {};
  const code = typeof data.code === 'string' ? data.code : '';
  const message =
    typeof data.message === 'string'
      ? data.message
      : typeof data.error === 'string'
        ? data.error
        : '';
  return (
    code === 'TOKEN_INVALID' ||
    code === 'USER_NOT_FOUND' ||
    message === 'Not authorized, token failed' ||
    message === 'Not authorized'
  );
}

/**
 * Ends the stored session for a rejected presented token. Returns true when it
 * cleared. Clears only when the rejected token is still the stored one: a late
 * 401 for an old in-flight request must not wipe a session that has since been
 * replaced by a fresh sign-in.
 */
export async function clearRejectedSession(error: AxiosError): Promise<boolean> {
  if (!isPresentedTokenRejected(error)) return false;
  const headers: any = error.config?.headers;
  const presented = String(
    headers?.Authorization ?? headers?.authorization ?? headers?.get?.('Authorization') ?? '',
  ).replace(/^Bearer\s+/i, '');
  const stored = await AsyncStorage.getItem('userToken');
  if (stored && stored === presented) {
    await AsyncStorage.multiRemove(['userToken', 'user']);
    return true;
  }
  return false;
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 90000,
      headers: { 'Content-Type': 'application/json' },
    });

    // attach token
    this.api.interceptors.request.use(async config => {
      const token = await AsyncStorage.getItem('userToken');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    this.api.interceptors.response.use(
    res => res,
    async (error: AxiosError) => {
      const cleared=await clearRejectedSession(error);
      if(cleared){try{await this.beforeLogout?.();}catch{/* local cleanup must not hide the auth error */}}
      return Promise.reject(error);
    }
  );
  }

  // ---------- AUTH ----------
  private normalizeAuthResponse(data: any): Types.AuthResponse {
    return {
      token: data.token,
      user: {
        id: data._id,
        _id: data._id,
        name: data.name,
        email: data.email,
        role: data.role,
        linkedPatientIds: [],
      },
    };
  }

  async register(data: Types.RegisterRequest): Promise<Types.AuthResponse> {
    const response = await this.api.post('/auth/register', data);
    return this.normalizeAuthResponse(response.data);
  }

  async login(data: Types.LoginRequest): Promise<Types.AuthResponse> {
    const response = await this.api.post('/auth/login', data);
    return this.normalizeAuthResponse(response.data);
  }

  // ---------- EVENTS ----------
  async getEvents(): Promise<Types.Event[]> {
    const res = await this.api.get('/events');
    return res.data;
  }

  async createEvent(data: Types.EventCreateRequest): Promise<Types.Event> {
    const res = await this.api.post('/events', data);
    return res.data;
  }

  async updateEvent(id: string, data: Partial<Types.Event>): Promise<Types.Event> {
    const res = await this.api.put(`/events/${id}`, data);
    return res.data;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.api.delete(`/events/${id}`);
  }

  // ---------- CHAT ----------
  async sendMessage(message: string): Promise<Types.ChatResponse> {
    const res = await this.api.post('/chat/message', { message });
    return res.data;
  }

  async getChatHistory(limit = 20, skip = 0): Promise<Types.Thought[]> {
    const res = await this.api.get('/chat/history', { params: { limit, skip } });
    return res.data.thoughts;
  }

  async searchMemories(query: string): Promise<Types.SearchResult[]> {
    const res = await this.api.post('/chat/search', { query });
    return res.data.results;
  }

  async getMedication(patientId:string){return (await this.api.get(`/medication/${patientId}`,{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async setMedicationPreferences(pref:any){return (await this.api.post('/medication/preferences',pref,{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async getMedicationFollowup(id:string){return (await this.api.get(`/medication/followups/${id}`,{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async getMedicationSharing(){return (await this.api.get('/medication/sharing',{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async setMedicationSharing(id:string,active:boolean){return (await this.api.post(`/medication/sharing/${id}`,{active},{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async saveMedicationPlan(patientId:string,plan:any){return (await this.api.post(`/medication/${patientId}/plans`,plan,{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async stopMedicationPlan(patientId:string,id:string){return (await this.api.post(`/medication/${patientId}/plans/${id}/stop`,{},{timeout:CARE_READ_TIMEOUT_MS})).data;}
  async reportMedicationDose(patientId:string,id:string,state:string,rev:number){return (await this.api.post(`/medication/${patientId}/doses/${id}`,{state,rev},{timeout:CARE_READ_TIMEOUT_MS})).data;}

  // ---------- CAREGIVER ----------
  async getLinkedPatients(): Promise<Types.User[]> {
    const res = await this.api.get('/caregiver/patients', { timeout: CARE_READ_TIMEOUT_MS });
    if (!Array.isArray(res.data?.patients)) throw Object.assign(new Error('Invalid patient list'), { code: 'INVALID_PATIENT_LIST' });
    return res.data.patients;
  }
  async getPatientEvents(patientId: string): Promise<Types.Event[]> {
  const res = await this.api.get(`/caregiver/patient/${patientId}/events`);
  return res.data.events ?? res.data ?? [];
}

  async linkPatient(email: string): Promise<Types.User> {
    const res = await this.api.post('/caregiver/patient/link', { email });
    return res.data;
  }

  // ---------- CARE LINKS (patient-approved) ----------
  async requestCareLink(email: string): Promise<string> {
    const res = await this.api.post('/care-links/request', { email });
    return res.data.message;
  }
  async getIncomingCareLinks(): Promise<Types.IncomingCareLink[]> {
    const res = await this.api.get('/care-links/incoming');
    return res.data;
  }
  async getOutgoingCareLinks(): Promise<Types.OutgoingCareLink[]> {
    const res = await this.api.get('/care-links/outgoing');
    return res.data;
  }
  async approveCareLink(id: string, role: Types.CareLinkRole): Promise<void> {
    await this.api.post(`/care-links/${id}/approve`, { role });
  }
  async declineCareLink(id: string): Promise<void> {
    await this.api.post(`/care-links/${id}/decline`);
  }
  async revokeCareLink(id: string): Promise<void> {
    await this.api.post(`/care-links/${id}/revoke`);
  }

  // ---------- LOCATION (server returns 404 while the feature is off) ----------
  async getSharingStatus(): Promise<Types.SharingStatus> {
    return (await this.api.get('/location/status', { timeout: CARE_READ_TIMEOUT_MS })).data;
  }
  async setLocationGrant(caregiverId: string, on: boolean): Promise<void> {
    if (on) await this.api.post('/location/grants', { caregiverId });
    else await this.api.post('/location/grants/revoke', { caregiverId });
  }
  async stopAllLocationSharing(): Promise<void> {
    await this.api.post('/location/sharing/off');
  }
  async setBatterySharing(on: boolean): Promise<void> { await this.api.post(`/location/battery/${on ? 'on' : 'off'}`); }
  async sendBattery(r: { pct: number; charging: boolean; recordedAt: number }): Promise<void> { await this.api.post('/location/battery', r); }
  async getBattery(patientId: string): Promise<Types.BatteryReading> { return (await this.api.get(`/location/battery/${patientId}`, { timeout: CARE_READ_TIMEOUT_MS })).data; }
  async setCaregiverSharing(on: boolean): Promise<void> {
    await this.api.post(`/location/caregiver-sharing/${on ? 'on' : 'off'}`);
  }
  async getZone(patientId: string): Promise<Types.Zone | null> {
    return (await this.api.get(`/location/zone/${patientId}`, { timeout: CARE_READ_TIMEOUT_MS })).data;
  }
  async setZone(patientId: string, zone: Types.Zone): Promise<Types.Zone> {
    return (await this.api.put(`/location/zone/${patientId}`, zone, { timeout: 15000 })).data;
  }
  async startBoundaryTest(token:string):Promise<any>{return (await this.api.post('/location/diagnostics/boundary-test',{token},{timeout:12000})).data;}
  async confirmBoundaryTest(id:string):Promise<any>{return (await this.api.post(`/location/diagnostics/boundary-test/${id}/confirm`,{},{timeout:20000})).data;}
  async readBoundaryTest(id:string):Promise<any>{return (await this.api.get(`/location/diagnostics/boundary-test/${id}`,{timeout:12000})).data;}
  async ackBoundaryTest(id:string):Promise<any>{return (await this.api.post(`/location/diagnostics/boundary-test/${id}/received`,{},{timeout:12000})).data;}
  async getBoundaryAlert(eventId: string): Promise<any> { return (await this.api.get(`/location/alerts/${eventId}`, { timeout: CARE_READ_TIMEOUT_MS })).data; }
  async getBoundaryDiagnostic(patientId: string): Promise<any> {
    return (await this.api.get(`/location/diagnostics/boundary/${patientId}`, { timeout: CARE_READ_TIMEOUT_MS })).data;
  }
  async getLiveLocation(patientId: string): Promise<Types.LiveLocation> {
    return (await this.api.get(`/location/live/${patientId}`, { timeout: CARE_READ_TIMEOUT_MS })).data;
  }
  async sendLocationFix(fix: { lat: number; lon: number; accuracyM: number; recordedAt: number }): Promise<void> {
    await this.api.post('/location/fix', fix);
  }
  async removeDeviceToken(token: string): Promise<void> {
    await this.api.post('/location/device-token/remove', { token, boundaryAlertV1: true });
  }
  async registerDeviceToken(token: string): Promise<void> {
    await this.api.post('/location/device-token', { token, boundaryAlertV1: true });
  }

  async getPatientProfile(patientId: string): Promise<Types.PatientProfile> {
    const res = await this.api.get(`/caregiver/patient/${patientId}/profile`);
    return res.data;
  }

  async updatePatientProfile(patientId: string, data: Partial<Types.User>): Promise<Types.PatientProfile> {
    const res = await this.api.put(`/caregiver/patient/${patientId}/profile`, data);
    return res.data;
  }

  async getPatientActivity(patientId: string, limit = 10): Promise<Types.Thought[]> {
    const res = await this.api.get(`/caregiver/patient/${patientId}/activity`, { params: { limit } });
    return res.data.activity;
  }


  async createPatientEvent(patientId: string, data: any) {
  const res = await this.api.post(`/caregiver/patient/${patientId}/event`, data);
  return res.data;
}


async deletePatientEvent(eventId: string) {
  const res = await this.api.delete(`/caregiver/event/${eventId}`);
  return res.data;
}



// ---------- MEMORY (CAREGIVER) ----------

// Add Photo Memory
async addPhotoMemory(
  patientId: string,
  data: {
    title?: string;
    year?: string;
    category?: string;
    caption?: string;
    imageUrl: string;
  }
): Promise<any> {
  const res = await this.api.post(
    `/caregiver/patient/${patientId}/memory/photo`,
    data
  );
  return res.data;
}

// Add Story Memory
async addStoryMemory(
  patientId: string,
  data: {
    title?: string;
    year?: string;
    description: string;
    mood?: string;
  }
): Promise<any> {
  const res = await this.api.post(
    `/caregiver/patient/${patientId}/memory/story`,
    data
  );
  return res.data;
}

// Add Place Memory
async addPlaceMemory(
  patientId: string,
  data: {
    placeName: string;
    address?: string;
    category?: string;
    description?: string;
    photoUrl?: string;
  }
): Promise<any> {
  const res = await this.api.post(
    `/caregiver/patient/${patientId}/memory/place`,
    data
  );
  return res.data;
}




// ---------- PATIENT ----------

// 📸 Get memories by type (photo, place, story, chat)
async getMemoriesByType(
  type: 'photo' | 'place' | 'story' | 'chat',
  limit = 20,
  skip = 0
): Promise<any[]> {
  const res = await this.api.get(`/patient/memories/${type}`, {
    params: { limit, skip },
  });
  return res.data.memories;
}


// 👨‍👩‍👧 Get contacts
async getContacts(): Promise<any[]> {
  const res = await this.api.get(`/patient/contacts`);
  return res.data.contacts;
}


// ➕ Create contact
async createContact(data: {
  name: string;
  relationship: string;
  phoneNumber: string;
}): Promise<any> {
  const res = await this.api.post(`/patient/contacts`, data);
  return res.data;
}
  // ---------- CONVERSATION ----------
  async queryConversation(query: string): Promise<{ answer: string }> {
    const res = await this.api.post('/conversation/query', { query });
    return res.data;
  }

  // ---------- LOGOUT ----------
  /** Set by the location session; runs while the token still exists so it can stop capture and remove the push token. */
  beforeLogout: (() => Promise<void>) | null = null;
  async logout(): Promise<void> {
    try { await this.beforeLogout?.(); } catch { /* never block logout */ }
    await AsyncStorage.multiRemove(['userToken', 'user']);
  }

  
}


export const apiService = new ApiService();
