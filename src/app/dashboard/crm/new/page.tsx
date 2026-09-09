import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateCustomer } from "@/lib/permissions";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Gate the route as well as the button. Hiding the link is not access
  // control — someone can always navigate straight here.
  if (!canCreateCustomer(session.role)) {
    return (
      <div className="max-w-xl p-6">
        <h2 className="text-lg font-semibold tracking-tight text-text">Not available</h2>
        <p className="mt-2 text-sm text-text-dim">
          Creating customers needs the sales manager or salesperson role. Yours is{" "}
          <span className="capitalize">{session.role.replace(/_/g, " ")}</span>.
        </p>
        <Link href="/dashboard/crm" className="mt-4 inline-block text-sm text-gold-bright hover:underline">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="mb-6 text-sm text-text-dim">
        You will be set as the owner. Only the legal name is required.
      </p>
      <CustomerForm />
    </div>
  );
}
