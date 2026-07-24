import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Fire-and-forget product analytics: Supabase always, Google Analytics when
// NEXT_PUBLIC_GA_ID is configured (same events, same names, zero extra code).
export function logEvent(event: string, props: Record<string, unknown> = {}) {
  try {
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", event, props);
    }
    const sb = supabase();
    sb.auth
      .getSession()
      .then(({ data }) =>
        sb.from("app_events").insert({
          user_id: data.session?.user.id ?? null,
          event,
          props,
        })
      )
      .then(({ error }) => {
        if (error && process.env.NODE_ENV === "development")
          console.warn("logEvent failed:", event, error.message);
      });
  } catch {
    // analytics must never crash the app
  }
}
