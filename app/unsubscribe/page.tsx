"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function UnsubscribeInner() {
  const params = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    const uid = params.get("u");
    if (!uid || !/^[0-9a-f-]{36}$/.test(uid)) {
      setState("error");
      return;
    }
    supabase()
      .rpc("unsubscribe_email", { p_uid: uid })
      .then(({ data, error }) => setState(!error && data ? "done" : "error"));
  }, [params]);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
      {state === "working" ? (
        <div className="text-5xl float">📭</div>
      ) : state === "done" ? (
        <>
          <div className="text-6xl">✓</div>
          <h1 className="text-2xl font-bold">הוסרתם מרשימת התפוצה</h1>
          <p className="max-w-xs text-foreground/70">
            לא נשלח אליכם יותר מייל מ"אהבת חינם" (חוץ ממיילים הכרחיים כמו
            אימות התחברות). החשבון והפעילות באפליקציה נשארים כרגיל.
          </p>
        </>
      ) : (
        <>
          <div className="text-6xl">😕</div>
          <h1 className="text-2xl font-bold">לא הצלחנו לעבד את הבקשה</h1>
          <p className="max-w-xs text-foreground/70">
            כתבו לנו ל-avizmaeir@gmail.com ונסיר אתכם ידנית.
          </p>
        </>
      )}
      <a className="text-rose-deep font-bold underline" href="/">
        חזרה לאהבת חינם
      </a>
    </main>
  );
}

export default function Unsubscribe() {
  return (
    <Suspense>
      <UnsubscribeInner />
    </Suspense>
  );
}
