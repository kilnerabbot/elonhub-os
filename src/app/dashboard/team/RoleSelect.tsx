"use client";

import type { AppRole } from "@/lib/supabase/types";
import { updateRole } from "./actions";

const ROLES: AppRole[] = [
  "super_admin", "director", "sales_manager", "salesperson", "project_manager",
  "employee", "finance", "support_agent", "hr", "client",
];

export function RoleSelect({ userId, role }: { userId: string; role: AppRole }) {
  return (
    <form action={updateRole} className="inline-flex">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={role}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs text-text"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace("_", " ")}
          </option>
        ))}
      </select>
    </form>
  );
}
