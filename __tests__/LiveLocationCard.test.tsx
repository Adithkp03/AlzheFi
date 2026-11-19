import React from 'react';
import renderer, { act } from 'react-test-renderer';
import LiveLocationCard from '../Src/Components/Location/LiveLocationCard';

jest.mock('../Src/Services/apiService', () => ({ apiService: { getLiveLocation: jest.fn(), getZone: jest.fn() } }));
const { apiService } = require('../Src/Services/apiService');
const text = (t: renderer.ReactTestRenderer) => JSON.stringify(t.toJSON()).replace(/","/g, '');
const flush = () => act(async () => { await new Promise(r => setImmediate(() => r(undefined))); });

test('live: shows coordinates, age and inside/outside state', async () => {
  apiService.getZone.mockResolvedValue({ lat: 10, lon: 76, radiusM: 300 });
  apiService.getLiveLocation.mockResolvedValue({ status: 'live', lat: 10.0005, lon: 76, accuracyM: 8, recordedAt: 1, ageMs: 12000 });
  let t!: renderer.ReactTestRenderer;
  await act(async () => { t = renderer.create(<LiveLocationCard patientId="p1" />); });
  await flush();
  const s = text(t);
  expect(s).toContain('Updated 12s ago'); expect(s).toContain('10.00050'); expect(s).toContain('Inside the safe area'); expect(s).toContain('Not a street map');
  t.unmount();
});
test('stale: no coordinates are rendered', async () => {
  apiService.getZone.mockResolvedValue(null);
  apiService.getLiveLocation.mockResolvedValue({ status: 'stale', ageMs: 600000 });
  let t!: renderer.ReactTestRenderer;
  await act(async () => { t = renderer.create(<LiveLocationCard patientId="p1" />); });
  await flush();
  const s = text(t);
  expect(s).toContain('Stale'); expect(s).not.toMatch(/10\.\d{5}/); expect(s).not.toContain('Open in Maps');
  t.unmount();
});
test('server error after a live read drops the old position', async () => {
  apiService.getZone.mockResolvedValue(null);
  apiService.getLiveLocation.mockResolvedValueOnce({ status: 'live', lat: 10.1, lon: 76, accuracyM: 5, recordedAt: 1, ageMs: 1000 });
  let t!: renderer.ReactTestRenderer;
  jest.useFakeTimers();
  await act(async () => { t = renderer.create(<LiveLocationCard patientId="p1" />); });
  apiService.getLiveLocation.mockRejectedValue(new Error('net'));
  await act(async () => { jest.advanceTimersByTime(15000); });
  jest.useRealTimers(); await flush();
  const s = text(t);
  expect(s).toContain('Cannot reach the server'); expect(s).not.toContain('10.10000');
  t.unmount();
});
