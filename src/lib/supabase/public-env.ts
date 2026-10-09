/**
 * Public Supabase env only. Safe to import from Client Components.
 * Never put the service-role key in this module.
 *
 * NEXT_PUBLIC_* values must be referenced with static property access so
 * Next.js can inline them into the client bundle at build time.
 */

function requirePublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  value: string | undefined,
): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project values.`,
    );
  }
  return value;
}

export function getSupabasePublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    url: requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl),
    publishableKey: requirePublicEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      supabasePublishableKey,
    ),
  };
}
