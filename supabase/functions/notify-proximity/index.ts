// Called by the client right after it updates its location.
// Finds the caller's most-opposite active user within ALERT_RADIUS_M and
// web-pushes BOTH sides, with a per-user cooldown.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const ALERT_RADIUS_M = 2000;
const COOLDOWN_MIN = 60;

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
    await webpush.sendNotification(
      data.subscription,
      JSON.stringify(payload)
    );
    return true;
  } catch {
    // stale subscription — drop it
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

  const { data: matches } = await userClient.rpc("find_opposite", {
    radius_m: ALERT_RADIUS_M,
  });
  const match = matches?.[0];
  if (!match) return Response.json({ notified: false, reason: "no match" });

  const { data: pair } = await admin
    .from("profiles")
    .select("id, name, last_proximity_push")
    .in("id", [uid, match.id]);
  const cutoff = Date.now() - COOLDOWN_MIN * 60_000;
  const fresh = (p?: { last_proximity_push: string | null }) =>
    !p?.last_proximity_push || new Date(p.last_proximity_push).getTime() < cutoff;
  const meRow = pair?.find((p) => p.id === uid);
  const otherRow = pair?.find((p) => p.id === match.id);

  const dist =
    match.distance_m < 1000
      ? `${Math.round(match.distance_m)} מטר`
      : `${(match.distance_m / 1000).toFixed(1)} ק"מ`;

  let sent = 0;
  if (fresh(meRow)) {
    if (
      await pushTo(uid, {
        title: "ההפך שלך קרוב! 🎯",
        body: `${match.name} נמצא/ת במרחק ${dist} ממך. לכו לתת חיבוק! 🤗`,
        url: "/mission",
      })
    )
      sent++;
    await admin
      .from("profiles")
      .update({ last_proximity_push: new Date().toISOString() })
      .eq("id", uid);
  }
  if (fresh(otherRow) && meRow) {
    if (
      await pushTo(match.id, {
        title: "ההפך שלך קרוב! 🎯",
        body: `${meRow.name} נמצא/ת במרחק ${dist} ממך. לכו לתת חיבוק! 🤗`,
        url: "/mission",
      })
    )
      sent++;
    await admin
      .from("profiles")
      .update({ last_proximity_push: new Date().toISOString() })
      .eq("id", match.id);
  }
  return Response.json({ notified: sent > 0, sent });
});
