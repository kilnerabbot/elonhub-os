export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-faint">
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl tabular-nums text-text">{value}</div>
      {hint && <div className="mt-1 text-xs text-text-faint">{hint}</div>}
    </div>
  );
}

export function StatRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
