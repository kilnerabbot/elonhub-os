# End-to-end walkthrough — lead to receipt

The full commercial chain is **lead → quote → convert → invoice → issue →
payment → receipt**. It crosses two rounding boundaries, a discount fold, a
customer promotion and a derived status. Every part has unit tests; none of it
has ever been run against the real database.

That gap matters, because all three production failures found so far — the
42P17 policy recursion, the swallowed error code, and the `"use server"`
module exporting constants — were invisible to `npm run build`, to `eslint`
and to `npm test`. Static verification stops at two boundaries it cannot
cross: the **database** and the **server/client** split. This document walks
both.

Numbers below are computed from `src/lib/money.ts`, `src/lib/quoteToInvoice.ts`
and `src/lib/invoice.ts` — the same modules the app runs. If the screen
disagrees with this page, the screen is wrong.

Run it in one sitting, on https://elonhub-os.vercel.app, signed in as the
super admin.

---

## 0. Preconditions

| Check | How | If it fails |
| --- | --- | --- |
| Migrations 0006–0009 applied | Run the SQL in 0.1 | Apply them in the Supabase SQL editor, in order |
| `SUPABASE_SERVICE_ROLE_KEY` set in Vercel | Team, Add member renders without an env warning | Add it **unprefixed**, then redeploy |
| VAT number set | `/dashboard/settings` shows no red banner | Do step 1 first — it is a hard gate for step 11 |

### 0.1 Verification SQL

```sql
select count(*) from tickets;
select count(*) from ticket_messages;
select count(*) from invitations;
select id, public, file_size_limit from storage.buckets where id = 'payment-proofs';
select column_name from information_schema.columns
  where table_name = 'payments' and column_name = 'proof_path';
select column_name from information_schema.columns
  where table_name = 'organisations' and column_name = 'bank_branch_code';
```

The last row is migration 0009. If it returns nothing, `/dashboard/settings`
will still load and documents still print — they fall back to the constants in
`src/lib/company.ts` — but saving will tell you to apply 0009.

---

## 1. Company details

**Go to** Settings.

1. Enter the real VAT number (10 digits, starts with 4).
2. **Type the branch code, after checking it against a bank statement.** The
   field is empty on purpose, with `250655` shown only as a hint — that is
   FNB's universal code, inferred and never confirmed, and a pre-filled field
   reads as a confirmed one. Until you type it, documents keep falling back to
   the same value. A wrong branch code is a payment that does not arrive.
3. Confirm the account holder reads exactly as the bank has it.
4. Save.

**Expect:** "Saved." and the red VAT banner disappears.

> **What this step is really testing:** that the RLS `org_update` policy
> accepts a super admin, and that `count: "exact"` reports the result. Before
> that existed, a rejected update was indistinguishable from a successful one.

---

## 2. Capture a lead

**Go to** Leads, New lead. Name it something you will recognise, e.g.
`WALKTHROUGH — Acme Mining`.

**Expect:** a reference of the form `LEAD-2026-0001`.

> Reference allocation derives from a row count with one retry on a 23505
> collision. Two people creating a lead in the same second is the case it is
> weakest at; a single-user walkthrough will not surface that.

---

## 3. Convert the lead

Open the lead, then Convert.

**Expect:** a customer **and** an opportunity, and the lead marked converted.

> **This is the step most likely to fail.** Conversion is two writes and not a
> transaction — the Supabase JS client cannot open one. If the second write
> fails you get an opportunity with the lead still unconverted. That direction
> is safe and repeatable, but confirm all three records actually exist before
> moving on. The fix, when it matters, is a Postgres function called via
> `.rpc()`.

---

## 4. Quote

**Go to** Quotes, New, against the customer from step 3. Add these five lines
exactly:

| # | Description | Qty | Unit price | Discount | VAT | Expected Amount |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Brand identity system | 1 | 12500.00 | 0% | yes | **R12 500.00** |
| 2 | Website build — 8 pages | 1 | 28500.00 | 10% | yes | **R25 650.00** |
| 3 | Copywriting | 3 | 1999.99 | 0% | yes | **R5 999.97** |
| 4 | Domain registration (disbursement) | 1 | 199.00 | 0% | **no** | **R199.00** |
| 5 | SEO retainer — launch month | 1 | 333.33 | 33.33% | yes | **R222.23** |

**Expect, exactly:**

```
Subtotal   R44 571.20
VAT (15%)   R6 655.83
Total      R51 227.03
```

Check each one:

- **Line 3 = R5 999.97**, not R6 000.00. Rounds per line, then sums.
- **Line 5 = R222.23.** `333.33 × 66.67%` is `222.2311…`; it must round down
  to the cent, not up to `222.24`.
- **VAT is R6 655.83, which is 15% of R44 372.20** — the subtotal *less the
  R199 disbursement*. If VAT reads **R6 685.68** the non-vatable flag is being
  ignored; the difference is exactly R29.85, the VAT on R199.
- No warning banner. A banner means the stored total disagrees with the sum of
  the line items; the page recomputes and the recomputation is authoritative.

> Line 4 is worth copying onto real quotes too: a disbursement passed through
> at cost should not attract output VAT.

---

## 5. Print the quote

Open the printable quote, press **Ctrl+P**, and look at the preview, not just
the screen.

**Expect:** A4, one page, colour intact in the preview, no sidebar, your
address block top-left, `Our VAT no.` in the meta column, and the five lines
adding up to the totals above.

> Colour vanishing in the preview means `print-color-adjust: exact` was lost.
> A sidebar appearing means the document was moved back under `/dashboard`,
> whose layout it lives outside of precisely so it can drop the chrome.

---

## 6. Convert the quote to an invoice

From the quote, convert.

**Expect** the invoice lines to read:

| Description | Qty | Unit price | Amount |
| --- | --- | --- | --- |
| Brand identity system | 1 | R12 500.00 | R12 500.00 |
| Website build — 8 pages (1 × 28500.00, less 10%) | **1** | **R25 650.00** | R25 650.00 |
| Copywriting | 3 | R1 999.99 | R5 999.97 |
| Domain registration (disbursement) | 1 | R199.00 | R199.00 |
| SEO retainer — launch month (1 × 333.33, less 33.33%) | **1** | **R222.23** | R222.23 |

**Expect the invoice total to be `R51 227.03` — identical to the quote, to the
cent.**

> **This is the highest-value assertion in the document.** `invoice_items` has
> no `discount_pct` column, so a discounted line has to go somewhere. Lines 2
> and 5 collapse to a single unit at their exact net, with the original terms
> kept in the description. The tempting alternative — dividing the net back
> into a per-unit price — does not divide evenly in cents and would bill the
> client a figure they never accepted. Line 3 keeps its real quantity of 3,
> because it was never discounted.
>
> If the two totals differ by any amount at all, stop and report it.

---

## 7. Guards on a draft invoice

Before issuing, try each of these. Each **must** be refused with a readable
message — not a crash, and not a silent success:

1. Issue an invoice with **no line items** (make a second, empty draft).
2. Void an invoice that already has a payment (return to this after step 8).
3. Edit a line item on an invoice that has already been issued.

> Invoice immutability after issue is enforced in **app code, not RLS** —
> `0002_rls.sql` says outright that RLS cannot express "only while draft".
> That makes these three clicks the only thing standing between you and an
> altered tax invoice. They are the checks most worth repeating after any
> change to the invoices module.

---

## 8. Issue, then pay in two parts

Issue the invoice with a due date of **2026-10-15**.

**Expect:** status `sent`.

Record the first payment: **R20 000.00**.

**Expect:** status `partially_paid`, balance **R31 227.03**.

Record the second payment: **R31 227.03**.

**Expect:** status `paid`, balance R0.00.

Now try to record **one more cent**.

**Expect:** refused as an overpayment.

> Status is never set by hand — `deriveStatus` computes it from the payments
> table, in integer cents. The cents matter: `total - paid` in floating point
> can leave 0.000000001 outstanding on a fully settled invoice, which would
> leave it reading `partially_paid` forever.

---

## 9. Proof of payment

On one of the two payments, upload a proof — first a real PDF, then a real
JPEG.

Then try to break it:

- Rename a `.txt` to `.pdf` and upload it. **Must be refused.**
- Upload something far larger than the bucket limit. **Must be refused.**
- Open the proof link, copy the URL, wait **over a minute**, then open it in a
  private window. **Must be dead.**

> Validation checks extension, MIME type **and** magic bytes, because the
> first two are set by the client and the third is not. The bucket is private;
> access goes through a 60-second signed URL, so a link pasted into a group
> chat stops working almost immediately. The stored path derives from the
> payment id and never from the filename that was uploaded.

---

## 10. Receipt

Open the receipt for the **first** payment, the R20 000.00 one.

**Expect:** `Amount received R20 000.00`, invoice total `R51 227.03`, and the
receipt explicitly not calling itself a tax invoice.

> Receipts are per payment, not per invoice, so a part-paid invoice produces
> several and each stands alone as proof that a specific amount arrived on a
> specific date. The receipt number derives from the payment id, so asking for
> the same receipt twice gives the same number.

---

## 11. Tax invoice

Open the printable invoice.

**Expect:**

- The title reads **Tax Invoice**.
- **Your VAT number is present.** If it is missing, an on-screen warning says
  so. That warning never prints, by design — but do not send the document.
- The banking block matches what you saved in step 1, including the branch
  code you confirmed.
- `Please use INV-2026-nnnn as your payment reference.`
- Paid and Balance due rows are present, because money has moved.

---

## 12. Clean up

Delete the walkthrough customer, or rename it `ARCHIVE — walkthrough`, so the
dashboard is not skewed by a R51k invoice that was never real.

> The dashboard reads the live tables. A test invoice left `paid` inflates
> revenue for the month.

---

## Record the result

| Step | Pass | Notes |
| --- | --- | --- |
| 1 Settings saved | | |
| 2 Lead reference | | |
| 3 Convert — all three records | | |
| 4 Quote totals R51 227.03 | | |
| 5 Quote prints A4 | | |
| 6 **Invoice total == quote total** | | |
| 7 Three guards refuse | | |
| 8 sent, partially_paid, paid | | |
| 9 Proof upload and rejections | | |
| 10 Receipt | | |
| 11 VAT number on tax invoice | | |

Anything that fails: capture the **exact** on-screen message. Unrecognised
database errors now name their SQLSTATE, and every one is logged server-side
with a context label. Filter the Vercel logs for `[db]`:

```
npx vercel logs elonhub-os --scope team_GPAchZxF3UhWIxXnMh6bZHjp
```
