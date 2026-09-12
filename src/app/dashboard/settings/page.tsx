import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canEditOrganisation } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BANKING, letterhead } from "@/lib/company";
import { describeDbError } from "@/lib/validate";
import { Card } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // select("*") rather than a column list on purpose. If migration 0009 has
  // not been applied, naming the new columns returns 42703 and takes the page
  // down; with "*" the row simply arrives without those keys and letterhead()
  // falls back to the constants. One row, single tenant — nothing is saved by
  // narrowing it.
  const { data: org, error } = await supabase.from("organisations").select("*").maybeSingle();

  // A failed read must NOT fall through to the form.
  //
  // letterhead(null) returns the constants in src/lib/company.ts, which is the
  // right answer for a document — it still prints. It is the wrong answer for
  // an editable form: those constants would pre-fill as if they were the saved
  // state, and one Save would write them over the real row, blanking a real
  // VAT number in the process. A document degrades; a form that degrades
  // destroys data.
  if (error || !org) {
    const message = error
      ? describeDbError(error, "settingsPage.organisations")
      : "No organisation record was found for your account.";
    return (
      <div className="max-w-4xl p-6">
        <Card title="Company details">
          <p role="alert" className="text-[13px] text-danger">
            {message}
          </p>
          <p className="mt-3 text-[12px] text-text-dim">
            The details currently printed on documents are unaffected. Nothing can be edited
            until this record loads, so that a failed read cannot overwrite what is stored.
          </p>
        </Card>
      </div>
    );
  }

  const head = letterhead(org);
  const editable = canEditOrganisation(session.role);
  const vatRate = Number(org.vat_rate ?? 15);

  return (
    <div className="flex max-w-4xl flex-col gap-4 p-6">
      {!head.vatNumber && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
        >
          No VAT number is set. Every document printed as a <strong>Tax Invoice</strong> is
          leaving without one, which does not meet section 20(4) of the VAT Act — a client
          cannot claim input tax against it.
          {editable ? " Add it below." : " Ask a super admin to add it."}
        </p>
      )}

      <Card title="Company details">
        <p className="mb-5 text-[12px] text-text-dim">
          These print on every quote, invoice and receipt.
          {!editable && " Only a super admin can change them."}
        </p>

        {editable ? (
          <SettingsForm
            defaults={{
              name: head.name,
              // No fallback: an unset VAT number must stay visibly empty
              // rather than pre-filling something that was never registered.
              vat_number: head.vatNumber ?? "",
              registration_number: head.registrationNumber ?? "",
              // Pre-filled from the constants, so the first save moves the
              // current letterhead into the database as-is.
              address: head.addressLines.join("\n"),
              phone: head.phone,
              email: head.email,
              website: head.website,
              bank_name: head.bank.name,
              bank_account_name: head.bank.accountName,
              bank_account_type: head.bank.accountType,
              bank_account_number: head.bank.accountNumber,
              // Deliberately NOT pre-filled from the constant. 250655 was
              // inferred rather than supplied, and a populated field reads as
              // a confirmed one — the first Save would promote a guess into
              // the database where it loses the caveat. Empty with the guess
              // as a placeholder means someone has to type it. Leaving it
              // empty changes nothing: it stores NULL and documents keep
              // falling back to the same constant.
              bank_branch_code: org.bank_branch_code ?? "",
            }}
            branchCodePlaceholder={BANKING.branchCode}
          />
        ) : (
          <dl className="flex flex-col gap-2 text-[13px]">
            <Row label="Company name" value={head.name} />
            <Row label="VAT number" value={head.vatNumber ?? "Not set"} />
            <Row label="Registration number" value={head.registrationNumber ?? "Not set"} />
            <Row label="Address" value={head.addressLines.join(", ")} />
            <Row label="Phone" value={head.phone} />
            <Row label="Email" value={head.email} />
            <Row label="Bank" value={`${head.bank.name} · ${head.bank.accountType}`} />
            <Row
              label="Account"
              value={`${head.bank.accountNumber} · branch ${head.bank.branchCode}`}
            />
          </dl>
        )}
      </Card>

      <Card title="VAT rate">
        <dl className="flex flex-col gap-2 text-[13px]">
          <Row label="Rate" value={`${vatRate}%`} />
          <Row label="Currency" value={String(org?.currency ?? "ZAR")} />
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-text-faint">
          Not editable here, deliberately. Documents recompute their totals from the line
          items using this rate, so changing it would also change invoices that were issued
          and sent at the old one — the client&rsquo;s copy and yours would stop matching. A
          rate change needs the rate recorded on each invoice first. Until then, change it in
          SQL when the rate actually changes, and reissue anything still open.
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex-none text-text-dim">{label}</dt>
      <dd className="min-w-0 text-right text-text">{value}</dd>
    </div>
  );
}
