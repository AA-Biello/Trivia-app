import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import type { Database } from "@/types/database";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null =
  null;

/**
 * Browser / Client Component Supabase client (publishable key only).
 * Subject to RLS + revoked write privileges. Not for secrets or grading.
 * Singleton so Realtime keeps one WebSocket across remounts/HMR.
 */
export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getSupabasePublicEnv();
  browserClient = createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
