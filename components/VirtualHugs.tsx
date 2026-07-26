"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, SavedPerson, Admirer } from "@/lib/supabase";
import { MAX_OPPOSITION } from "@/lib/questions";
import { logEvent } from "@/lib/events";

function fmtDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} מטר`;
  return `${(m / 1000).toFixed(1)} ק"מ`;
}

export default function VirtualHugs() {
  const router = useRouter();
  const [sent, setSent] = useState<SavedPerson[]>([]);
  const [received, setReceived] = useState<Admirer[]>([]);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: s }, { data: r }] = await Promise.all([
      sb.rpc("my_saved_people"),
      sb.rpc("my_admirers"),
    ]);
    setSent((s as SavedPerson[]) ?? []);
    setReceived((r as Admirer[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function respond(followerId: string, approve: boolean) {
    await supabase().rpc("respond_to_interest", {
      p_follower: followerId,
      p_approve: approve,
    });
    logEvent(approve ? "follow_approved" : "follow_declined");
    load();
  }

  function goMeet(p: { id: string; name: string }) {
    sessionStorage.setItem("hug_target", JSON.stringify({ id: p.id, name: p.name }));
    router.push("/meet");
  }

  if (sent.length === 0 && received.length === 0) return null;

  const row = (p: SavedPerson, action: React.ReactNode, sub?: string) => (
    <div key={p.id} className="card px-4 py-3 flex items-center gap-3 text-right">
      <span className="text-2xl">{p.emoji}</span>
      <div className="flex-1">
        <p className="font-bold">{p.name}</p>
        <p className="text-xs text-foreground/60">
          {Math.round((p.opposition / MAX_OPPOSITION) * 100)}% הפוכים
          {p.distance_m != null && ` · ${fmtDistance(p.distance_m)}`}
        </p>
        {sub && <p className="text-xs text-foreground/50">{sub}</p>}
      </div>
      {action}
    </div>
  );

  return (
    <div className="w-full flex flex-col gap-5">
      {received.length > 0 && (
        <div>
          <h2 className="font-bold text-rose-deep text-right mb-1">
            ⭐ מגלים בך עניין ({received.length})
          </h2>
          <p className="text-xs text-foreground/60 text-right mb-3">
            שמרו אתכם לעתיד. אם תאשרו — הם יקבלו עדכון כשתהיו קרובים במקרה
            (בלי לחשוף את מיקומכם — רק את עצם הקרבה). אפשר לבטל בכל רגע.
          </p>
          <div className="flex flex-col gap-2">
            {received.map((a) =>
              a.approved === true
                ? row(
                    a,
                    <button
                      className="text-foreground/40 text-xs underline"
                      onClick={() => respond(a.id, false)}
                    >
                      ביטול
                    </button>,
                    "✓ אישרתם עדכוני קרבה"
                  )
                : a.approved === false
                  ? row(a, <span className="text-xs text-foreground/40">נדחה</span>)
                  : row(
                      a,
                      <div className="flex flex-col gap-1">
                        <button
                          className="text-rose-deep font-bold text-sm"
                          onClick={() => respond(a.id, true)}
                        >
                          ✓ לאשר
                        </button>
                        <button
                          className="text-foreground/40 text-sm"
                          onClick={() => respond(a.id, false)}
                        >
                          לא תודה
                        </button>
                      </div>
                    )
            )}
          </div>
        </div>
      )}
      {sent.length > 0 && (
        <div>
          <h2 className="font-bold text-rose-deep text-right mb-1">
            ⭐ שמורים לעתיד ({sent.length})
          </h2>
          <p className="text-xs text-foreground/60 text-right mb-3">
            אנשים שהייתם רוצים לפגוש מתישהו. כשמישהו מהם יהיה קרוב אליכם
            במקרה — נעדכן אתכם (בכפוף לאישורו).
          </p>
          <div className="flex flex-col gap-2">
            {sent.map((s) =>
              row(
                s,
                <>
                  <button
                    className="text-rose-deep font-bold text-sm"
                    onClick={() => goMeet(s)}
                  >
                    🤝 להיפגש
                  </button>
                  <button
                    className="text-foreground/40 text-sm"
                    aria-label="הסרה"
                    onClick={async () => {
                      const { data: sess } = await supabase().auth.getSession();
                      if (!sess.session) return;
                      await supabase()
                        .from("saved_people")
                        .delete()
                        .eq("user_id", sess.session.user.id)
                        .eq("saved_id", s.id);
                      load();
                    }}
                  >
                    ✕
                  </button>
                </>,
                s.approved === true
                  ? "✓ אישרו — תקבלו עדכון כשתהיו קרובים"
                  : "נשמר · ממתין לאישור עדכוני קרבה"
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
