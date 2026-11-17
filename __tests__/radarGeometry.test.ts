import { layoutRadar, metersBetween } from '../Src/Components/Location/radarGeometry';

test('patient at zone centre is drawn at canvas centre, inside', () => {
  const l = layoutRadar({ lat: 10, lon: 76, accuracyM: 10 }, { lat: 10, lon: 76, radiusM: 300 }, 240);
  expect(l.patient.x).toBeCloseTo(120); expect(l.patient.y).toBeCloseTo(120);
  expect(l.patientOutside).toBe(false);
});
test('patient 400 m north of a 300 m zone is above centre, outside, and still on canvas', () => {
  const l = layoutRadar({ lat: 10 + 400 / 111_320, lon: 76, accuracyM: 10 }, { lat: 10, lon: 76, radiusM: 300 }, 240);
  expect(l.patient.y).toBeLessThan(120); expect(l.patient.y).toBeGreaterThan(0);
  expect(l.patientOutside).toBe(true);
  expect(l.zone!.r).toBeLessThan(120);
});
test('east is right of centre', () => {
  const l = layoutRadar({ lat: 10, lon: 76 + 0.002, accuracyM: 5 }, { lat: 10, lon: 76, radiusM: 300 }, 240);
  expect(l.patient.x).toBeGreaterThan(120);
});
test('no zone: patient centred, outside unknown', () => {
  const l = layoutRadar({ lat: 10, lon: 76, accuracyM: 20 }, null, 240);
  expect(l.zone).toBeNull(); expect(l.patientOutside).toBeNull(); expect(l.patient.x).toBeCloseTo(120);
});
test('metersBetween is roughly 111 km per degree latitude', () => {
  expect(metersBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }).dy).toBeCloseTo(111_320, -2);
});

test('scale line and saved-centre distance reflect actual projection not radius',()=>{const l=layoutRadar({lat:10+400/111320,lon:76,accuracyM:100},{lat:10,lon:76,radiusM:100},220);expect(l.distanceM).toBeCloseTo(400);expect(l.scaleBarPx*l.metersPerPx).toBeCloseTo(200);expect(l.scaleLabel).toBe('200 m');expect(l.zone!.r*l.metersPerPx).toBeCloseTo(100);});
