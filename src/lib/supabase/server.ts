import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import type { Database } from "@/types/database";

/**
 * Server Component client with publishable key + cookies.
 * Still subject to RLS. Privileged game mutations use createAdminClient after
 * verifying host/team session token hashes server-side.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Session refresh belongs in a future proxy.ts when auth is wired.
        }
      },
    },
  });
}
