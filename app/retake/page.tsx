"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { QUESTIONS } from "@/lib/questions";
import BottomNav from "@/components/BottomNav";

export default function Retake() {
  const router = useRouter();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) router.replace("/");
    })();
  }, [router]);

  async function submit(finalAnswers: number[]) {
    setSaving(true);
    setError(null);
    const { data, error: rpcErr } = await supabase().rpc("update_worldview", {
      p_answers: finalAnswers,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setSaving(false);
      return;
    }
    const r = data?.[0];
    if (r?.ok) {
      router.replace("/mission");
    } else {
      setBlocked(
        new Date(r.next_allowed).toLocaleDateString("he-IL", {
          day: "numeric",
          month: "long",
        })
      );
      setSaving(false);
    }
  }

  if (blocked) {
    return (
      <div className="flex-1 flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="text-6xl">🗓️</div>
          <h1 className="text-2xl font-bold">עדכון ההשקפה נעול כרגע</h1>
          <p className="max-w-xs text-foreground/70 leading-relaxed">
            כדי לשמור על כנות המשחק, אפשר לעדכן את ההשקפה רק אחת ל-30 יום.
            העדכון הבא שלכם ייפתח ב-<b>{blocked}</b>.
          </p>
          <button className="btn-primary" onClick={() => router.push("/profile")}>
            לפרופיל ←
          </button>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (step === -1) {
    return (
      <div className="flex-1 flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
          <div className="text-6xl float">🔄</div>
          <h1 className="text-2xl font-bold">עדכון השקפת העולם</h1>
          <p className="max-w-xs text-foreground/70 leading-relaxed">
            השתנתם? זה יפה — ענו שוב על השאלון, בכנות מלאה. שימו לב: אפשר
            לעדכן רק <b>אחת ל-30 יום</b>, אז אל תבזבזו את זה על משחקים 😉
          </p>
          <button className="btn-primary text-xl" onClick={() => setStep(0)}>
            עונים מחדש בכנות ←
          </button>
          <button className="text-foreground/50 font-medium" onClick={() => router.back()}>
            → חזרה
          </button>
        </main>
        <BottomNav />
      </div>
    );
  }

  const q = QUESTIONS[step];
  return (
    <div className="flex-1 flex flex-col">
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
              disabled={saving}
              className="card px-5 py-4 text-right text-base font-medium border-2 border-transparent hover:border-rose active:scale-[0.98] transition"
              onClick={() => {
                const next = [...answers];
                next[step] = opt.value;
                setAnswers(next);
                if (step + 1 < QUESTIONS.length) setStep(step + 1);
                else submit(next);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {error && <p className="text-red-600 font-medium mt-4">{error}</p>}
        {saving && <p className="text-foreground/60 mt-4">שומרים...</p>}
      </main>
      <BottomNav />
    </div>
  );
}
