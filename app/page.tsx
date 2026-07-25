"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { QUESTIONS, EMOJIS } from "@/lib/questions";
import { logEvent } from "@/lib/events";

type Pending = { name: string; emoji: string; answers: number[] };

function refFor(uid: string): string | null {
  const r = localStorage.getItem("ref_by");
  return r && r !== uid ? r : null;
}

function readPending(meta: Record<string, unknown> | undefined): Pending | null {
  const raw = localStorage.getItem("pending_profile");
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p?.name && Array.isArray(p?.answers)) return p;
    } catch {}
  }
  // fallback: answers embedded in the auth account itself (survives switching
  // browsers when the email verification link opens elsewhere)
  if (meta?.pending_name && Array.isArray(meta?.pending_answers)) {
    return {
      name: String(meta.pending_name),
      emoji: String(meta.pending_emoji ?? "🙂"),
      answers: meta.pending_answers as number[],
    };
  }
  return null;
}

export default function Onboarding() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  // step: -1 intro, 0..n-1 questions, n name+emoji, n+1 register (only if not signed in)
  const [step, setStep] = useState(-1);
  const [hasSession, setHasSession] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // capture referral before anything else — survives the whole funnel
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && /^[0-9a-f-]{36}$/.test(ref)) {
      localStorage.setItem("ref_by", ref);
      logEvent("referral_link_opened", { ref });
    }
    const sb = supabase();
    let routed = false;

    async function routeUser(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
      if (routed) return;
      if (!user) {
        setChecking(false);
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        routed = true;
        router.replace("/mission");
        return;
      }
      // signed in, no profile yet — restore saved quiz answers if we have them
      // (localStorage, or the account metadata that rode inside the email link)
      const pending = readPending(user.user_metadata);
      if (pending) {
        const { error: insErr } = await sb.from("profiles").insert({
          id: user.id,
          name: pending.name,
          emoji: pending.emoji,
          answers: pending.answers,
          referred_by: refFor(user.id) ?? (user.user_metadata?.pending_ref as string | undefined) ?? null,
        });
        if (!insErr || insErr.code === "23505") {
          logEvent("profile_created", { path: "recovered_after_auth" });
          localStorage.removeItem("pending_profile");
          routed = true;
          router.replace("/mission");
          return;
        }
      }
      // no saved answers anywhere — quiz only, no second registration
      setHasSession(true);
      setChecking(false);
    }

    sb.auth.getSession().then(({ data }) => routeUser(data.session?.user ?? null));
    // the session from a verification link is set moments AFTER first paint —
    // this listener catches it and routes correctly (fixes the quiz loop)
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) routeUser(session.user);
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  function stash(a: number[], n: string, e: string) {
    localStorage.setItem(
      "pending_profile",
      JSON.stringify({ name: n.trim(), emoji: e, answers: a } satisfies Pending)
    );
  }

  // signed-in user finishing the quiz: create the profile right away
  async function createProfileNow() {
    setBusy(true);
    setError(null);
    const sb = supabase();
    const { data: userData } = await sb.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setHasSession(false);
      setStep(QUESTIONS.length + 1);
      setBusy(false);
      return;
    }
    const { error: insErr } = await sb.from("profiles").insert({
      id: uid,
      name: name.trim(),
      emoji,
      answers,
      referred_by: refFor(uid),
    });
    if (insErr && insErr.code !== "23505") {
      setError(insErr.message);
      setBusy(false);
      return;
    }
    localStorage.removeItem("pending_profile");
    logEvent("profile_created", { path: "signed_in_quiz" });
    router.replace("/mission");
  }

  async function registerWithEmail() {
    setBusy(true);
    setError(null);
    try {
      stash(answers, name, emoji);
      logEvent("registration_email_submitted");
      const { error: otpErr } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin + "/",
          // embed the quiz in the account itself so the profile can be
          // created even when the email link opens in a different browser
          data: {
            pending_name: name.trim(),
            pending_emoji: emoji,
            pending_answers: answers,
            pending_ref: localStorage.getItem("ref_by"),
          },
        },
      });
      if (otpErr) throw otpErr;
      setLinkSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שליחת המייל נכשלה, נסו שוב");
    }
    setBusy(false);
  }

  async function registerWithGoogle() {
    setBusy(true);
    setError(null);
    stash(answers, name, emoji);
    logEvent("registration_google_clicked");
    const { error: oErr } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/" },
    });
    if (oErr) {
      setError("התחברות Google נכשלה — נסו במייל 🙏");
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-5xl float">❤️</div>
      </main>
    );
  }

  if (step === -1) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="text-7xl float">🤗</div>
        <h1 className="text-4xl font-black text-rose-deep">אהבת חינם</h1>
        {hasSession && (
          <p className="card px-4 py-2 text-sm font-medium">
            ✅ אתם מחוברים — נשאר רק שאלון ההשקפה
          </p>
        )}
        <p className="text-lg leading-relaxed max-w-sm">
          ענו על שאלון קצר על השקפת העולם שלכם.
          <br />
          האפליקציה תמצא בקרבתכם את מי <b>שהכי הפוך מכם</b>.
          <br />
          המשימה: להגיע אליו, לתת חיבוק אמיתי 🤗
          <br />
          לצלם סלפי — ולהעלות לפיד.
        </p>
        <div className="card px-5 py-4 max-w-sm text-base leading-relaxed">
          <b>רגע לפני שמתחילים:</b> ענו לאט ובכנות מלאה. כל הקסם כאן בנוי על
          אמת — ככל שהתשובות אמיתיות יותר, כך המפגש שתקבלו יהיה משמעותי יותר.
          וגם: ככל שהחיבוק שלכם יהיה עם מישהו הפוך מכם יותר — תקבלו יותר
          נקודות 🏅
        </div>
        <button className="btn-primary text-xl" onClick={() => { logEvent("quiz_started"); setStep(0); }}>
          אני עונה בכנות ←
        </button>
        <p className="text-xs text-foreground/50">
          <a className="underline" href="/privacy">מדיניות פרטיות</a>
          {" · "}
          <a className="underline" href="/terms">תנאי שימוש</a>
        </p>
      </main>
    );
  }

  if (step < QUESTIONS.length) {
    const q = QUESTIONS[step];
    return (
      <main className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full">
        <div className="flex gap-1.5 mb-6">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-rose" : "bg-rose/20"}`}
            />
          ))}
        </div>
        <h2 className="text-2xl font-bold mb-6">{q.title}</h2>
        <div className="flex flex-col gap-3">
          {q.options.map((opt) => (
            <button
              key={opt.value}
              className="card px-5 py-4 text-right text-base font-medium border-2 border-transparent hover:border-rose active:scale-[0.98] transition"
              onClick={() => {
                const next = [...answers];
                next[step] = opt.value;
                setAnswers(next);
                setStep(step + 1);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button className="mt-6 text-rose-deep font-medium" onClick={() => setStep(step - 1)}>
            → חזרה
          </button>
        )}
      </main>
    );
  }

  if (step === QUESTIONS.length) {
    return (
      <main className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full gap-6">
        <h2 className="text-2xl font-bold">כמעט שם! איך קוראים לך?</h2>
        <input
          className="card px-5 py-4 text-lg outline-none focus:ring-2 ring-rose"
          placeholder="השם שיוצג לצד השני"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
        />
        <div>
          <p className="font-medium mb-3">בחרו דמות:</p>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((em) => (
              <button
                key={em}
                className={`text-3xl p-2 rounded-2xl ${em === emoji ? "bg-rose/20 ring-2 ring-rose" : "bg-white/60"}`}
                onClick={() => setEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-red-600 font-medium">{error}</p>}
        <button
          className="btn-primary text-xl mt-2"
          disabled={!name.trim() || busy}
          onClick={() => {
            if (hasSession) createProfileNow();
            else {
              stash(answers, name, emoji);
              setStep(step + 1);
            }
          }}
        >
          {busy ? "רגע..." : hasSession ? "יאללה, למשימה ←" : "ממשיכים ←"}
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col px-5 py-8 max-w-md mx-auto w-full gap-5">
      <h2 className="text-2xl font-bold">צעד אחרון: הרשמה 🔐</h2>
      <p className="text-foreground/70 leading-relaxed">
        כדי שהחשבון והנקודות שלכם יישמרו — הירשמו במייל (נשלח קישור אימות)
        או עם Google.
      </p>
      {linkSent ? (
        <div className="card px-6 py-8 text-center flex flex-col gap-3">
          <span className="text-5xl">📬</span>
          <p className="text-lg font-bold">שלחנו לכם קישור אימות!</p>
          <p className="text-foreground/70">
            פתחו את המייל <b>{email}</b> ולחצו על הקישור — הוא יחזיר אתכם לכאן
            ישר למשימה.
          </p>
        </div>
      ) : (
        <>
          <button
            className="card px-5 py-4 font-bold text-lg flex items-center justify-center gap-3"
            disabled={busy}
            onClick={registerWithGoogle}
          >
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
              <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/>
              <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.8-13.6-9.2l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
            </svg>
            המשך עם Google
          </button>
          <div className="flex items-center gap-3 text-foreground/40">
            <div className="h-px bg-foreground/20 flex-1" />
            או במייל
            <div className="h-px bg-foreground/20 flex-1" />
          </div>
          <input
            className="card px-5 py-4 text-lg outline-none focus:ring-2 ring-rose text-left"
            dir="ltr"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="btn-primary text-xl"
            disabled={!/^\S+@\S+\.\S+$/.test(email) || busy}
            onClick={registerWithEmail}
          >
            {busy ? "שולחים..." : "שלחו לי קישור אימות 📧"}
          </button>
        </>
      )}
      {error && <p className="text-red-600 font-medium">{error}</p>}
      <p className="text-sm text-foreground/60 text-center leading-relaxed">
        בהרשמה אתם מאשרים שאתם בני 18+ ומסכימים{" "}
        <a className="underline" href="/terms" target="_blank">
          לתנאי השימוש
        </a>{" "}
        ו
        <a className="underline" href="/privacy" target="_blank">
          למדיניות הפרטיות
        </a>
        .
      </p>
      <button className="text-foreground/50 font-medium" onClick={() => setStep(step - 1)}>
        → חזרה
      </button>
    </main>
  );
}
