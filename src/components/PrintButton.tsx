"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold"
    >
      Download PDF
    </button>
  );
}
