import { createClient } from "@supabase/supabase-js";

const url = "https://lnxupjvvvciqscgvtomp.supabase.co";
const service = process.env.SERVICE_KEY;
const sb = createClient(url, service);

// Two demo users near Rothschild Blvd, Tel Aviv — with opposite worldviews
const demos = [
  {
    email: "demo-shulem@ahavat-hinam.local",
    name: "שולם (דמו)",
    emoji: "🧔",
    answers: [1, 1, 1, 1, 1, 1],
    lat: 32.0636,
    lng: 34.7746,
  },
  {
    email: "demo-noa@ahavat-hinam.local",
    name: "נעה (דמו)",
    emoji: "🧑‍🎤",
    answers: [5, 5, 5, 5, 5, 5],
    lat: 32.0662,
    lng: 34.7778,
  },
];

for (const d of demos) {
  const { data: created, error } = await sb.auth.admin.createUser({
    email: d.email,
    email_confirm: true,
  });
  let uid = created?.user?.id;
  if (error) {
    console.log("createUser:", d.email, error.message);
    const { data: list } = await sb.auth.admin.listUsers();
    uid = list.users.find((u) => u.email === d.email)?.id;
  }
  if (!uid) throw new Error("no uid for " + d.email);
  const { error: pErr } = await sb.from("profiles").upsert({
    id: uid,
    name: d.name,
    emoji: d.emoji,
    answers: d.answers,
    location: `SRID=4326;POINT(${d.lng} ${d.lat})`,
  });
  console.log("profile", d.name, pErr ? "ERR " + pErr.message : "OK", uid);
}

// verify rows
const { data: rows } = await sb.from("profiles").select("id,name,answers");
console.log("profiles in DB:", JSON.stringify(rows));
