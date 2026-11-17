/** Local equirectangular projection around a point; fine at the few-km scale of a safe area. Pure, unit-tested. */
export const metersBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (b.lat - a.lat) * 111_320;
  const dx = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return { dx, dy };
};

export interface RadarLayout {
  zone: { cx: number; cy: number; r: number } | null;
  patient: { x: number; y: number; accR: number };
  metersPerPx: number;
  scaleLabel: string;
  scaleBarPx: number;
  distanceM: number | null;
  patientOutside: boolean | null;
}

/** Place zone centre and patient on a size x size canvas. With no zone, the patient is centred. */
export function layoutRadar(
  patient: { lat: number; lon: number; accuracyM: number },
  zone: { lat: number; lon: number; radiusM: number } | null,
  size: number,
): RadarLayout {
  const half = size / 2; const pad = 0.8;
  const p = zone ? metersBetween(zone, patient) : { dx: 0, dy: 0 };
  const reach = Math.max(zone ? zone.radiusM : 0, Math.hypot(p.dx, p.dy) + patient.accuracyM, 50);
  const mpp = reach / (half * pad);
  const px = half + p.dx / mpp;
  const py = half - p.dy / mpp;                                  // north up
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const target = (size * 0.25) * mpp;
  const bar = nice.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), nice[0]);
  return {
    zone: zone ? { cx: half, cy: half, r: zone.radiusM / mpp } : null,
    patient: { x: px, y: py, accR: Math.max(3, patient.accuracyM / mpp) },
    metersPerPx: mpp,
    scaleBarPx: bar/mpp,
    distanceM: zone ? Math.hypot(p.dx,p.dy) : null,
    scaleLabel: bar >= 1000 ? `${bar / 1000} km` : `${bar} m`,
    patientOutside: zone ? Math.hypot(p.dx, p.dy) > zone.radiusM : null,
  };
}
