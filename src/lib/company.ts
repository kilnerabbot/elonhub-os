/**
 * Letterhead details for printed documents.
 *
 * ElonHub OS is single-tenant, and the organisations table carries only name,
 * VAT number, currency and rate — there is no address or contact column. These
 * live here rather than being invented as schema. If the business ever needs a
 * second trading entity, this moves into organisations and becomes a query.
 */
export const COMPANY = {
  name: "Elon Hub Technologies",
  addressLines: ["169 Oxford Street", "Craddock Square", "Rosebank", "Johannesburg"],
  phone: "063 333 0469",
  email: "hello@elonhub.co.za",
  website: "elonhub.co.za",
  whatsapp: "https://wa.me/27633330469",
} as const;

/** Banking details printed on invoices so a client can pay without asking. */
export const BANKING = {
  // ponytail: placeholders. Replace with the real account before sending any
  // invoice to a client — an invoice with wrong banking details is worse than
  // one with none.
  bank: "—",
  accountName: "Elon Hub Technologies",
  accountNumber: "—",
  branchCode: "—",
} as const;
