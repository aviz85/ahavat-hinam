"use client";

import { useState } from "react";

const APP_URL = "https://hugs.photos";
const SHARE_TEXT =
  "מצאו את מי שהכי הפוך מכם בהשקפה — ותנו לו חיבוק 🤗 בואו לאהבת חינם:";

export default function InviteButton({ label }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  async function invite() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "אהבת חינם ❤️",
          text: SHARE_TEXT,
          url: APP_URL,
        });
        return;
      } catch {
        // user cancelled the share sheet — fall through silently
        return;
      }
    }
    await navigator.clipboard.writeText(`${SHARE_TEXT} ${APP_URL}`);
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
