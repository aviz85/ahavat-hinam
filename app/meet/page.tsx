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

  const [hostWaiting, setHostWaiting] = useState(false);
  const [incoming, setIncoming] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // guest side of a planned-meetup link: target rides in the URL
    const withId = params.get("with");
    const withName = params.get("n");
    if (withId && /^[0-9a-f-]{36}$/.test(withId)) {
      const t = { id: withId, name: withName || "חבר" };
      sessionStorage.setItem("hug_target", JSON.stringify(t));
      setTarget(t);
      logEvent("meet_link_opened");
      return;
    }
    // host side: no target yet — wait for whoever opens our link
    if (params.get("host") === "1") {
      setHostWaiting(true);
      return;
    }
    const raw = sessionStorage.getItem("hug_target");
    if (!raw) {
      router.replace("/mission");
      return;
    }
    setTarget(JSON.parse(raw));
  }, [router]);

  // host mode: listen on my invite channel until a guest says hello
  useEffect(() => {
    if (!hostWaiting) return;
    const sb = supabase();
    let invChan: RealtimeChannel | null = null;
    (async () => {
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        router.replace("/");
        return;
      }
      const me = sess.session.user.id;
      setUid(me);
      invChan = sb.channel("meet-invite:" + me);
      invChan
        .on("broadcast", { event: "hello" }, ({ payload }) => {
          const t = { id: payload.uid, name: payload.name || "חבר" };
          sessionStorage.setItem("hug_target", JSON.stringify(t));
          setTarget(t);
          setHostWaiting(false);
          logEvent("meet_link_guest_arrived");
        })
        .subscribe();
    })();
    return () => {
      invChan?.unsubscribe();
    };
  }, [hostWaiting, router]);

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
    let cleanupDoors: (() => void) | null = null;

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

      // always knock on the target's door: even if their own match points
      // elsewhere (matching isn't symmetric), they'll see we're heading to them
      const { data: myProf } = await sb
        .from("profiles")
        .select("name")
        .eq("id", me)
        .maybeSingle();
      const inv = sb.channel("meet-invite:" + target!.id);
      inv.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          const say = () =>
            inv.send({
              type: "broadcast",
              event: "hello",
              payload: { uid: me, name: myProf?.name ?? "חבר" },
            });
          say();
          const t2 = setInterval(say, 5000);
          setTimeout(() => clearInterval(t2), 120000);
        }
      });

      // and listen on my own door: someone else may be walking toward me
      const myDoor = sb.channel("meet-invite:" + me);
      myDoor
        .on("broadcast", { event: "hello" }, ({ payload }) => {
          if (payload.uid !== target!.id && payload.uid !== me) {
            setIncoming({ id: payload.uid, name: payload.name || "מישהו" });
          }
        })
        .subscribe();
      cleanupDoors = () => {
        inv.unsubscribe();
        myDoor.unsubscribe();
      };

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
      cleanupDoors?.();
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
      {hostWaiting ? (
        <>
          <div className="text-6xl float">🤝</div>
          <h1 className="text-2xl font-black text-rose-deep">מפגש יזום</h1>
          <p className="max-w-xs text-foreground/70 leading-relaxed">
            שלחו לחבר את הקישור, וברגע שיפתח אותו — הניווט החי ביניכם יתחיל
            אוטומטית.
          </p>
          <button
            className="btn-primary"
            onClick={async () => {
              if (!uid) return;
              const { data: p } = await supabase()
                .from("profiles")
                .select("name")
                .eq("id", uid)
                .maybeSingle();
              const link = `https://hugs.photos/meet?with=${uid}&n=${encodeURIComponent(p?.name ?? "")}`;
              const text = `בוא/י ניפגש לחיבוק דרך אהבת חינם 🤗 פתח/י את הקישור ונמצא זה את זה:`;
              logEvent("meet_link_shared");
              if (navigator.share)
                await navigator.share({ text, url: link }).catch(() => {});
              else {
                await navigator.clipboard.writeText(`${text} ${link}`);
                alert("הקישור הועתק — שלחו אותו לחבר!");
              }
            }}
          >
            💌 שלחו קישור מפגש
          </button>
          <p className="text-foreground/50">ממתינים שהצד השני ייכנס... 📡</p>
          <button
            className="text-foreground/50 font-medium"
            onClick={() => router.push("/mission")}
          >
            → חזרה למשימה
          </button>
        </>
      ) : !target ? null : close && beacon ? (
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
      {incoming && (
        <div className="card px-5 py-4 w-full max-w-sm flex flex-col gap-2">
          <p className="font-bold">🚶 {incoming.name} בדרך אליכם עכשיו!</p>
          <button
            className="btn-primary"
            onClick={() => {
              sessionStorage.setItem("hug_target", JSON.stringify(incoming));
              setTarget(incoming);
              setTheirs(null);
              setIncoming(null);
              logEvent("meet_switched_to_incoming");
            }}
          >
            עברו לניווט מולו ←
          </button>
          <button className="text-foreground/50 text-sm" onClick={() => setIncoming(null)}>
            לא עכשיו
          </button>
        </div>
      )}
    </main>
  );
}
