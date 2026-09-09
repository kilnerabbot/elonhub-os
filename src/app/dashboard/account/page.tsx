import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { PasswordForm } from "./PasswordForm";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="max-w-3xl p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Your account">
          <dl className="flex flex-col gap-2 text-[13px]">
            <Row label="Name" value={session.fullName} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row label="Role" value={label(session.role)} />
          </dl>
          <p className="mt-4 text-[11px] text-text-faint">
            Only a super admin can change your role, from the Team page.
          </p>
        </Card>

        <Card title="Change password">
          <PasswordForm />
        </Card>
      </div>

      <p className="mt-4 text-[11px] text-text-faint">
        If an administrator set this password for you, change it now — a password someone else
        chose is a password someone else knows.
      </p>
    </div>
  );
}

function Row({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex-none text-text-dim">{name}</dt>
      <dd className="min-w-0 truncate text-right capitalize text-text">{value}</dd>
    </div>
  );
}
