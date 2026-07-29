"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import CampaignBanner from "@/components/CampaignBanner";
import { logEvent } from "@/lib/events";

type Target = { id: string; name: string } | null;

export default function Hug() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Target>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifId, setVerifId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("hug_target");
    if (raw) setTarget(JSON.parse(raw));
  }, []);

  // poll the handshake until the other side confirms
  useEffect(() => {
    if (!verifId || verified) return;
    const t = setInterval(async () => {
      const { data } = await supabase()
        .from("hug_confirmations")
        .select("confirmed_at")
        .eq("id", verifId)
        .maybeSingle();
      if (data?.confirmed_at) setVerified(true);
    }, 3000);
    return () => clearInterval(t);
  }, [verifId, verified]);

  async function startVerification() {
    setError(null);
    logEvent("qr_verification_started");
    const { data, error: vErr } = await supabase().rpc("start_hug_verification");
    if (vErr) {
      setError(vErr.message);
      return;
    }
    setVerifId(data as string);
    const url = `${window.location.origin}/confirm/${data}`;
    setQrUrl(await QRCode.toDataURL(url, { width: 480, margin: 1 }));
  }

  function onPick(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function publish() {
    if (!file) return;
    setPosting(true);
    setError(null);
    try {
      const sb = supabase();
      const { data: userData } = await sb.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        router.replace("/");
        return;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from("hugs").upload(path, file, {
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: rec, error: insErr } = await sb.rpc("record_hug", {
        p_hugged_id: target?.id ?? null,
        p_hugged_name: target?.name ?? null,
        p_image_path: path,
        p_caption: caption,
        p_verification_id: verified ? verifId : null,
      });
      if (insErr) throw insErr;
      sessionStorage.removeItem("hug_target");
      const result = rec?.[0];
      logEvent("hug_published", {
        points: result?.points ?? 0,
        verified: !!result?.verified,
        repeat: !!result?.repeat_blocked,
        has_caption: !!caption.trim(),
      });
      if (result?.repeat_blocked) sessionStorage.setItem("repeat_hug", "1");
      else if ((result?.points ?? 0) > 0)
        sessionStorage.setItem("last_points", String(result.points));
      router.replace("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה, נסו שוב");
      setPosting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex flex-col items-center px-6 py-8 gap-5 max-w-md mx-auto w-full">
        <CampaignBanner />
        <h1 className="text-3xl font-black text-rose-deep text-center">
          סלפי החיבוק 🤳
        </h1>
        {target && (
          <p className="text-lg text-center">
            אתם ו<b>{target.name}</b> — תנציחו את הרגע!
          </p>
        )}
        {verified ? (
          <div className="card w-full px-5 py-4 text-center font-bold text-green-700">
            ✅ המפגש אומת על ידי הצד השני — נקודות כפולות!
          </div>
        ) : qrUrl ? (
          <div className="card w-full px-5 py-5 flex flex-col items-center gap-3">
            <p className="font-bold">תנו לצד השני לסרוק עם המצלמה:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="קוד QR לאימות המפגש" className="w-56 h-56 rounded-xl" />
            <p className="text-sm text-foreground/60">
              ממתינים לאישור... הקוד תקף ל-15 דקות
            </p>
          </div>
        ) : (
          <button
            className="card w-full px-5 py-4 font-bold text-rose-deep"
            onClick={startVerification}
          >
            🤝 אמתו את המפגש בסריקת QR — ותקבלו נקודות כפולות
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
        />
        {preview ? (
          <button className="w-full" onClick={() => fileRef.current?.click()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="סלפי החיבוק"
              className="w-full rounded-3xl shadow-lg"
            />
            <span className="text-sm text-foreground/50">לחצו כדי לצלם שוב</span>
          </button>
        ) : (
          <button
            className="card w-full aspect-square flex flex-col items-center justify-center gap-3 text-foreground/60"
            onClick={() => fileRef.current?.click()}
          >
            <span className="text-6xl">📸</span>
            <span className="font-bold text-lg">לחצו לצילום הסלפי</span>
          </button>
        )}
        <textarea
          className="card w-full px-5 py-4 text-base outline-none focus:ring-2 ring-rose resize-none"
          rows={3}
          placeholder="כמה מילים על המפגש... (לא חובה)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={280}
        />
        {error && <p className="text-red-600 font-medium">{error}</p>}
        <button
          className="btn-primary text-xl w-full"
          disabled={!file || posting}
          onClick={publish}
        >
          {posting ? "מעלים..." : "פרסמו את החיבוק ❤️"}
        </button>
      </main>
      <BottomNav />
    </div>
  );
}
