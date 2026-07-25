// Live rendezvous helpers: pair channel naming, bearing math, shared beacon.

// Same channel name for both sides regardless of who opens first
export function pairChannel(a: string, b: string) {
  return "meet:" + [a, b].sort().join(":");
}

// Initial bearing from point 1 to point 2, degrees clockwise from north
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dφ = toRad(lat2 - lat1), dλ = toRad(lng2 - lng1);
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const BEACON_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#7b2cbf", "#0077b6", "#ff5d8f"];
const BEACON_EMOJIS = ["🦄", "🌈", "🎈", "🌻", "🐬", "🍉", "⭐", "🎺"];

// Deterministic from the pair — both phones compute the SAME beacon
export function beaconFor(a: string, b: string) {
  const s = [a, b].sort().join("");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return {
    color: BEACON_COLORS[h % BEACON_COLORS.length],
    emoji: BEACON_EMOJIS[(h >> 3) % BEACON_EMOJIS.length],
  };
}
