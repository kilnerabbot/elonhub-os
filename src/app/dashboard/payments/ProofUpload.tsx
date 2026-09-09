"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/validate";
import { uploadProof } from "./actions";

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[11px] text-gold-bright transition-colors hover:underline disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

export function ProofUpload({
  paymentId,
  hasProof,
}: {
  paymentId: string;
  hasProof: boolean;
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(uploadProof, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = state && !state.ok ? (state.errors.proof ?? state.message) : undefined;

  return (
    <form action={action} className="flex flex-col items-end gap-0.5">
      <input type="hidden" name="payment_id" value={paymentId} />

      <div className="flex items-center gap-2">
        {hasProof && (
          <a
            href={`/api/payment-proof/${paymentId}`}
            target="_blank"
            rel="noopener"
            className="text-[11px] text-good hover:underline"
          >
            View
          </a>
        )}
        <input
          ref={inputRef}
          type="file"
          name="proof"
          // A hint for the file picker only — the server re-checks the
          // extension, the MIME type and the file's actual header bytes.
          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
          aria-label={hasProof ? "Replace proof of payment" : "Upload proof of payment"}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="w-28 text-[10px] text-text-faint file:mr-1 file:rounded file:border-0 file:bg-surface-2 file:px-1.5 file:py-0.5 file:text-[10px] file:text-text-dim"
        />
        <UploadButton />
      </div>

      {error && (
        <span role="alert" className="max-w-[16rem] text-right text-[10px] text-danger">
          {error}
        </span>
      )}
      {state?.ok && <span className="text-[10px] text-good">Saved</span>}
    </form>
  );
}
