// Shared helper for any bulk/product email sent from this repo.
// Exists to make the חוק הספאם (Israeli anti-spam law, s.30A Communications
// Law) compliance boilerplate impossible to forget: every non-transactional
// email must (1) identify the sender, (2) offer a free one-click unsubscribe,
// (3) never go to someone who opted out. See .claude/skills/email-compliance.
import { createClient } from "@supabase/supabase-js";

const SB_URL = "https://lnxupjvvvciqscgvtomp.supabase.co";

export function adminClient() {
  return createClient(SB_URL, process.env.SERVICE_KEY);
}

// Real users (has an email, has completed onboarding) who have NOT opted out
// of product-update emails. Always use this instead of listing all users.
export async function getOptedInUsers() {
  const sb = adminClient();
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const { data: profs } = await sb
    .from("profiles")
    .select("id, name, email_opt_out");
  const byId = new Map(profs.map((p) => [p.id, p]));
  return users.users
    .filter((u) => u.email && byId.get(u.id) && !byId.get(u.id).email_opt_out)
    .map((u) => ({ id: u.id, email: u.email, name: byId.get(u.id).name }));
}

// Compliant footer: sender identity + unsubscribe link, in Hebrew, no login
// required to unsubscribe. Append this to every marketing/update email body.
export function complianceFooter(uid) {
  return `
  <p style="font-size:13px;color:#9b8189;margin-top:28px;border-top:1px solid #eee;padding-top:16px;">
    נשלח מ"אהבת חינם" (avizmaeir@gmail.com) · hugs.photos<br>
    <a href="https://hugs.photos/unsubscribe?u=${uid}" style="color:#9b8189;text-decoration:underline;">להסרה מרשימת התפוצה</a>
  </p>`;
}

// Sends one email via Resend and returns { ok, error }.
export async function sendResendEmail({ to, subject, html }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: "אהבת חינם <noreply@hugs.photos>", to: [to], subject, html }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: await r.text() };
}
