---
name: email-compliance
description: Send any bulk/product email from this repo in a way that complies with the Israeli anti-spam law (חוק הספאם, s.30A Communications Law). Use whenever sending an update, announcement, digest, or any email to more than one user of Ahavat Hinam.
---

# Email compliance for Ahavat Hinam

**Why this exists:** on 2026-07-27 a friend (שחר) flagged that the beta-update
email sent to all users had no unsubscribe link — a real violation of s.30A
of the Israeli Communications Law ("חוק הספאם"). That law allows statutory
damages up to ₪1,000 **per email, per recipient, without needing to prove any
harm** — and it's cumulative. Never send a bulk email again without going
through this checklist.

**Not legal advice** — this is engineering-level compliance, not a legal
opinion. For anything beyond routine product-update emails (real marketing
campaigns, paid features, anything contested), get an actual lawyer.

## The three hard requirements

1. **Sender identification.** Every email must clearly show who sent it.
   Already satisfied by using `from: "אהבת חינם <noreply@hugs.photos>"`.
2. **Mark the nature of the message** somewhere prominent (e.g. an update,
   a feature announcement) — don't disguise a promotional email as a purely
   transactional one.
3. **A free, one-click, no-login unsubscribe** in every single email. This is
   non-negotiable and must actually work.

## What NOT to do

- Don't email a user who has `profiles.email_opt_out = true`.
- Don't hand-roll a new "list all users" query — it will forget the opt-out
  filter. Always go through the shared helper.
- Don't skip the footer "because it's just a small update" — the law doesn't
  have a de-minimis exception, and the past incident happened exactly because
  of that reasoning.

## How to send a compliant email (the only way)

```js
import { getOptedInUsers, complianceFooter, sendResendEmail } from "../scripts/lib/mailer.mjs";

const targets = await getOptedInUsers(); // never .listUsers() directly
for (const u of targets) {
  const html = `... your content ... ${complianceFooter(u.id)}`;
  await sendResendEmail({ to: u.email, subject: "...", html });
}
```

- `getOptedInUsers()` — real users only, `email_opt_out = false` only.
- `complianceFooter(uid)` — sender identity + a working unsubscribe link
  (`https://hugs.photos/unsubscribe?u=<uid>`), append it to every email body.
- The unsubscribe page (`app/unsubscribe/page.tsx`) calls the
  `unsubscribe_email(p_uid)` RPC — no login required, sets the opt-out flag
  immediately. See migration `20260727100000_email_unsubscribe.sql`.

## Transactional emails are exempt — leave those alone

Auth emails (magic-link sign-in, password reset) are service messages the
user needs to use the product; they are NOT subject to this checklist and
must keep going out even to users who opted out of *update* emails. Don't
add an unsubscribe link to those — it would be actively wrong (a user can't
"opt out" of being able to log in).

## Before every bulk send

1. `getOptedInUsers()` for the recipient list — never hand-build one.
2. Body includes `complianceFooter(uid)`.
3. Send **one test copy to yourself first**, click the unsubscribe link,
   confirm in the DB that `email_opt_out` flipped, then re-flip it back to
   `false` before the real send (or just use a different test user).
4. After sending, spot-check delivery in the Resend dashboard/API
   (`last_event: "delivered"`) — don't just trust the HTTP 200.

## UX principle (why this stayed lightweight)

We did **not** add a mandatory marketing-consent checkbox to onboarding —
that's real friction for zero UX benefit here, since the "existing customer"
notice-and-object model covers product updates about the same service the
user already signed up for. Instead: one sentence was added to the existing
registration consent line (giving notice + telling users they can opt out
any time), and the entire enforcement lives in the unsubscribe mechanism.
If this project ever sends genuine third-party marketing (not just "here's
what's new in the app you use"), that's a different, stricter bar — ask
first, don't assume this checklist covers it.
