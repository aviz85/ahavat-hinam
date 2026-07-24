// Product stats report. Usage: SERVICE_KEY=... node scripts/stats.mjs [days]
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  "https://lnxupjvvvciqscgvtomp.supabase.co",
  process.env.SERVICE_KEY
);
const days = Number(process.argv[2] ?? 7);
const since = new Date(Date.now() - days * 86400e3).toISOString();

const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
const { data: profiles } = await sb.from("profiles").select("id,name,score,last_seen");
const { data: hugs } = await sb.from("hugs").select("id,points,verified,created_at");
const { data: likes } = await sb.from("hug_likes").select("hug_id");
const { data: events } = await sb
  .from("app_events")
  .select("event,props,user_id,created_at")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(5000);

console.log(`=== אהבת חינם — ${days} ימים אחרונים ===\n`);
console.log(`חשבונות: ${users.users.length} | פרופילים מלאים: ${profiles.length} | חיבוקים: ${hugs.length} (${hugs.filter(h=>h.verified).length} מאומתים) | לייקים: ${likes.length}`);

const counts = {};
for (const e of events ?? []) counts[e.event] = (counts[e.event] ?? 0) + 1;
console.log("\n— אירועים —");
for (const [ev, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
  console.log(`  ${ev}: ${n}`);

const shares = (events ?? []).filter((e) => e.event === "invite_shared");
if (shares.length) {
  console.log(`\n— שיתופים (${shares.length}) —`);
  const names = new Map(profiles.map((p) => [p.id, p.name]));
  for (const s of shares)
    console.log(`  ${s.created_at.slice(0, 16)} | ${names.get(s.user_id) ?? "אנונימי"} | ${s.props?.method}`);
}

const active = profiles.filter(p => new Date(p.last_seen) > new Date(Date.now() - 86400e3));
console.log(`\nפעילים ב-24 שעות: ${active.length} | טבלת ניקוד: ${profiles.filter(p=>p.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(p=>`${p.name}(${p.score})`).join(", ") || "עוד אין נקודות"}`);
