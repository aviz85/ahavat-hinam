// Seeds SYNTHETIC demo users (marked: is_synthetic=true, name suffix "(דמו)",
// email domain @ahavat-hinam.local). Usage: SERVICE_KEY=... node scripts/seed-demo.mjs
import { createClient } from "@supabase/supabase-js";

const url = "https://lnxupjvvvciqscgvtomp.supabase.co";
const sb = createClient(url, process.env.SERVICE_KEY);

// Spread around central Tel Aviv with a full spectrum of worldview vectors
const demos = [
  { email: "demo-shulem@ahavat-hinam.local", name: "שולם (דמו)", emoji: "🧔", answers: [1,1,1,1,1,1], lat: 32.0636, lng: 34.7746, bio: "אברך מבני ברק. מאמין שכל יהודי הוא אח." },
  { email: "demo-noa@ahavat-hinam.local", name: "נעה (דמו)", emoji: "🧑‍🎤", answers: [5,5,5,5,5,5], lat: 32.0662, lng: 34.7778, bio: "אמנית רחוב מפלורנטין. העולם הוא הבית שלי." },
  { email: "demo-yossi@ahavat-hinam.local", name: "יוסי (דמו)", emoji: "👨‍🦱", answers: [2,1,1,2,1,2], lat: 32.0701, lng: 34.7820, bio: "קבלן, מצביע ימין כל החיים, לב רחב." },
  { email: "demo-maya@ahavat-hinam.local", name: "מאיה (דמו)", emoji: "👩", answers: [4,5,5,4,5,4], lat: 32.0580, lng: 34.7700, bio: "דוקטורנטית לפילוסופיה. שואלת שאלות." },
  { email: "demo-rivka@ahavat-hinam.local", name: "רבקה (דמו)", emoji: "🧕", answers: [1,2,2,1,2,1], lat: 32.0850, lng: 34.7750, bio: "אמא לשישה, מורה, אוהבת אדם." },
  { email: "demo-tom@ahavat-hinam.local", name: "תום (דמו)", emoji: "😎", answers: [3,3,3,3,3,3], lat: 32.0640, lng: 34.7800, bio: "בדיוק באמצע של הכל. גם וגם." },
  { email: "demo-avi@ahavat-hinam.local", name: "אבי (דמו)", emoji: "👴", answers: [2,2,1,1,2,1], lat: 32.0755, lng: 34.7683, bio: "גמלאי צה\"ל. המדינה הזאת יקרה לי." },
  { email: "demo-shira@ahavat-hinam.local", name: "שירה (דמו)", emoji: "🦸", answers: [5,4,5,5,4,5], lat: 32.0610, lng: 34.7730, bio: "פעילה חברתית. חולמת בגדול." },
];

const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const d of demos) {
  let uid = list.users.find((u) => u.email === d.email)?.id;
  if (!uid) {
    const { data: created, error } = await sb.auth.admin.createUser({
      email: d.email,
      email_confirm: true,
    });
    if (error) { console.log("createUser ERR", d.email, error.message); continue; }
    uid = created.user.id;
  }
  const { error: pErr } = await sb.from("profiles").upsert({
    id: uid,
    name: d.name,
    emoji: d.emoji,
    answers: d.answers,
    bio: d.bio,
    location: `SRID=4326;POINT(${d.lng} ${d.lat})`,
    last_seen: new Date().toISOString(),
    is_synthetic: true,
  });
  console.log(d.name, pErr ? "ERR " + pErr.message : "OK");
}

const { data: rows } = await sb
  .from("profiles")
  .select("name, is_synthetic")
  .eq("is_synthetic", true);
console.log(`synthetic profiles in DB: ${rows.length}`);
