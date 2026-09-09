import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

export type Session = {
  userId: string;
  orgId: string;
  role: AppRole;
  fullName: string;
};

/**
 * The caller's profile, fetched once per request.
 *
 * Wrapped in React's `cache` so the layout, the page and any server action in
 * the same render share a single round trip instead of each issuing their own.
 *
 * Every org-scoped insert needs `org_id`, and the RLS policies all check
 * `org_id = auth_org_id()`. Reading it here means server actions never have to
 * trust an org_id supplied by the client.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    orgId: profile.org_id,
    role: profile.role,
    fullName: profile.full_name,
  };
});
