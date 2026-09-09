"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

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
