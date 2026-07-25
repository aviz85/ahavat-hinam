// Simulated rendezvous partner (side B) for e2e-testing /meet.
// Joins the pair channel, reports every fix received from side A,
// then walks closer in stages and finally waves.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const SB = "https://lnxupjvvvciqscgvtomp.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxueHVwanZ2dmNpcXNjZ3Z0b21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MjU2OTUsImV4cCI6MjEwMDQwMTY5NX0.pDgoCFZFUJB7tuA6OPIk4UdLbtKKmw_wCLY4OzCq5p0";

const cfgPath = process.argv[2];
const { A, B } = JSON.parse(readFileSync(cfgPath, "utf8"));
const chanName = "meet:" + [A.uid, B.uid].sort().join(":");

const sb = createClient(SB, ANON, { auth: { persistSession: false } });
let gotFromA = 0;

const chan = sb.channel(chanName);
chan.on("broadcast", { event: "fix" }, ({ payload }) => {
  if (payload.from === A.uid) {
    gotFromA++;
    console.log(`RECV fix from A #${gotFromA}: ${payload.lat},${payload.lng}`);
  }
});
await new Promise((r) => chan.subscribe((s) => s === "SUBSCRIBED" && r()));
console.log("B subscribed to", chanName);

const send = (lat, lng) =>
  chan.send({ type: "broadcast", event: "fix", payload: { from: B.uid, lat, lng } });

// stage 1: ~550m away, heartbeat for 12s
for (let i = 0; i < 4; i++) {
  await send(32.075, 34.7749);
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("STAGE far done (sent 550m fixes)");

// stage 2: ~60m
for (let i = 0; i < 3; i++) {
  await send(32.07053, 34.7749);
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("STAGE mid done (60m)");

// stage 3: ~8m → beacon must light
for (let i = 0; i < 4; i++) {
  await send(32.070065, 34.7749);
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("STAGE close done (8m)");

await chan.send({ type: "broadcast", event: "wave", payload: { from: B.uid } });
console.log("WAVE sent");
await new Promise((r) => setTimeout(r, 8000));
console.log(`SUMMARY: fixes received from A (browser side): ${gotFromA}`);
process.exit(0);
