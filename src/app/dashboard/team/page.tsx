import { createClient } from "@/lib/supabase/server";
import { RoleSelect } from "./RoleSelect";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const isAdmin = me?.role === "super_admin";

  const { data: teammates } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="max-w-3xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        Every signed-in user and their role. {isAdmin ? "You can change roles below." : ""}
      </p>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-faint">
                Name
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-faint">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {(teammates ?? []).map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-text">{t.full_name}</td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <RoleSelect userId={t.id} role={t.role} />
                  ) : (
                    <span className="font-mono text-xs uppercase tracking-[0.06em] text-text-dim">
                      {t.role.replace("_", " ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
