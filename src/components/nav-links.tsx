"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, FileText, Folder, LayoutGrid, Settings, Users } from "lucide-react";
import { cx } from "./ui";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/entries", label: "Time Entries", icon: Clock },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-wrap gap-0.5 lg:flex-col">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active ? "bg-stone-100 font-semibold text-stone-900" : "font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900",
            )}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
