"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type Props = { children: React.ReactNode };

export function MobileNavWrapper({ children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close nav on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center justify-between border-b border-white/10 bg-[#0B1120] px-4 lg:hidden">
        <span className="text-sm font-bold text-white">Morning Mock</span>
        <button
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 items-center justify-center text-gray-300 hover:text-white"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        >
          {open ? (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar wrapper */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex min-h-screen w-[260px] flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {children}
      </div>
    </>
  );
}
