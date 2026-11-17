jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isPresentedTokenRejected, clearRejectedSession } from '../Src/Services/apiService';

// Fabricate the shape of an axios error without needing axios internals.
function err(status: number | null, data: any, withToken: boolean): any {
  return {
    response: status === null ? undefined : { status, data },
    config: { headers: withToken ? { Authorization: 'Bearer tok' } : {} },
  };
}

test('server rejection of the presented token clears the session', () => {
  expect(isPresentedTokenRejected(err(401, { message: 'Not authorized, token failed' }, true))).toBe(true);
  expect(isPresentedTokenRejected(err(401, { message: 'Not authorized, token failed', code: 'TOKEN_INVALID' }, true))).toBe(true);
  expect(isPresentedTokenRejected(err(401, { message: 'Not authorized', code: 'USER_NOT_FOUND' }, true))).toBe(true);
  expect(isPresentedTokenRejected(err(401, { message: 'Not authorized' }, true))).toBe(true);
  expect(isPresentedTokenRejected(err(401, { error: 'Not authorized' }, true))).toBe(true);
});

test('transient failures never clear the session', () => {
  // Network failure / timeout: no response at all.
  expect(isPresentedTokenRejected(err(null, undefined, true))).toBe(false);
  // Server-side hiccup (e.g. database unreachable while the token is valid).
  expect(isPresentedTokenRejected(err(500, { message: 'Server error', code: 'SERVER_ERROR' }, true))).toBe(false);
  expect(isPresentedTokenRejected(err(502, {}, true))).toBe(false);
  expect(isPresentedTokenRejected(err(503, {}, true))).toBe(false);
});

test('requests that presented no token never clear the session', () => {
  expect(isPresentedTokenRejected(err(401, { message: 'Not authorized, no token', code: 'NO_TOKEN' }, false))).toBe(false);
  // A failed login attempt must not wipe a stored session.
  expect(isPresentedTokenRejected(err(401, { message: 'Invalid email or password' }, false))).toBe(false);
  expect(isPresentedTokenRejected(err(401, { message: 'Invalid email or password' }, true))).toBe(false);
});

test('other statuses never clear the session', () => {
  expect(isPresentedTokenRejected(err(403, { error: 'Only caregivers can access this' }, true))).toBe(false);
  expect(isPresentedTokenRejected(err(404, {}, true))).toBe(false);
  expect(isPresentedTokenRejected(err(400, { message: 'User already exists' }, true))).toBe(false);
});

test('a server-rejected stored token clears the session; anything else keeps it', async () => {
  await AsyncStorage.setItem('userToken', 'tok-stored');
  await AsyncStorage.setItem('user', '{"id":"u1"}');
  await expect(clearRejectedSession(err(401, { message: 'Not authorized, token failed' }, true))).resolves.toBe(false);
  // The fabricated error presents 'Bearer tok', which is not the stored token.
  expect(await AsyncStorage.getItem('userToken')).toBe('tok-stored');

  const matching: any = {
    response: { status: 401, data: { message: 'Not authorized, token failed' } },
    config: { headers: { Authorization: 'Bearer tok-stored' } },
  };
  await expect(clearRejectedSession(matching)).resolves.toBe(true);
  expect(await AsyncStorage.getItem('userToken')).toBeNull();
  expect(await AsyncStorage.getItem('user')).toBeNull();
});

test('a late 401 for an old token cannot clear a freshly signed-in session', async () => {
  // Old request still in flight with tok-old; user has since signed in again.
  await AsyncStorage.setItem('userToken', 'tok-new');
  await AsyncStorage.setItem('user', '{"id":"u1"}');
  const lateOld401: any = {
    response: { status: 401, data: { message: 'Not authorized, token failed' } },
    config: { headers: { Authorization: 'Bearer tok-old' } },
  };
  await expect(clearRejectedSession(lateOld401)).resolves.toBe(false);
  expect(await AsyncStorage.getItem('userToken')).toBe('tok-new');
  expect(await AsyncStorage.getItem('user')).toBe('{"id":"u1"}');
});

test('transient server failure preserves storage', async () => {
  await AsyncStorage.setItem('userToken', 'tok-stored');
  await AsyncStorage.setItem('user', '{"id":"u1"}');
  const dbDown: any = {
    response: { status: 500, data: { message: 'Server error', code: 'SERVER_ERROR' } },
    config: { headers: { Authorization: 'Bearer tok-stored' } },
  };
  await expect(clearRejectedSession(dbDown)).resolves.toBe(false);
  expect(await AsyncStorage.getItem('userToken')).toBe('tok-stored');
});

test('AxiosHeaders-style get() is honored when deciding whether a token was presented', () => {
  const withGet: any = {
    response: { status: 401, data: { message: 'Not authorized, token failed' } },
    config: { headers: { get: (k: string) => (k === 'Authorization' ? 'Bearer tok' : undefined) } },
  };
  expect(isPresentedTokenRejected(withGet)).toBe(true);
  const withGetEmpty: any = {
    response: { status: 401, data: { message: 'Not authorized, token failed' } },
    config: { headers: { get: () => undefined } },
  };
  expect(isPresentedTokenRejected(withGetEmpty)).toBe(false);
});

test('caregiver-read diagnostics expose only fixed failure categories', () => {
 const { careReadFailure }=require('../Src/Services/apiService');
 expect(careReadFailure({ response:{ status:304,data:{token:'private'} } })).toBe('HTTP 304');
 expect(careReadFailure({ code:'ECONNABORTED',message:'private URL' })).toBe('Request timed out');
 expect(careReadFailure({ code:'INVALID_PATIENT_LIST' })).toBe('Invalid server response');
 expect(careReadFailure({ message:'secret' })).toBe('Request did not complete');
});
