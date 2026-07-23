import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}

export type Profile = {
  id: string;
  name: string;
  emoji: string;
  answers: number[];
};

export type OppositeMatch = {
  id: string;
  name: string;
  emoji: string;
  distance_m: number;
  opposition: number;
  lat: number;
  lng: number;
};

export type Hug = {
  id: string;
  hugger_id: string;
  hugged_name: string | null;
  image_path: string;
  caption: string | null;
  created_at: string;
  profiles: { name: string; emoji: string } | null;
};
