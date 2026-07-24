"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const REASONS: Record<string, string> = {
  not_found: "הקוד לא נמצא — בקשו מהצד השני להציג קוד חדש.",
  already_used: "הקוד הזה כבר נוצל.",
  expired: "הקוד פג תוקף (15 דקות) — בקשו קוד חדש.",
  self: "אי אפשר לאשר את החיבוק של עצמכם 😄",
  no_profile: "קודם השלימו את השאלון שלכם.",
  too_far: "אתם רחוקים מדי זה מזה — האימות עובד רק כשנפגשים באמת.",
};

export default function ConfirmHug() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "ok" | "fail">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        localStorage.setItem("after_onboarding_confirm", id);
        router.replace("/");
        return;
      }
      // refresh my location first — the server checks we're within 300m
      await new Promise<void>((res) => {
        if (!navigator.geolocation) return res();
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await sb.rpc("update_location", {
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
            });
            res();
          },
          () => res(),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
      const { data, error } = await sb.rpc("confirm_hug_verification", {
        p_id: id,
      });
      if (error || !data?.length) {
        setState("fail");
        setMessage(error?.message ?? "משהו השתבש");
        return;
      }
      const r = data[0];
      if (r.ok) {
        setState("ok");
        setMessage(r.initiator_name);
      } else {
        setState("fail");
        setMessage(REASONS[r.reason] ?? r.reason);
      }
    })();
  }, [id, router]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
      {state === "working" ? (
        <>
          <div className="text-6xl float">🤝</div>
          <h1 className="text-2xl font-bold">מאמתים את המפגש...</h1>
        </>
      ) : state === "ok" ? (
        <>
          <div className="text-7xl">✅</div>
          <h1 className="text-3xl font-black text-rose-deep">המפגש אומת!</h1>
          <p className="text-lg max-w-xs">
            אישרתם שנפגשתם עם <b>{message}</b> באמת. עכשיו — תתחבקו ותצטלמו!
            הסלפי המאומת שווה נקודות כפולות 🏅
          </p>
          <button className="btn-primary text-xl" onClick={() => router.push("/mission")}>
            למשימה שלי ←
          </button>
        </>
      ) : (
        <>
          <div className="text-6xl">😕</div>
          <h1 className="text-2xl font-bold">האימות לא הצליח</h1>
          <p className="max-w-xs text-foreground/70">{message}</p>
          <button className="btn-primary" onClick={() => router.push("/mission")}>
            למשימה ←
          </button>
        </>
      )}
    </main>
  );
}
