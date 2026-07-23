"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";

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

  useEffect(() => {
    const raw = sessionStorage.getItem("hug_target");
    if (raw) setTarget(JSON.parse(raw));
  }, []);

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
      const { error: insErr } = await sb.from("hugs").insert({
        hugger_id: uid,
        hugged_id: target?.id ?? null,
        hugged_name: target?.name ?? null,
        image_path: path,
        caption: caption.trim() || null,
      });
      if (insErr) throw insErr;
      sessionStorage.removeItem("hug_target");
      router.replace("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ההעלאה נכשלה, נסו שוב");
      setPosting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex flex-col items-center px-6 py-8 gap-5 max-w-md mx-auto w-full">
        <h1 className="text-3xl font-black text-rose-deep text-center">
          סלפי החיבוק 🤳
        </h1>
        {target && (
          <p className="text-lg text-center">
            אתם ו<b>{target.name}</b> — תנציחו את הרגע!
          </p>
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
