"use client";

import { navItems } from "@/components/layout/Sidebar";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface TopbarProps {
  onMenuOpen: () => void;
}

export function Topbar({ onMenuOpen }: TopbarProps) {
  const pathname = usePathname();
  const [healthy, setHealthy] = useState(true);

  const currentPage = navItems.find((item) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  });

  useEffect(() => {
    const check = () => {
      fetch("/api/health")
        .then((r) => setHealthy(r.ok))
        .catch(() => setHealthy(false));
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center border-b border-border bg-surface-1 px-6">
      <button
        type="button"
        onClick={onMenuOpen}
        className="mr-3 border-none bg-transparent p-2 text-text-secondary lg:hidden cursor-pointer"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1">
        <h2 className="text-base font-semibold text-text-primary">
          {currentPage?.label || "Dashboard"}
        </h2>
      </div>

      <div className="flex items-center gap-2 text-[13px] text-text-secondary">
        <span
          className={`h-2 w-2 rounded-full ${healthy ? "bg-success" : "bg-danger"}`}
        />
        {healthy ? "System Online" : "Degraded"}
      </div>
    </header>
  );
}
