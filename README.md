# אהבת חינם ❤️ Ahavat Hinam

**מצאו את מי שהכי הפוך מכם בהשקפת העולם — ותנו לו חיבוק.**

Find the person nearest you whose worldview is the *most opposite* of yours — then go give them a real hug, take a selfie together, and share it.

> נאמר על ירושלים שחרבה בגלל שנאת חינם. הפרויקט הזה הוא ניסוי חברתי בכיוון ההפוך: אהבת חינם — אהבה שלא תלויה בדבר, ודווקא כלפי מי שרחוק ממך ביותר.

## How it works

1. **שאלון השקפה** — answer 6 multiple-choice questions (religion, economy, security, society, identity, future). Your answers become a worldview vector.
2. **התאמה הפוכה** — with your GPS location, a PostGIS query finds the user within 50km whose vector is *farthest* from yours.
3. **המשימה** — walk over, introduce yourself, and give a genuine hug 🤗.
4. **הסלפי** — snap a selfie together, add a few words, and post it to the shared hug feed.

## Stack

- **Next.js 16** (App Router, RTL Hebrew, installable PWA)
- **Supabase** — anonymous auth, Postgres + PostGIS (`find_opposite` RPC), Storage for selfies
- **Tailwind CSS 4**

## Privacy by design

- Worldview answers and exact location are **never readable by other users** (RLS: each user reads only their own profile).
- Matching runs inside a `security definer` RPC; it returns only a name, an emoji, a distance, and coordinates rounded to ~100m.
- Matches are limited to users active in the last 7 days.
- No email, no phone — anonymous sign-in only. Users choose a display name and an emoji avatar.

## Run it yourself

```bash
git clone https://github.com/aviz85/ahavat-hinam
cd ahavat-hinam && npm install
```

Create a [Supabase](https://supabase.com) project, then:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Enable **anonymous sign-ins** (Authentication → Sign In / Up → Anonymous), then create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

```bash
npm run dev
```

Optionally seed two demo users with opposite worldviews (uses the service key, never commit it):

```bash
SERVICE_KEY=<service-role-key> node scripts/seed-demo.mjs
```

## License

MIT — like all love projects, free of charge. אהבת חינם.
