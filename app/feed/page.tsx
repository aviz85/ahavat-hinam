"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Hug } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import { logEvent } from "@/lib/events";

function timeAgo(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "ממש עכשיו";
  if (sec < 3600) return `לפני ${Math.floor(sec / 60)} דק'`;
  if (sec < 86400) return `לפני ${Math.floor(sec / 3600)} שעות`;
  return `לפני ${Math.floor(sec / 86400)} ימים`;
}

export default function Feed() {
  const router = useRouter();
  const [hugs, setHugs] = useState<Hug[] | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; mine: boolean }>>({});

  const [repeatNote, setRepeatNote] = useState(false);

  useEffect(() => {
    const pts = sessionStorage.getItem("last_points");
    if (pts) {
      sessionStorage.removeItem("last_points");
      setCelebration(pts);
      setTimeout(() => setCelebration(null), 5000);
    }
    if (sessionStorage.getItem("repeat_hug")) {
      sessionStorage.removeItem("repeat_hug");
      setRepeatNote(true);
      setTimeout(() => setRepeatNote(false), 6000);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        router.replace("/");
        return;
      }
      setUid(sess.session.user.id);
      const { data } = await sb
        .from("hugs")
        .select(
          "id, hugger_name, hugger_emoji, hugged_name, image_path, caption, points, verified, created_at, is_campaign"
        )
        .order("created_at", { ascending: false })
        .limit(50);
      const rows = (data as Hug[]) ?? [];
      setHugs(rows);
      if (rows.length) {
        const { data: likeRows } = await sb
          .from("hug_likes")
          .select("hug_id, user_id")
          .in("hug_id", rows.map((h) => h.id));
        const me = sess.session.user.id;
        const agg: Record<string, { count: number; mine: boolean }> = {};
        for (const l of likeRows ?? []) {
          agg[l.hug_id] ??= { count: 0, mine: false };
          agg[l.hug_id].count++;
          if (l.user_id === me) agg[l.hug_id].mine = true;
        }
        setLikes(agg);
      }
    })();
  }, [router]);

  async function toggleLike(hugId: string) {
    if (!uid) return;
    const cur = likes[hugId] ?? { count: 0, mine: false };
    setLikes({
      ...likes,
      [hugId]: { count: cur.count + (cur.mine ? -1 : 1), mine: !cur.mine },
    });
    logEvent(cur.mine ? "unlike" : "like", { hug_id: hugId });
    const sb = supabase();
    if (cur.mine) {
      await sb.from("hug_likes").delete().eq("hug_id", hugId).eq("user_id", uid);
    } else {
      await sb.from("hug_likes").insert({ hug_id: hugId, user_id: uid });
    }
  }

  const publicUrl = (path: string) =>
    supabase().storage.from("hugs").getPublicUrl(path).data.publicUrl;

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 px-4 py-6 max-w-md mx-auto w-full">
        <h1 className="text-3xl font-black text-rose-deep text-center mb-6">
          פיד החיבוקים ❤️
        </h1>
        {celebration && (
          <div className="card px-5 py-4 mb-5 text-center text-lg font-bold text-rose-deep">
            🏅 החיבוק הזה הכניס לכם {celebration} נקודות של אהבת חינם!
          </div>
        )}
        {repeatNote && (
          <div className="card px-5 py-4 mb-5 text-center text-base font-medium">
            🤗 כבר התחבקתם ב-24 השעות האחרונות — החיבוק עלה לפיד, הנקודות
            יחכו לפעם הבאה!
          </div>
        )}
        {hugs === null ? (
          <div className="text-center text-5xl float mt-16">❤️</div>
        ) : hugs.length === 0 ? (
          <div className="text-center mt-16 flex flex-col items-center gap-4">
            <span className="text-6xl">🕊️</span>
            <p className="text-lg text-foreground/70 max-w-xs">
              עוד אין חיבוקים בפיד. תהיו הראשונים לחבק מישהו הפוך מכם!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {hugs.map((h) => (
              <article key={h.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-3xl">{h.hugger_emoji ?? "🙂"}</span>
                  <div className="flex-1">
                    <p className="font-bold">
                      {h.hugger_name ?? "מישהו"}
                      {h.hugged_name && (
                        <span className="font-normal text-foreground/70">
                          {" "}
                          חיבק/ה את <b>{h.hugged_name}</b>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-foreground/50">
                      {timeAgo(h.created_at)}
                      {h.verified && (
                        <span className="text-green-700 font-bold"> · ✅ מפגש מאומת</span>
                      )}
                      {h.is_campaign && (
                        <span className="text-rose-deep font-bold"> · 💕 ט״ו באב</span>
                      )}
                    </p>
                  </div>
                  {h.points > 0 ? (
                    <span className="font-black text-rose-deep text-sm bg-rose/10 rounded-full px-3 py-1.5">
                      🏅 {h.points}+
                    </span>
                  ) : (
                    <span className="text-2xl">🤗</span>
                  )}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl(h.image_path)}
                  alt="סלפי חיבוק"
                  className="w-full object-cover"
                  loading="lazy"
                />
                {h.caption && (
                  <p className="px-4 pt-3 text-base leading-relaxed">
                    {h.caption}
                  </p>
                )}
                <div className="px-4 py-3">
                  <button
                    className="flex items-center gap-2 font-bold text-rose-deep active:scale-110 transition"
                    onClick={() => toggleLike(h.id)}
                    aria-label="לייק לחיבוק"
                  >
                    <span className="text-2xl">
                      {likes[h.id]?.mine ? "❤️" : "🤍"}
                    </span>
                    {(likes[h.id]?.count ?? 0) > 0 && (
                      <span>{likes[h.id]!.count}</span>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
