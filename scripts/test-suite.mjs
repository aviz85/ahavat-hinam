// Integration + e2e test suite — runs against the LIVE Supabase backend.
// Creates anonymous users (marked synthetic), exercises every RPC/policy,
// asserts results, and cleans up its ephemeral users at the end.
// Usage: SERVICE_KEY=... node scripts/test-suite.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const URL = "https://lnxupjvvvciqscgvtomp.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxueHVwanZ2dmNpcXNjZ3Z0b21wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MjU2OTUsImV4cCI6MjEwMDQwMTY5NX0.pDgoCFZFUJB7tuA6OPIk4UdLbtKKmw_wCLY4OzCq5p0";
const admin = createClient(URL, process.env.SERVICE_KEY);

let pass = 0, fail = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; failures.push(name); console.log(`  ✗ ${name}: ${e.message}`); }
}

function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

// Two fresh anonymous users at opposite worldview poles, near Dizengoff Center
async function makeUser(name, answers, lat, lng) {
  const c = anonClient();
  const { data, error } = await c.auth.signInAnonymously();
  assert(!error, `anon sign-in failed: ${error?.message}`);
  const uid = data.user.id;
  const { error: pErr } = await c.from("profiles").upsert({
    id: uid, name, emoji: "🧪", answers, is_synthetic: true,
  });
  assert(!pErr, `profile upsert failed: ${pErr?.message}`);
  const { error: lErr } = await c.rpc("update_location", { p_lat: lat, p_lng: lng });
  assert(!lErr, `update_location failed: ${lErr?.message}`);
  return { c, uid };
}

const cleanup = [];
console.log("\n— auth & profiles —");
let A, B, C;
await test("anonymous sign-in + profile + location (user A, extreme 1s)", async () => {
  A = await makeUser("בדיקה א (דמו)", [1,1,1,1,1,1], 32.0750, 34.7749);
  cleanup.push(A.uid);
});
await test("anonymous sign-in + profile + location (user B, extreme 5s)", async () => {
  B = await makeUser("בדיקה ב (דמו)", [5,5,5,5,5,5], 32.0752, 34.7751);
  cleanup.push(B.uid);
});
await test("anonymous sign-in + profile + location (user C, centrist)", async () => {
  C = await makeUser("בדיקה ג (דמו)", [3,3,3,3,3,3], 32.0751, 34.7750);
  cleanup.push(C.uid);
});

console.log("\n— RLS (privacy) —");
await test("user A cannot read user B's profile", async () => {
  const { data } = await A.c.from("profiles").select("*").eq("id", B.uid);
  assert.strictEqual(data.length, 0, "B's row leaked to A");
});
await test("user A sees exactly one profile row (their own)", async () => {
  const { data } = await A.c.from("profiles").select("id");
  assert.strictEqual(data.length, 1);
  assert.strictEqual(data[0].id, A.uid);
});
await test("user A cannot update user B's profile", async () => {
  await A.c.from("profiles").update({ name: "נפרץ" }).eq("id", B.uid);
  const { data } = await admin.from("profiles").select("name").eq("id", B.uid).single();
  assert.notStrictEqual(data.name, "נפרץ", "A modified B's profile!");
});
await test("user A cannot read others' push subscriptions", async () => {
  await admin.from("push_subscriptions").upsert({
    user_id: B.uid, subscription: { endpoint: "https://example.com/fake", keys: {} },
  });
  const { data } = await A.c.from("push_subscriptions").select("*");
  assert.strictEqual(data.length, 0, "foreign push subscription leaked");
});

console.log("\n— matching (find_opposite) —");
await test("A's opposite is B (max distance in worldview), not centrist C", async () => {
  const { data, error } = await A.c.rpc("find_opposite", { radius_m: 5000 });
  assert(!error, error?.message);
  assert(data.length === 1, "no match returned");
  assert.strictEqual(data[0].id, B.uid, `matched ${data[0].name} instead of B`);
  assert.strictEqual(data[0].opposition, 24, `opposition=${data[0].opposition}, expected 24`);
});
await test("match coords are rounded to ~100m (3 decimals)", async () => {
  const { data } = await A.c.rpc("find_opposite", { radius_m: 5000 });
  const { lat, lng } = data[0];
  assert(Number((lat * 1000).toFixed(4)) % 1 === 0, `lat ${lat} not rounded`);
  assert(Number((lng * 1000).toFixed(4)) % 1 === 0, `lng ${lng} not rounded`);
});
await test("tiny radius returns no match", async () => {
  // move A ~1.6km away, then search within 100m
  await A.c.rpc("update_location", { p_lat: 32.0900, p_lng: 34.7749 });
  const { data } = await A.c.rpc("find_opposite", { radius_m: 100 });
  assert.strictEqual(data.length, 0, "match found despite 100m radius");
  await A.c.rpc("update_location", { p_lat: 32.0750, p_lng: 34.7749 });
});
await test("stale users (>7 days) are excluded", async () => {
  await admin.from("profiles").update({
    last_seen: new Date(Date.now() - 8 * 86400_000).toISOString(),
  }).eq("id", B.uid);
  const { data } = await A.c.rpc("find_opposite", { radius_m: 500 });
  assert(!data.find((m) => m.id === B.uid), "stale B still matched");
  await admin.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", B.uid);
});
await test("find_opposite returns bio + avatar_path fields", async () => {
  const { data } = await A.c.rpc("find_opposite", { radius_m: 5000 });
  assert("bio" in data[0] && "avatar_path" in data[0], "enrichment fields missing");
});

console.log("\n— storage policies —");
const png = Buffer.from("89504e470d0a1a0a0000000d494844520000000100000001080600000" +
  "01f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082", "hex");
await test("A can upload a selfie to their own folder", async () => {
  const { error } = await A.c.storage.from("hugs").upload(`${A.uid}/test.png`, png, { contentType: "image/png" });
  assert(!error, error?.message);
});
await test("A cannot upload into B's folder", async () => {
  const { error } = await A.c.storage.from("hugs").upload(`${B.uid}/intruder.png`, png, { contentType: "image/png" });
  assert(error, "upload to foreign folder was ALLOWED");
});
await test("A cannot upload a non-image to hugs", async () => {
  const { error } = await A.c.storage.from("hugs").upload(`${A.uid}/evil.html`, "<script>alert(1)</script>", { contentType: "text/html" });
  assert(error, "non-image upload was ALLOWED");
});
await test("A can upload an avatar to their own folder", async () => {
  const { error } = await A.c.storage.from("avatars").upload(`${A.uid}/avatar.png`, png, { upsert: true, contentType: "image/png" });
  assert(!error, error?.message);
});

console.log("\n— hugs & scoring (record_hug) —");
let firstHug;
await test("A hugs B: 100% opposite → exactly 100 points", async () => {
  const { data, error } = await A.c.rpc("record_hug", {
    p_hugged_id: B.uid, p_hugged_name: null,
    p_image_path: `${A.uid}/test.png`, p_caption: "חיבוק בדיקה (דמו)",
  });
  assert(!error, error?.message);
  firstHug = data[0];
  assert.strictEqual(firstHug.points, 100, `points=${firstHug.points}`);
});
await test("A's score incremented by 100 in profiles", async () => {
  const { data } = await admin.from("profiles").select("score").eq("id", A.uid).single();
  assert.strictEqual(data.score, 100);
});
await test("hug row snapshots hugger identity + points", async () => {
  const { data } = await admin.from("hugs").select("*").eq("id", firstHug.hug_id).single();
  assert.strictEqual(data.hugger_name, "בדיקה א (דמו)");
  assert.strictEqual(data.hugged_name, "בדיקה ב (דמו)");
  assert.strictEqual(data.points, 100);
});
await test("C hugs A: centrist→extreme = 50 points", async () => {
  await C.c.storage.from("hugs").upload(`${C.uid}/test.png`, png, { contentType: "image/png" });
  const { data } = await C.c.rpc("record_hug", {
    p_hugged_id: A.uid, p_hugged_name: null,
    p_image_path: `${C.uid}/test.png`, p_caption: "",
  });
  assert.strictEqual(data[0].points, 50, `points=${data[0].points}`);
});
await test("hug without a matched partner earns 0 points", async () => {
  const { data } = await B.c.rpc("record_hug", {
    p_hugged_id: null, p_hugged_name: "זר ברחוב",
    p_image_path: `${B.uid}/none.png`, p_caption: "חיבוק חופשי",
  });
  assert.strictEqual(data[0].points, 0);
});
await test("all users can read the hugs feed", async () => {
  const { data } = await C.c.from("hugs").select("id").limit(50);
  assert(data.length >= 3, `feed shows ${data.length} hugs`);
});
await test("caption longer than 280 chars is rejected", async () => {
  const { error } = await A.c.rpc("record_hug", {
    p_hugged_id: null, p_hugged_name: null,
    p_image_path: `${A.uid}/test.png`, p_caption: "א".repeat(281),
  });
  assert(error, "281-char caption was ACCEPTED");
});

console.log("\n— edge function (notify-proximity) —");
await test("rejects unauthenticated calls", async () => {
  const r = await fetch(`${URL}/functions/v1/notify-proximity`, { method: "POST" });
  assert(r.status === 401, `status ${r.status}`);
});
await test("authenticated call executes and reports push status", async () => {
  const { data: sess } = await A.c.auth.getSession();
  const r = await fetch(`${URL}/functions/v1/notify-proximity`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sess.session.access_token}`, apikey: ANON },
  });
  const text = await r.text();
  assert(r.ok, `status ${r.status}: ${text}`);
  const body = JSON.parse(text);
  assert("notified" in body, "unexpected response shape");
});

console.log("\n— cleanup ephemeral test users —");
for (const uid of cleanup) {
  await admin.from("hugs").delete().eq("hugger_id", uid);
  const { data: objs } = await admin.storage.from("hugs").list(uid);
  if (objs?.length) await admin.storage.from("hugs").remove(objs.map((o) => `${uid}/${o.name}`));
  const { data: avs } = await admin.storage.from("avatars").list(uid);
  if (avs?.length) await admin.storage.from("avatars").remove(avs.map((o) => `${uid}/${o.name}`));
  await admin.auth.admin.deleteUser(uid);
}
const { data: left } = await admin.from("profiles").select("id").in("id", cleanup);
console.log(`ephemeral users deleted: ${cleanup.length - (left?.length ?? 0)}/${cleanup.length}`);

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
if (failures.length) { console.log("FAILED:", failures.join(" | ")); process.exit(1); }
