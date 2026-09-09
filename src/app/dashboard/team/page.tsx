import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canInviteMember } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { RoleSelect } from "./RoleSelect";
import { MemberForm } from "./MemberForm";
import { revokeInvitation } from "./actions";

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const isAdmin = session.role === "super_admin";
  const canInvite = canInviteMember(session.role);

  const [{ data: teammates }, { data: invitations }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true }),
    // invitations_select is admin-only; a non-admin simply gets nothing back.
    supabase
      .from("invitations")
      .select("id, email, full_name, role, accepted_at, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  // Normally empty: an invitation is written and consumed within the same
  // request. A row lingering here means account creation failed after the
  // grant was written, so it is shown for cleanup rather than hidden.
  const pending = invitations ?? [];

  return (
    <div className="max-w-3xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        Everyone with an account and the role they hold.{" "}
        {isAdmin ? "You can change roles below." : ""}
      </p>

      <div className="mb-4 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Name
              </th>
              <th className="px-4 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {(teammates ?? []).map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-text">
                  {t.full_name}
                  {t.id === session.userId && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-text-faint">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <RoleSelect userId={t.id} role={t.role} />
                  ) : (
                    <span className="text-xs capitalize text-text-dim">{label(t.role)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div className="mb-4">
          <Card title={`Unclaimed grants (${pending.length})`}>
            <ul className="flex flex-col gap-2">
              {pending.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 text-[13px] last:border-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-text">{i.email}</span>
                    <span className="block truncate text-[11px] capitalize text-text-faint">
                      {i.full_name ? `${i.full_name} · ` : ""}
                      {label(i.role)}
                    </span>
                  </span>
                  {canInvite && (
                    <form action={revokeInvitation}>
                      <input type="hidden" name="invitation_id" value={i.id} />
                      <button
                        type="submit"
                        aria-label={`Revoke invitation for ${i.email}`}
                        className="text-[11px] text-text-faint transition-colors hover:text-danger"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {canInvite && (
        <Card title="Add a team member">
          <MemberForm />
        </Card>
      )}
    </div>
  );
}
