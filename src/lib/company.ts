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
  bank: "FNB / RMB",
  accountName: "Elonhub Tech (Pty) Ltd",
  accountType: "Gold Business Account",
  accountNumber: "63169277944",
  // FNB's universal branch code. It is the correct code for every FNB account
  // and is what the bank itself tells account holders to publish, but it was
  // not supplied directly — confirm before this reaches a client.
  branchCode: "250655",
} as const;
