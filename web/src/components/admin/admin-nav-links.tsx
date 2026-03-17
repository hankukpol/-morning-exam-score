"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/constants";

type Props = {
  groups: Record<string, NavItem[]>;
};

export function AdminNavLinks({ groups }: Props) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-4 py-4">
      {Object.entries(groups).map(([groupName, items]) => (
        <div key={groupName}>
          <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {groupName}
          </h3>
          <div className="space-y-1">
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center border-l-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-white/10 text-white"
                      : "border-transparent text-gray-300 hover:border-primary hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <div className="flex-1">
                    <div
                      className={
                        active
                          ? "font-semibold text-white"
                          : "text-gray-300 group-hover:text-white"
                      }
                    >
                      {item.label}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
