"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { QUESTIONS, EMOJIS } from "@/lib/questions";

export default function Onboarding() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  // step: -1 = intro, 0..n-1 = questions, n = name+emoji
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      if (data.session) {
        const { data: profile } = await sb
          .from("profiles")
          .select("id")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (profile) {
          router.replace("/mission");
          return;
        }
      }
      setChecking(false);
    })();
  }, [router]);

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const sb = supabase();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        const { error: authErr } = await sb.auth.signInAnonymously();
        if (authErr) throw authErr;
      }
      const { data: userData } = await sb.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("לא הצלחנו ליצור משתמש");
      const { error: insErr } = await sb.from("profiles").upsert({
        id: uid,
        name: name.trim(),
        emoji,
        answers,
      });
      if (insErr) throw insErr;
      router.replace("/mission");
    } catch (e) {
      setError(e instanceof Error ? e.message : "משהו השתבש, נסו שוב");
      setSaving(false);
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
        <button className="btn-primary text-xl" onClick={() => setStep(0)}>
          אני עונה בכנות ←
        </button>
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
        disabled={!name.trim() || saving}
        onClick={finish}
      >
        {saving ? "רגע..." : "יאללה, למשימה ←"}
      </button>
    </main>
  );
}
