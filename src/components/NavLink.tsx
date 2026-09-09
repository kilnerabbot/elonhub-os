"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  icon,
  disabled,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rail-dim/70"
      >
        <span className="grid size-5 place-items-center text-rail-dim/60">{icon}</span>
        <span className="flex-1">{children}</span>
        <span className="rounded bg-rail-2 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-rail-dim">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-rail-2 font-medium text-rail-text"
          : "text-rail-dim hover:bg-rail-2/60 hover:text-rail-text"
      }`}
    >
      <span className={`grid size-5 place-items-center ${active ? "text-accent" : ""}`}>
        {icon}
      </span>
      <span className="flex-1">{children}</span>
    </Link>
  );
}
