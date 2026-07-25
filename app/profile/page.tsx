"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import InviteButton from "@/components/InviteButton";

export default function Profile() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [invited, setInvited] = useState<number>(0);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        router.replace("/");
        return;
      }
      const id = sess.session.user.id;
      setUid(id);
      const { data: p } = await sb
        .from("profiles")
        .select("name, emoji, bio, avatar_path, score")
        .eq("id", id)
        .maybeSingle();
      const { data: refStats } = await sb.rpc("my_referral_stats");
      if (refStats?.[0]) setInvited(refStats[0].invited);
      if (p) {
        setName(p.name);
        setEmoji(p.emoji);
        setBio(p.bio ?? "");
        setScore(p.score ?? 0);
        if (p.avatar_path) {
          setAvatarUrl(
            sb.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
          );
        }
      }
    })();
  }, [router]);

  async function uploadAvatar(file: File) {
    if (!uid) return;
    setSaving(true);
    setError(null);
    try {
      const sb = supabase();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${uid}/avatar.${ext}`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      const { error: updErr } = await sb
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", uid);
      if (updErr) throw updErr;
      setAvatarUrl(
        sb.storage.from("avatars").getPublicUrl(path).data.publicUrl +
          `?t=${Date.now()}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "העלאת התמונה נכשלה");
    }
    setSaving(false);
  }

  async function save() {
    if (!uid) return;
    setSaving(true);
    setError(null);
    const { error: updErr } = await supabase()
      .from("profiles")
      .update({ name: name.trim(), bio: bio.trim() || null })
      .eq("id", uid);
    if (updErr) setError(updErr.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex flex-col items-center px-6 py-8 gap-5 max-w-md mx-auto w-full">
        <h1 className="text-3xl font-black text-rose-deep">הפרופיל שלי</h1>
        {score !== null && (
          <div className="card px-6 py-3 text-center">
            <span className="text-2xl font-black text-rose-deep">🏅 {score}</span>
            <span className="block text-sm text-foreground/60">
              נקודות אהבת חינם
            </span>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
        />
        <button
          className="relative"
          onClick={() => fileRef.current?.click()}
          aria-label="העלאת תמונת פרופיל"
        >
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt="תמונת הפרופיל שלי"
              className="w-32 h-32 rounded-full object-cover shadow-lg"
            />
          ) : (
            <span className="w-32 h-32 rounded-full bg-cream flex items-center justify-center text-6xl shadow-lg">
              {emoji}
            </span>
          )}
          <span className="absolute bottom-0 left-0 bg-rose text-white rounded-full w-9 h-9 flex items-center justify-center text-lg shadow">
            📷
          </span>
        </button>
        <div className="w-full flex flex-col gap-3">
          <label className="font-medium">השם שלי</label>
          <input
            className="card px-5 py-3 text-lg outline-none focus:ring-2 ring-rose"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
          />
          <label className="font-medium">כמה מילים עליי (יוצגו למי שהפוך ממך)</label>
          <textarea
            className="card px-5 py-3 text-base outline-none focus:ring-2 ring-rose resize-none"
            rows={3}
            placeholder="למשל: אבא לשלושה, אוהב ים ומדורות, מאמין שאפשר אחרת..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={140}
          />
        </div>
        {error && <p className="text-red-600 font-medium">{error}</p>}
        <button
          className="btn-primary w-full text-lg"
          disabled={saving || !name.trim()}
          onClick={save}
        >
          {saved ? "נשמר! ✓" : saving ? "שומרים..." : "שמירה"}
        </button>
        <div className="card px-6 py-4 w-full text-center">
          <p className="font-bold text-rose-deep text-lg">
            💌 חברים שהצטרפו בזכותכם: {invited}
          </p>
          <p className="text-sm text-foreground/60 mb-3">
            כל חבר שמשלים את השאלון דרך הלינק שלכם = 25 נקודות אליכם!
          </p>
          <InviteButton label="שלחו את הלינק האישי שלכם 💌" />
        </div>
        <button
          className="card px-5 py-3 font-bold text-rose-deep w-full"
          onClick={() => router.push("/meet?host=1")}
        >
          🤝 מפגש יזום — נפגשים עם חבר? קבלו ניווט חי ונקודות
        </button>
        <button
          className="text-rose-deep font-medium"
          onClick={() => router.push("/retake")}
        >
          🔄 עדכון השקפת העולם (אחת ל-30 יום)
        </button>
      </main>
      <BottomNav />
    </div>
  );
}
