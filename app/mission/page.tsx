"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, OppositeMatch } from "@/lib/supabase";
import { MAX_OPPOSITION } from "@/lib/questions";
import BottomNav from "@/components/BottomNav";
import InviteButton from "@/components/InviteButton";
import { enableProximityPush, isPushEnabled } from "@/lib/push";
import { logEvent } from "@/lib/events";

type Status = "loading" | "no-location" | "searching" | "found" | "empty" | "error";

function fmtDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} מטר`;
  return `${(m / 1000).toFixed(1)} ק"מ`;
}

export default function Mission() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [match, setMatch] = useState<OppositeMatch | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [pushState, setPushState] = useState<"unknown" | "off" | "on">("unknown");

  useEffect(() => {
    isPushEnabled().then((on) => setPushState(on ? "on" : "off"));
  }, []);

  const search = useCallback(async () => {
    const sb = supabase();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) {
      router.replace("/");
      return;
    }
    setStatus("searching");
    if (!navigator.geolocation) {
      setStatus("no-location");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const { error: locErr } = await sb.rpc("update_location", {
            p_lat: latitude,
            p_lng: longitude,
          });
          if (locErr) throw locErr;
          // fire-and-forget: server checks if an opposite is nearby and pushes both sides
          sb.functions.invoke("notify-proximity").catch(() => {});
          const { data, error: findErr } = await sb.rpc("find_opposite", {
            radius_m: 50000,
          });
          if (findErr) throw findErr;
          if (data && data.length > 0) {
            setMatch(data[0]);
            setStatus("found");
            logEvent("match_found", {
              opposition: data[0].opposition,
              distance_m: Math.round(data[0].distance_m),
            });
          } else {
            setStatus("empty");
            logEvent("match_empty");
          }
        } catch (e) {
          setErrMsg(e instanceof Error ? e.message : "שגיאה בחיפוש");
          setStatus("error");
        }
      },
      () => setStatus("no-location"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [router]);

  useEffect(() => {
    search();
  }, [search]);

  const oppositionPct = match
    ? Math.round((match.opposition / MAX_OPPOSITION) * 100)
    : 0;

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center gap-5">
        {status === "loading" || status === "searching" ? (
          <>
            <div className="text-6xl float">🔍</div>
            <h1 className="text-2xl font-bold">מחפשים את ההפך שלך...</h1>
            <p className="text-foreground/60">סורקים את הסביבה לפי GPS</p>
          </>
        ) : status === "no-location" ? (
          <>
            <div className="text-6xl">📍</div>
            <h1 className="text-2xl font-bold">צריך גישה למיקום</h1>
            <p className="max-w-xs text-foreground/70">
              בלי GPS אי אפשר למצוא את מי שהפוך ממך בסביבה. אשרו גישה למיקום
              בדפדפן ונסו שוב.
            </p>
            <button className="btn-primary" onClick={search}>
              נסו שוב
            </button>
          </>
        ) : status === "empty" ? (
          <>
            <div className="text-6xl float">🌵</div>
            <h1 className="text-2xl font-bold">אין כרגע אף אחד בסביבה</h1>
            <p className="max-w-xs text-foreground/70">
              עדיין אין משתמשים אחרים ברדיוס 50 ק"מ. שתפו את האפליקציה עם מישהו
              שחושב הפוך מכם 😉
            </p>
            <InviteButton label="שתפו את האפליקציה 💌" />
            <button className="btn-primary" onClick={search}>
              רעננו חיפוש
            </button>
          </>
        ) : status === "error" ? (
          <>
            <div className="text-6xl">😅</div>
            <h1 className="text-2xl font-bold">משהו השתבש</h1>
            <p className="text-foreground/60 text-sm">{errMsg}</p>
            <button className="btn-primary" onClick={search}>
              נסו שוב
            </button>
          </>
        ) : match ? (
          <>
            <p className="text-lg font-medium text-rose-deep">
              מצאנו את ההפך שלך! 🎯
            </p>
            <div className="card px-8 py-8 flex flex-col items-center gap-3 w-full max-w-sm">
              {match.avatar_path ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={
                    supabase().storage
                      .from("avatars")
                      .getPublicUrl(match.avatar_path).data.publicUrl
                  }
                  alt={`התמונה של ${match.name}`}
                  className="w-28 h-28 rounded-full object-cover pulse-ring"
                />
              ) : (
                <div className="text-7xl rounded-full bg-cream p-4 pulse-ring">
                  {match.emoji}
                </div>
              )}
              <h1 className="text-3xl font-black">{match.name}</h1>
              {match.bio && (
                <p className="text-foreground/70 text-center leading-snug">
                  {match.bio}
                </p>
              )}
              <div className="flex gap-6 text-center">
                <div>
                  <div className="text-2xl font-black text-rose-deep">
                    {oppositionPct}%
                  </div>
                  <div className="text-sm text-foreground/60">הפוכים בהשקפה</div>
                </div>
                <div>
                  <div className="text-2xl font-black text-rose-deep">
                    {fmtDistance(match.distance_m)}
                  </div>
                  <div className="text-sm text-foreground/60">מכאן</div>
                </div>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  logEvent("navigate_clicked", { distance_m: Math.round(match.distance_m) });
                  sessionStorage.setItem(
                    "hug_target",
                    JSON.stringify({ id: match.id, name: match.name })
                  );
                  router.push("/meet");
                }}
              >
                🧭 יוצאים להיפגש — ניווט חי
              </button>
              <a
                className="text-foreground/50 text-sm underline"
                href={`https://maps.google.com/maps?daddr=${match.lat},${match.lng}&dirflg=w`}
                target="_blank"
                rel="noreferrer"
              >
                או במפות גוגל (אזור משוער)
              </a>
            </div>
            <p className="max-w-xs text-foreground/70">
              המשימה: להגיע, להציג את עצמכם, לתת חיבוק אמיתי — ולצלם סלפי ביחד!
            </p>
            <button
              className="card px-4 py-2 text-sm text-foreground/70"
              onClick={() => router.push("/profile")}
            >
              📷 העלו תמונת פרופיל — כדי ש{match.name} יזהה אתכם בשטח
            </button>
            <p className="font-bold text-rose-deep">
              🏅 החיבוק הזה שווה {oppositionPct} נקודות!
            </p>
            <button
              className="btn-primary text-xl"
              onClick={() => {
                logEvent("hug_started", { opposition: match.opposition });
                sessionStorage.setItem(
                  "hug_target",
                  JSON.stringify({ id: match.id, name: match.name })
                );
                router.push("/hug");
              }}
            >
              נפגשנו! מצלמים סלפי 🤳
            </button>
            <button className="text-foreground/50 font-medium" onClick={search}>
              חפשו מישהו אחר 🔄
            </button>
          </>
        ) : null}
        {pushState === "off" && (status === "found" || status === "empty") && (
          <button
            className="card px-5 py-3 font-medium text-foreground/80 mt-2"
            onClick={async () => {
              const r = await enableProximityPush();
              logEvent("push_permission", { result: r });
              if (r === "enabled") setPushState("on");
              else if (r === "unsupported")
                alert("הדפדפן לא תומך בהתראות. באייפון: הוסיפו את האפליקציה למסך הבית ונסו שוב.");
            }}
          >
            🔔 עדכנו אותי כשההפך שלי נכנס לקרבתי
          </button>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
