"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { logEvent } from "@/lib/events";

const APP_URL = "https://hugs.photos";
const SHARE_TEXT =
  "מצאו את מי שהכי הפוך מכם בהשקפה — ותנו לו חיבוק 🤗 בואו לאהבת חינם:";

export default function InviteButton({ label }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState(APP_URL);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) setUrl(`${APP_URL}/?ref=${data.session.user.id}`);
      });
  }, []);

  async function invite() {
    logEvent("invite_clicked");
    if (navigator.share) {
      try {
        await navigator.share({
          title: "אהבת חינם ❤️",
          text: SHARE_TEXT,
          url,
        });
        logEvent("invite_shared", { method: "share_sheet" });
        return;
      } catch {
        logEvent("invite_cancelled");
        return;
      }
    }
    await navigator.clipboard.writeText(`${SHARE_TEXT} ${url}`);
    logEvent("invite_shared", { method: "clipboard" });
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      className="card px-5 py-3 font-bold text-rose-deep active:scale-[0.97] transition"
      onClick={invite}
    >
      {copied ? "הלינק הועתק! 📋" : (label ?? "הזמינו חברים 💌")}
    </button>
  );
}
