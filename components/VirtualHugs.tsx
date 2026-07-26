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

  async function hugBack(personId: string, opposition?: number) {
    const sb = supabase();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const { error } = await sb.from("saved_people").insert({
      user_id: sess.session.user.id,
      saved_id: personId,
    });
    if (error && error.code !== "23505") return;
    logEvent("interest_sent", { source: "hug_back", opposition });
    sb.functions.invoke("notify-interest", { body: { saved_id: personId } }).catch(() => {});
    load();
  }

  function goMeet(p: { id: string; name: string }, mutual: boolean) {
    logEvent("saved_meet_clicked", { mutual });
    sessionStorage.setItem("hug_target", JSON.stringify({ id: p.id, name: p.name }));
    router.push("/meet");
  }

  if (sent.length === 0 && received.length === 0) return null;

  const row = (
    p: SavedPerson,
    action: React.ReactNode,
    extra?: React.ReactNode
  ) => (
    <div key={p.id} className="card px-4 py-3 flex items-center gap-3 text-right">
      <span className="text-2xl">{p.emoji}</span>
      <div className="flex-1">
        <p className="font-bold">
          {p.name}
          {extra}
        </p>
        <p className="text-xs text-foreground/60">
          {Math.round((p.opposition / MAX_OPPOSITION) * 100)}% הפוכים
          {p.distance_m != null && ` · ${fmtDistance(p.distance_m)}`}
          {!p.active && " · לא פעיל לאחרונה"}
        </p>
      </div>
      {action}
    </div>
  );

  return (
    <div className="w-full flex flex-col gap-5">
      <div>
        <h2 className="font-bold text-rose-deep text-right mb-1">
          🫂 חיבוקים וירטואליים
        </h2>
        <p className="text-xs text-foreground/60 text-right mb-3">
          חיבוק וירטואלי הוא לא תחליף לאמיתי — רק הבעת עניין ושמירה, עד
          שתוכלו להיפגש באמת.
        </p>
        {received.length > 0 && (
          <>
            <h3 className="font-medium text-right text-sm mb-2">
              קיבלתי — רוצים לפגוש אותי ({received.length})
            </h3>
            <div className="flex flex-col gap-2 mb-4">
              {received.map((a) =>
                row(
                  a,
                  a.mutual ? (
                    <button
                      className="text-rose-deep font-bold text-sm"
                      onClick={() => goMeet(a, true)}
                    >
                      🤝 להיפגש
                    </button>
                  ) : (
                    <button
                      className="text-rose-deep font-bold text-sm"
                      onClick={() => hugBack(a.id, a.opposition)}
                    >
                      🫂 להחזיר חיבוק
                    </button>
                  ),
                  a.mutual ? <span className="text-sm"> · 🎉 הדדי!</span> : undefined
                )
              )}
            </div>
          </>
        )}
        {sent.length > 0 && (
          <>
            <h3 className="font-medium text-right text-sm mb-2">
              שלחתי — הייתי רוצה לפגוש ({sent.length})
            </h3>
            <div className="flex flex-col gap-2">
              {sent.map((s) =>
                row(
                  s,
                  <>
                    <button
                      className="text-rose-deep font-bold text-sm"
                      onClick={() => goMeet(s, false)}
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
                  </>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
