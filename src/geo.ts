// Shared geo math for the 100k-store paths: distance + the bounding box that lets
// "near me" queries hit the retailers(lat,lng) index instead of scanning the table.

export const haversineMi = (a: number, b: number, c: number, d: number): number => {
  const R = 3958.8, r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/** Lat/lng bounding box that fully contains a radius (miles) around a point. */
export function bboxAround(lat: number, lng: number, radiusMi: number): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
  const latDelta = radiusMi / 69; // ~69 miles per degree of latitude
  const lngDelta = radiusMi / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))); // shrink-proof near poles
  return { latMin: lat - latDelta, latMax: lat + latDelta, lngMin: lng - lngDelta, lngMax: lng + lngDelta };
}
