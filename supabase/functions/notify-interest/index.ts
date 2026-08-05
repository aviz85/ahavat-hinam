// Called by the client right after saving/signaling interest in someone.
// Notifies the SAVED person on every channel we can reach them on — push
// (if they've granted it) AND email (if they haven't opted out) — because
// the person this fires for is very often exactly the one NOT actively
// using the app right now ("he's not connected"). Idempotent: fires at
// most once per (user_id, saved_id) row, even if the client calls it again.
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

// Profile names are user-chosen free text — never interpolate one into
// email HTML unescaped (a name like `<img src=x onerror=...>` fits the
// 30-char limit easily).
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

// Same compliance contract as scripts/lib/mailer.mjs (see
// .claude/skills/email-compliance): sender identity + working, no-login
// unsubscribe on every non-transactional email, and skip anyone opted out.
async function emailTo(uid: string, subject: string, bodyHtml: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("email_opt_out")
    .eq("id", uid)
    .maybeSingle();
  if (profile?.email_opt_out) return false;

  const { data: userRes } = await admin.auth.admin.getUserById(uid);
  const email = userRes?.user?.email;
  if (!email) return false;

  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#fff7f2;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:28px 22px;text-align:right;direction:rtl;">
    <div style="font-size:44px;text-align:center;">⭐</div>
    <p style="font-size:16px;line-height:1.8;color:#3b1f2b;">${bodyHtml}</p>
    <a href="https://hugs.photos" style="display:block;text-align:center;background:linear-gradient(135deg,#e85d75,#c9184a);color:#fff;text-decoration:none;font-weight:bold;font-size:16px;padding:12px 28px;border-radius:999px;margin:16px auto;width:fit-content;">להיכנס לאהבת חינם ←</a>
    <p style="font-size:13px;color:#9b8189;margin-top:24px;border-top:1px solid #eee;padding-top:14px;text-align:center;">
      נשלח מ"אהבת חינם" (avizmaeir@gmail.com) · hugs.photos<br>
      <a href="https://hugs.photos/unsubscribe?u=${uid}" style="color:#9b8189;text-decoration:underline;">להסרה מרשימת התפוצה</a>
    </p>
  </div></body></html>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "אהבת חינם <noreply@hugs.photos>", to: [email], subject, html }),
  });
  return r.ok;
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
    .select("saved_id, notified_at")
    .eq("user_id", uid)
    .eq("saved_id", saved_id)
    .maybeSingle();
  if (!row) return new Response("no such interest", { status: 403 });
  if (row.notified_at) return Response.json({ notified: false, reason: "already_notified" });

  const { data: names } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", [uid, saved_id]);
  // raw names for push (plain text, no HTML risk); escaped versions for
  // anything going into the email HTML body
  const myName = names?.find((n) => n.id === uid)?.name ?? "מישהו";
  const theirName = names?.find((n) => n.id === saved_id)?.name ?? "מישהו";
  const myNameHtml = escapeHtml(myName);
  const theirNameHtml = escapeHtml(theirName);

  const { data: reciprocal } = await admin
    .from("saved_people")
    .select("user_id, notified_at")
    .eq("user_id", saved_id)
    .eq("saved_id", uid)
    .maybeSingle();

  let sent = 0;
  if (reciprocal) {
    const pushed = await pushTo(saved_id, {
      title: "🎉 עניין הדדי!",
      body: `גם ${myName} שמר/ה אותך — שניכם מגלים עניין. הדרכים שלכם עוד יצטלבו 🤗`,
      url: "/mission",
    });
    const emailed = await emailTo(
      saved_id,
      "🎉 עניין הדדי באהבת חינם!",
      `גם <b>${myNameHtml}</b> שמר/ה אתכם לעתיד — שניכם מגלים עניין זה בזה. הדרכים שלכם עוד יצטלבו.`
    );
    if (pushed || emailed) sent++;

    if (!reciprocal.notified_at) {
      const pushed2 = await pushTo(uid, {
        title: "🎉 עניין הדדי!",
        body: `${theirName} כבר שמר/ה אותך קודם — שניכם מגלים עניין 🤗`,
        url: "/mission",
      });
      const emailed2 = await emailTo(
        uid,
        "🎉 עניין הדדי באהבת חינם!",
        `<b>${theirNameHtml}</b> כבר שמר/ה אתכם קודם — שניכם מגלים עניין זה בזה.`
      );
      if (pushed2 || emailed2) sent++;
      await admin
        .from("saved_people")
        .update({ notified_at: new Date().toISOString() })
        .eq("user_id", saved_id)
        .eq("saved_id", uid);
    }
    await admin
      .from("app_events")
      .insert({ user_id: uid, event: "interest_mutual", props: { with: saved_id } });
  } else {
    const pushed = await pushTo(saved_id, {
      title: "⭐ מגלים בך עניין!",
      body: `${myName} שמר/ה אותך לעתיד. היכנסו לאשר עדכון כשתהיו קרובים במקרה 🤗`,
      url: "/mission",
    });
    const emailed = await emailTo(
      saved_id,
      "⭐ מישהו מגלה בך עניין באהבת חינם",
      `<b>${myNameHtml}</b> נכנס/ה לאהבת חינם, מצא/ה אתכם, ושמר/ה אתכם לעתיד — מגלה עניין להיפגש איתכם לחיבוק. אולי גם אתם?`
    );
    if (pushed || emailed) sent++;
  }

  await admin
    .from("saved_people")
    .update({ notified_at: new Date().toISOString() })
    .eq("user_id", uid)
    .eq("saved_id", saved_id);

  return Response.json({ notified: sent > 0, mutual: !!reciprocal });
});
