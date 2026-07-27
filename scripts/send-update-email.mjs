// Reference implementation for any future product-update email.
// Always: getOptedInUsers() (never all users) + complianceFooter(uid).
// See .claude/skills/email-compliance for the legal background.
import { getOptedInUsers, complianceFooter, sendResendEmail } from "./lib/mailer.mjs";

const targets = await getOptedInUsers();

const html = (name, uid) => `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#fff7f2;font-family:Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 24px;text-align:center;direction:rtl;">
  <div style="font-size:56px;">🧪</div>
  <h1 style="color:#c9184a;margin:12px 0;">${name}, יש חדש באהבת חינם!</h1>
  <p style="font-size:17px;line-height:1.8;color:#3b1f2b;text-align:right;">
    אתם בין המשתמשים הראשונים של האפליקציה — ותודה על זה 🙏<br><br>
    חשוב שתדעו: <b>אנחנו עדיין בבטא</b>. האפליקציה חיה, אבל משתנה כל יום — מוסיפים,
    מתקנים, ולומדים תוך כדי תנועה.<br><br>
    השבוע נוספו כמה דברים:
  </p>
  <ul style="text-align:right;font-size:16px;line-height:1.9;color:#3b1f2b;padding-right:20px;">
    <li><b>ניווט חי למפגש 🧭</b> — במקום מפות כלליות, חץ ומרחק חיים שמובילים ישר לצד השני, ומסך מיוחד שעוזר לזהות אחד את השני בשטח</li>
    <li><b>מפגש יזום 🤝</b> — רוצים להיפגש עם חבר ספציפי (גם בלי קשר להתאמה)? יש עכשיו קישור מיוחד לזה, בפרופיל שלכם</li>
    <li><b>שמירה לעתיד ⭐</b> — מצאתם מישהו מעניין אבל לא הזמן להיפגש עכשיו? אפשר לשמור אותו, ואם הוא יאשר — נעדכן אתכם אם תהיו קרובים במקרה בעתיד</li>
    <li><b>הזמנת חברים 💌</b> — לינק אישי בפרופיל; חבר שמצטרף דרככם = 25 נקודות אליכם</li>
  </ul>
  <p style="font-size:17px;line-height:1.8;color:#3b1f2b;">
    <b>הכי חשוב לנו: מה אתם חושבים?</b><br>
    מה עבד, מה בלבל, מה חסר, מה הרגיש מוזר — הכל עוזר.
  </p>
  <a href="mailto:avizmaeir@gmail.com?subject=פידבק%20על%20אהבת%20חינם" style="display:inline-block;background:linear-gradient(135deg,#e85d75,#c9184a);color:#fff;text-decoration:none;font-weight:bold;font-size:17px;padding:13px 32px;border-radius:999px;margin:12px 0;">כתבו לנו פידבק ←</a>
  <a href="https://hugs.photos" style="display:block;margin-top:10px;color:#c9184a;font-weight:bold;text-decoration:underline;">חזרה לאפליקציה: hugs.photos</a>
  ${complianceFooter(uid)}
</div></body></html>`;

let sent = 0, failed = 0;
for (const u of targets) {
  const { ok, error } = await sendResendEmail({
    to: u.email,
    subject: `🧪 ${u.name}, יש חדש באהבת חינם — ואנחנו רוצים לשמוע ממך`,
    html: html(u.name, u.id),
    uid: u.id,
  });
  if (ok) sent++; else { failed++; console.log("FAIL", u.email, error); }
  console.log(u.email, "->", ok ? "sent" : "FAILED");
  await new Promise((res) => setTimeout(res, 550));
}
console.log(`\nDONE: ${sent} sent, ${failed} failed, out of ${targets.length}`);
