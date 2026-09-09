"use client";

import { useActionState } from "react";
import type { AppRole } from "@/lib/supabase/types";
import type { ActionResult } from "@/lib/validate";
import { updateRole } from "./actions";

const ROLES: AppRole[] = [
  "super_admin", "director", "sales_manager", "salesperson", "project_manager",
  "employee", "finance", "support_agent", "hr", "client",
];

export function RoleSelect({ userId, role }: { userId: string; role: AppRole }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateRole,
    null
  );
  const failed = state && !state.ok;

  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="user_id" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={pending}
        aria-label="Role"
        aria-invalid={failed ? true : undefined}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-lg border bg-surface-2 px-2 py-1 text-xs capitalize text-text disabled:opacity-60 ${
          failed ? "border-danger" : "border-border-strong"
        }`}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {/* A rejected change used to look exactly like a successful one. */}
      {failed && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}
