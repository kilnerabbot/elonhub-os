import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateLead } from "@/lib/permissions";
import { LeadForm } from "../LeadForm";

export default async function NewLeadPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Gate the route, not just the button — the link being hidden is not access control.
  if (!canCreateLead(session.role)) {
    return (
      <div className="max-w-xl p-6">
        <h2 className="text-lg font-semibold tracking-tight text-text">Not available</h2>
        <p className="mt-2 text-sm text-text-dim">
          Capturing leads needs the sales manager or salesperson role. Yours is{" "}
          <span className="capitalize">{session.role.replace(/_/g, " ")}</span>.
        </p>
        <Link
          href="/dashboard/crm/leads"
          className="mt-4 inline-block text-sm text-gold-bright hover:underline"
        >
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="mb-6 text-sm text-text-dim">
        A reference is allocated automatically. You will be set as the owner.
      </p>
      <LeadForm />
    </div>
  );
}
