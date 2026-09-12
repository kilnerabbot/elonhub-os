import type { ReactNode } from "react";
import type { Letterhead } from "@/lib/company";
import { PrintButton } from "./PrintButton";

/**
 * Shared layout for printable documents.
 *
 * Sized to A4 and styled so the on-screen preview is the printed page. The
 * toolbar is marked `no-print` so it never appears in the output.
 */
export function DocumentShell({
  head,
  title,
  reference,
  meta,
  party,
  children,
  footer,
  notice,
}: {
  /** The organisation's own details, already merged with the fallbacks in
   *  src/lib/company.ts. Passed in rather than read here so the page makes one
   *  organisation query instead of the shell making a second. */
  head: Letterhead;
  title: string;
  reference: string;
  meta: { label: string; value: string }[];
  party: { heading: string; lines: string[] };
  children: ReactNode;
  footer?: ReactNode;
  /** Shown above the page and never printed. For telling whoever is about to
   *  send this that the document has a problem. */
  notice?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-[95vw] items-center justify-between gap-4 px-2">
        <a href="/dashboard" className="text-[13px] text-text-dim hover:text-text">
          ← Back to ElonHub OS
        </a>
        <PrintButton />
      </div>

      {notice && (
        <div
          role="alert"
          className="no-print mx-auto mb-4 w-[210mm] max-w-[95vw] rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
        >
          {notice}
        </div>
      )}

      <article className="document mx-auto w-[210mm] max-w-[95vw] bg-white p-[16mm] text-[#171715] shadow-sm print:w-auto print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b border-[#e2ded4] pb-6">
          <div>
            <div className="text-lg font-semibold tracking-tight">{head.name}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#6b675e]">
              {head.addressLines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              {[head.phone, head.email].filter(Boolean).length > 0 && (
                <div className="mt-1">{[head.phone, head.email].filter(Boolean).join(" · ")}</div>
              )}
              {head.registrationNumber && <div>Reg. {head.registrationNumber}</div>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold uppercase tracking-[0.08em] text-[#d0603a]">
              {title}
            </h1>
            <div className="mt-1 font-mono text-sm">{reference}</div>
          </div>
        </header>

        <section className="mt-6 flex justify-between gap-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a958a]">
              {party.heading}
            </div>
            <div className="mt-1 text-[12px] leading-relaxed">
              {party.lines.filter(Boolean).map((l, i) => (
                <div key={i} className={i === 0 ? "font-medium" : "text-[#6b675e]"}>
                  {l}
                </div>
              ))}
            </div>
          </div>
          <dl className="text-right text-[12px]">
            {meta.map((m) => (
              <div key={m.label} className="flex justify-end gap-4">
                <dt className="text-[#9a958a]">{m.label}</dt>
                <dd className="min-w-[28mm] tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-8">{children}</div>

        <footer className="mt-10 border-t border-[#e2ded4] pt-4 text-[10px] leading-relaxed text-[#6b675e]">
          {footer}
          <div className="mt-2">
            {[head.name, head.website, head.email].filter(Boolean).join(" · ")}
          </div>
        </footer>
      </article>
    </div>
  );
}

/** Line-item table shared by quotes and invoices. */
export function LineTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-[#e2ded4]">
          {columns.map((c, i) => (
            <th
              key={c}
              className={`pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a958a] ${
                i === 0 ? "text-left" : "text-right"
              }`}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r} className="border-b border-[#f0ede5]">
            {cells.map((cell, i) => (
              <td
                key={i}
                className={`py-2 align-top ${i === 0 ? "text-left" : "text-right tabular-nums"}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TotalsBlock({
  rows,
}: {
  rows: { label: string; value: string; strong?: boolean }[];
}) {
  return (
    <div className="mt-6 flex justify-end">
      <dl className="w-[70mm] text-[12px]">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex justify-between gap-4 py-1 ${
              r.strong ? "mt-1 border-t border-[#e2ded4] pt-2 text-[14px] font-semibold" : ""
            }`}
          >
            <dt className={r.strong ? "" : "text-[#6b675e]"}>{r.label}</dt>
            <dd className="tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
