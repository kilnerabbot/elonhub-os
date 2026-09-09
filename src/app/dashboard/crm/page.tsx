import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateCustomer } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // No org filter needed: customers_select already scopes to the caller's org
  // and role. Adding one here would only duplicate the policy, and would drift
  // from it the moment the policy changes.
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, legal_name, trading_name, industry, created_at")
    .order("legal_name", { ascending: true })
    .limit(100);

  const canCreate = canCreateCustomer(session.role);

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-sm text-text-dim">
          Every customer your role can see. {!canCreate && "Your role is read-only here."}
        </p>
        {canCreate && (
          <Link
            href="/dashboard/crm/new"
            className="flex-none rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold"
          >
            New customer
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Could not load customers.
        </p>
      )}

      {!error && (customers ?? []).length === 0 && (
        <div className="rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">No customers yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            {canCreate
              ? "Add the first one and it will start feeding the dashboard figures."
              : "Nothing has been added yet, or none are assigned to you."}
          </p>
        </div>
      )}

      {(customers ?? []).length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {(customers ?? []).map((c) => (
            <li key={c.id} className="border-b border-border last:border-0">
              <Link
                href={`/dashboard/crm/${c.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-text">{c.legal_name}</span>
                  {c.trading_name && (
                    <span className="block truncate text-xs text-text-dim">
                      trading as {c.trading_name}
                    </span>
                  )}
                </span>
                <span className="flex-none text-xs text-text-faint">{c.industry ?? "—"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
