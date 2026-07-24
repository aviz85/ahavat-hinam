import { supabase } from "@/lib/supabase";

// Fire-and-forget product analytics. Never blocks or breaks UX.
export function logEvent(event: string, props: Record<string, unknown> = {}) {
  try {
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
