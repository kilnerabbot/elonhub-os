/**
 * Validation for proof-of-payment uploads.
 *
 * A file upload is a trust boundary, and these particular files contain bank
 * details. Three checks, because any one alone is bypassable:
 *
 *   1. Extension  — cheap, and what the user sees. Trivially forged.
 *   2. MIME type  — sent by the browser, so also attacker-controlled.
 *   3. Magic bytes — the actual file header. This is the one that matters:
 *      renaming payload.html to proof.pdf passes the first two and fails here.
 *
 * The stored filename is never taken from the client. It is derived from the
 * payment id plus an extension chosen from the validated type, which removes
 * path traversal (../), null bytes, absurd lengths and duplicate-name
 * collisions in a single step.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type AllowedType = "pdf" | "jpg";

const SIGNATURES: { type: AllowedType; mime: string; bytes: number[] }[] = [
  // "%PDF"
  { type: "pdf", mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  // JPEG SOI marker; covers jpg, jpeg and the JFIF/Exif variants.
  { type: "jpg", mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

const EXTENSIONS: Record<string, AllowedType> = {
  pdf: "pdf",
  jpg: "jpg",
  jpeg: "jpg",
};

export type UploadCheck =
  | { ok: true; type: AllowedType; mime: string; extension: string }
  | { ok: false; error: string };

/** Reads the declared extension from a filename, lowercased, without the dot. */
export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

/** Matches the leading bytes of a file against the known signatures. */
export function sniff(head: Uint8Array): AllowedType | null {
  for (const sig of SIGNATURES) {
    if (head.length < sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => head[i] === b)) return sig.type;
  }
  return null;
}

/**
 * Validate an upload. `head` needs only the first few bytes of the file.
 *
 * The magic-byte check is authoritative: a mismatch between the real content
 * and the claimed extension is rejected even when both the extension and the
 * MIME type are in the allow-list.
 */
export function checkUpload(
  filename: string,
  size: number,
  head: Uint8Array
): UploadCheck {
  if (size <= 0) return { ok: false, error: "That file is empty." };
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is larger than 10 MB." };
  }

  const extension = extensionOf(filename);
  const declared = EXTENSIONS[extension];
  if (!declared) {
    return { ok: false, error: "Only PDF, JPG and JPEG files are accepted." };
  }

  const actual = sniff(head);
  if (actual === null) {
    return { ok: false, error: "That file is not a valid PDF or JPEG." };
  }
  if (actual !== declared) {
    return {
      ok: false,
      error: `That file is named .${extension} but its contents are not ${declared === "pdf" ? "a PDF" : "a JPEG"}.`,
    };
  }

  const mime = SIGNATURES.find((s) => s.type === actual)!.mime;
  return { ok: true, type: actual, mime, extension: actual === "pdf" ? "pdf" : "jpg" };
}

/**
 * Storage path for a payment's proof.
 *
 * Built entirely from the payment id and the validated extension — no part of
 * the client's filename reaches the filesystem.
 */
export function proofPath(paymentId: string, extension: string): string {
  return `${paymentId}/proof.${extension}`;
}
