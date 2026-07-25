"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { pairChannel, bearing, distanceM, beaconFor } from "@/lib/meet";
import { logEvent } from "@/lib/events";

type Target = { id: string; name: string } | null;
type Fix = { lat: number; lng: number; at: number };

function fmt(m: number) {
  if (m < 1000) return `${Math.round(m)} מ'`;
  return `${(m / 1000).toFixed(1)} ק"מ`;
}

export default function Meet() {
  const router = useRouter();
  const [target, setTarget] = useState<Target>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [mine, setMine] = useState<Fix | null>(null);
  const [theirs, setTheirs] = useState<Fix | null>(null);
  const [otherHere, setOtherHere] = useState(false);
  const [waved, setWaved] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const mineRef = useRef<Fix | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("hug_target");
    if (!raw) {
      router.replace("/mission");
      return;
    }
    setTarget(JSON.parse(raw));
  }, [router]);

  // compass heading (best effort; iOS needs a permission tap elsewhere)
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      const wk = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof wk === "number") setHeading(wk);
      else if (e.absolute && e.alpha != null) setHeading(360 - e.alpha);
    };
    window.addEventListener("deviceorientationabsolute", onOrient as EventListener);
    window.addEventListener("deviceorientation", onOrient as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient as EventListener);
      window.removeEventListener("deviceorientation", onOrient as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const sb = supabase();
    let watchId: number | null = null;
    let cancelled = false;
    let cleanupBeat: (() => void) | null = null;

    (async () => {
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        router.replace("/");
        return;
      }
      const me = sess.session.user.id;
      if (cancelled) return;
      setUid(me);
      logEvent("meet_mode_opened");

      // ephemeral pair channel — precise fixes are broadcast peer-to-peer,
      // consensually, and never written to the database
      const chan = sb.channel(pairChannel(me, target!.id));
      chanRef.current = chan;
      chan
        .on("broadcast", { event: "fix" }, ({ payload }) => {
          if (payload.from !== me)
            setTheirs({ lat: payload.lat, lng: payload.lng, at: Date.now() });
        })
        .on("broadcast", { event: "wave" }, ({ payload }) => {
          if (payload.from !== me) {
            setOtherHere(true);
            navigator.vibrate?.([200, 80, 200, 80, 400]);
            setTimeout(() => setOtherHere(false), 6000);
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED" && mineRef.current) {
            chan.send({
              type: "broadcast",
              event: "fix",
              payload: { from: me, ...mineRef.current },
            });
          }
        });

      // re-broadcast every 5s so a partner who joins later (or missed a
      // message) still gets our position without us having to move
      const beat = setInterval(() => {
        if (mineRef.current) {
          chan.send({
            type: "broadcast",
            event: "fix",
            payload: { from: me, lat: mineRef.current.lat, lng: mineRef.current.lng },
          });
        }
      }, 5000);
      cleanupBeat = () => clearInterval(beat);

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            at: Date.now(),
          };
          mineRef.current = fix;
          setMine(fix);
          chan.send({
            type: "broadcast",
            event: "fix",
            payload: { from: me, lat: fix.lat, lng: fix.lng },
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
      );
    })();

    return () => {
      cancelled = true;
      cleanupBeat?.();
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      chanRef.current?.unsubscribe();
    };
  }, [target, router]);

  const dist =
    mine && theirs ? distanceM(mine.lat, mine.lng, theirs.lat, theirs.lng) : null;
  const brg =
    mine && theirs ? bearing(mine.lat, mine.lng, theirs.lat, theirs.lng) : null;
  const arrowAngle = brg != null ? brg - (heading ?? 0) : null;
  const close = dist != null && dist <= 30;
  const stale = theirs && Date.now() - theirs.at > 30000;
  const beacon = uid && target ? beaconFor(uid, target.id) : null;

  return (
    <main
      className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center gap-5 transition-colors duration-700"
      style={close && beacon ? { background: beacon.color } : undefined}
    >
      {!target ? null : close && beacon ? (
        <>
          <p className="text-white text-2xl font-bold drop-shadow">
            אתם ממש כאן! חפשו את מי שמרים טלפון עם:
          </p>
          <div className="text-[9rem] leading-none drop-shadow-lg float">
            {beacon.emoji}
          </div>
          <p className="text-white text-xl font-bold drop-shadow">
            גם אצל {target.name} מוצג בדיוק אותו מסך — הרימו גבוה! 🙌
          </p>
          {otherHere && (
            <p className="bg-white/90 text-rose-deep font-black text-xl rounded-full px-6 py-3">
              👋 {target.name} מסמן לכם — תסתכלו סביב!
            </p>
          )}
          <button
            className="bg-white text-rose-deep font-bold text-xl rounded-full px-8 py-4 shadow-lg active:scale-95"
            disabled={waved}
            onClick={() => {
              chanRef.current?.send({
                type: "broadcast",
                event: "wave",
                payload: { from: uid },
              });
              logEvent("meet_wave_sent");
              setWaved(true);
              setTimeout(() => setWaved(false), 4000);
            }}
          >
            {waved ? "👋 נשלח!" : "👋 אני כאן — סמנו לו"}
          </button>
          <button
            className="text-white/90 font-bold underline"
            onClick={() => router.push("/hug")}
          >
            נפגשנו! לסלפי 🤳
          </button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-black text-rose-deep">
            בדרך אל {target.name} 🧭
          </h1>
          {dist == null ? (
            <>
              <div className="text-6xl float">📡</div>
              <p className="max-w-xs text-foreground/70 leading-relaxed">
                ממתינים ש{target.name} יפתח גם את מסך המפגש...
                <br />
                המיקום המדויק משותף רק בין שניכם, רק כשהמסך הזה פתוח.
              </p>
            </>
          ) : (
            <>
              <div
                className="text-7xl transition-transform duration-500"
                style={
                  arrowAngle != null
                    ? { transform: `rotate(${arrowAngle}deg)` }
                    : undefined
                }
              >
                ⬆️
              </div>
              <div className="text-5xl font-black text-rose-deep">{fmt(dist)}</div>
              <p className="text-foreground/60">
                {heading == null
                  ? "החץ מצביע צפונה־יחסית — סובבו את הגוף עד שהוא מרגיש נכון"
                  : "לכו בכיוון החץ"}
                {stale ? " · האות של הצד השני נחלש..." : ""}
              </p>
              {dist < 120 && (
                <p className="font-bold text-rose-deep text-lg">
                  מתקרבים! עוד רגע מסך המגדלור יידלק 🔥
                </p>
              )}
            </>
          )}
          <button
            className="text-foreground/50 font-medium"
            onClick={() => router.push("/mission")}
          >
            → חזרה למשימה
          </button>
        </>
      )}
    </main>
  );
}
