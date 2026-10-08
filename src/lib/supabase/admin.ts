import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/server-env";
import type { Database } from "@/types/database";

/**
 * Service-role client. Server-only. Bypasses RLS.
 *
 * Use only after validating host/team session tokens (see session-tokens.ts).
 * Never import from Client Components — `server-only` enforces this.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
