import Link from "next/link";

export function NavLink({
  href,
  children,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-text-faint">
        {children}
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-faint">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center rounded-md px-3 py-2 text-sm text-text-dim transition-colors hover:bg-surface hover:text-text"
    >
      {children}
    </Link>
  );
}
