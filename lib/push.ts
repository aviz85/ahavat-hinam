import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY =
  "BEuV8Pinq6fNU7dp4nh2VueRgqa4_Lx4VYXXBfWYHLOYtex89mp3kY9gDCjexDSyEn6O0DDE5AzCYtasVRLg00U";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Registers the SW and saves the push subscription. Returns a status string.
export async function enableProximityPush(): Promise<
  "enabled" | "denied" | "unsupported"
> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const sb = supabase();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user) return "unsupported";
  await sb.from("push_subscriptions").upsert({
    user_id: userData.user.id,
    subscription: sub.toJSON(),
  });
  return "enabled";
}

export async function isPushEnabled(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator))
    return false;
  if (Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return !!(reg && (await reg.pushManager.getSubscription()));
}
