import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import type { Database } from "@/types/database";

/**
 * Browser / Client Component Supabase client (publishable key only).
 * Subject to RLS + revoked write privileges. Not for secrets or grading.
 */
export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
