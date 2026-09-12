/**
 * Letterhead details for printed documents.
 *
 * These constants are the FALLBACK, not the source of truth. Migration 0009
 * moved organisation identity and banking into the organisations table so a
 * super admin can correct them from Settings without a deploy. Anything still
 * NULL in the database — or absent entirely, if 0009 has not been applied —
 * falls back to the value here, so documents always render.
 *
 * NULL and empty string mean different things, deliberately:
 *
 *   NULL / absent   never set   -> fall back to the constant
 *   ""              cleared     -> print nothing
 *
 * Without that distinction a field could never be removed: clearing it would
 * store NULL, the constant would reappear on the next document, and nothing
 * would signal that the save had not done what it appeared to. On a screen
 * whose whole purpose is correcting these values, that is the wrong default.
 *
 * Read them through `letterhead(org)`. Importing COMPANY or BANKING directly
 * into a document bypasses whatever the organisation actually saved.
 */
export const COMPANY = {
  name: "Elon Hub Technologies",
  addressLines: ["169 Oxford Street", "Craddock Square", "Rosebank", "Johannesburg"],
  phone: "063 333 0469",
  email: "hello@elonhub.co.za",
  website: "elonhub.co.za",
} as const;

/** Banking details printed on invoices so a client can pay without asking. */
export const BANKING = {
  bank: "FNB / RMB",
  accountName: "Elonhub Tech (Pty) Ltd",
  accountType: "Gold Business Account",
  accountNumber: "63169277944",
  // FNB's universal branch code. It is the correct code for every FNB account
  // and is what the bank itself tells account holders to publish, but it was
  // not supplied directly. Confirm it against a bank statement and save it in
  // Settings — saving is also what retires this caveat.
  branchCode: "250655",
} as const;

/** The organisation columns the letterhead cares about. All optional: a row
 *  read before migration 0009 simply will not carry the newer keys. */
export type OrgIdentity = {
  name?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  bank_branch_code?: string | null;
};

export type Letterhead = {
  name: string;
  /** Null when the organisation has not registered one. Never falls back —
   *  inventing a VAT number on a tax invoice would be a far worse failure
   *  than printing none, so callers must handle the null and warn. */
  vatNumber: string | null;
  registrationNumber: string | null;
  addressLines: string[];
  phone: string;
  email: string;
  website: string;
  bank: {
    name: string;
    accountName: string;
    accountType: string;
    accountNumber: string;
    branchCode: string;
  };
};

/** A stored value, or the fallback when the column is NULL or absent. An empty
 *  string is a value — see the note at the top of this file. */
function pick(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return value.trim();
}

/** A stored value or null. For fields that have no sensible default. */
function orNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

/**
 * Merges the organisation row over the constants above.
 *
 * Accepts null so a caller whose query failed still gets a usable letterhead
 * instead of having to branch. NOTE: a caller must NOT treat a failed read as
 * an empty organisation and feed the result into an editable form — saving
 * that form would write these constants over whatever was really stored.
 */
export function letterhead(org?: OrgIdentity | null): Letterhead {
  const address = org?.address;

  return {
    name: pick(org?.name, COMPANY.name),
    vatNumber: orNull(org?.vat_number),
    registrationNumber: orNull(org?.registration_number),
    // Stored as one text column but printed as stacked lines. Blank lines are
    // dropped so a trailing newline does not push the header out of shape.
    addressLines:
      address === null || address === undefined
        ? [...COMPANY.addressLines]
        : address
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
    phone: pick(org?.phone, COMPANY.phone),
    email: pick(org?.email, COMPANY.email),
    website: pick(org?.website, COMPANY.website),
    bank: {
      name: pick(org?.bank_name, BANKING.bank),
      accountName: pick(org?.bank_account_name, BANKING.accountName),
      accountType: pick(org?.bank_account_type, BANKING.accountType),
      accountNumber: pick(org?.bank_account_number, BANKING.accountNumber),
      branchCode: pick(org?.bank_branch_code, BANKING.branchCode),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Input normalisation and format checks                              */
/* ------------------------------------------------------------------ */
/*
 * These live here rather than inside the settings server action because a
 * module carrying "use server" may export only async functions, so nothing
 * defined in one can be imported by a test. They guard values printed on
 * documents a client acts on, which makes them the last thing in the codebase
 * that should go untested.
 */

/**
 * Strips Unicode control and format characters, keeping newlines.
 *
 * A U+202E right-to-left override inside the account holder name renders as a
 * plausible but different string on a printed invoice while the account digits
 * stay valid — invisible to whoever proofreads it before sending. Newlines
 * survive because the address is one column printed as stacked lines, and
 * removing them would collapse the letterhead into a single row.
 */
export function stripControl(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/(?!\n)[\p{Cc}\p{Cf}]/gu, "")
    .trim();
}

/**
 * Removes the separators people paste along with a number.
 *
 * "4123 456 789", "4123-456-789" and "4123/456789" are the same VAT number,
 * and rejecting two of them teaches the user nothing except that the form is
 * fussy.
 */
export function normaliseDigits(value: string): string {
  return value.replace(/[\s\-/]/g, "");
}

/**
 * A SARS VAT registration number: ten digits beginning with 4.
 *
 * Shape only. SARS numbers also carry a mod-10 check digit, which would catch
 * a transposition this does not — worth adding if a wrong VAT number ever
 * actually reaches a client.
 */
export function isVatNumber(value: string): boolean {
  return /^4\d{9}$/.test(value);
}

/** A South African bank branch code: six digits. */
export function isBranchCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** A bank account number. Length varies by bank, so this checks digits and a
 *  sane range rather than pretending to know the exact format. */
export function isAccountNumber(value: string): boolean {
  return /^\d{6,20}$/.test(value);
}
