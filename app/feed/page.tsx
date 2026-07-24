"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, Hug } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";

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

  useEffect(() => {
    const pts = sessionStorage.getItem("last_points");
    if (pts) {
      sessionStorage.removeItem("last_points");
      setCelebration(pts);
      setTimeout(() => setCelebration(null), 5000);
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
      const { data } = await sb
        .from("hugs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setHugs((data as Hug[]) ?? []);
    })();
  }, [router]);

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
                  <p className="px-4 py-3 text-base leading-relaxed">
                    {h.caption}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
