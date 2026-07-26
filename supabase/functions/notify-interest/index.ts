// Pushes the interest signal: caller has saved `saved_id`; notify that person
// "X מגלה עניין להיפגש איתך לחיבוק". If the interest is mutual — celebrate both.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

webpush.setVapidDetails(
  "mailto:avizmaeir@gmail.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

async function pushTo(userId: string, payload: Record<string, string>) {
  const { data } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;
  try {
    await webpush.sendNotification(data.subscription, JSON.stringify(payload));
    return true;
  } catch {
    await admin.from("push_subscriptions").delete().eq("user_id", userId);
    return false;
  }
}

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const { data: userData } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return new Response("unauthorized", { status: 401 });

  const { saved_id } = await req.json().catch(() => ({}));
  if (!saved_id) return new Response("bad request", { status: 400 });

  // the claim must be real: a saved_people row from me → them (RLS lets me see my own)
  const { data: row } = await userClient
    .from("saved_people")
    .select("saved_id")
    .eq("user_id", uid)
    .eq("saved_id", saved_id)
    .maybeSingle();
  if (!row) return new Response("no such interest", { status: 403 });

  const { data: names } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", [uid, saved_id]);
  const myName = names?.find((n) => n.id === uid)?.name ?? "מישהו";
  const theirName = names?.find((n) => n.id === saved_id)?.name ?? "מישהו";

  const { data: reciprocal } = await admin
    .from("saved_people")
    .select("user_id")
    .eq("user_id", saved_id)
    .eq("saved_id", uid)
    .maybeSingle();

  let sent = 0;
  if (reciprocal) {
    if (await pushTo(saved_id, {
      title: "🎉 עניין הדדי!",
      body: `גם ${myName} שמר/ה אותך — שניכם מגלים עניין. הדרכים שלכם עוד יצטלבו 🤗`,
      url: "/mission",
    })) sent++;
    if (await pushTo(uid, {
      title: "🎉 עניין הדדי!",
      body: `${theirName} כבר שמר/ה אותך קודם — שניכם מגלים עניין 🤗`,
      url: "/mission",
    })) sent++;
    await admin.from("app_events").insert({ user_id: uid, event: "interest_mutual", props: { with: saved_id } });
  } else {
    if (await pushTo(saved_id, {
      title: "⭐ מגלים בך עניין!",
      body: `${myName} שמר/ה אותך לעתיד. היכנסו לאשר עדכון כשתהיו קרובים במקרה 🤗`,
      url: "/mission",
    })) sent++;
  }
  return Response.json({ notified: sent > 0, mutual: !!reciprocal });
});
