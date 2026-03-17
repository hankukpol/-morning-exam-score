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

  // Listen for toggle events from TopModuleNav
  useEffect(() => {
    function handleToggle() {
      setOpen((prev) => !prev);
    }
    window.addEventListener("toggle-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-sidebar", handleToggle);
  }, []);

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar wrapper */}
      <div
        className={`fixed top-14 bottom-0 left-0 z-50 flex w-56 flex-col transition-transform duration-200 ease-in-out lg:static lg:top-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {children}
      </div>
    </>
  );
}
