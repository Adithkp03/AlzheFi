jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { isPresentedTokenRejected } from '../Src/Services/apiService';

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
