"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  BookOpen,
  Users,
  FileText,
  LogOut,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/cn";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/rooms", label: "Rooms", icon: DoorOpen },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/faculty", label: "Faculty & Users", icon: Users },
  { href: "/pdf-ingestion", label: "PDF Ingestion", icon: FileText },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "sidebar-shell fixed top-0 bottom-0 z-50 flex w-[280px] flex-col transition-transform duration-300 ease-out lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-6 pb-5 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/15">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight text-white">
            Samayak
          </h1>
          <p className="text-[11px] font-medium text-white/50">Admin Panel</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border-none bg-transparent p-1 text-white lg:hidden cursor-pointer"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-auto px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Navigation
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm no-underline transition-all duration-150",
                active
                  ? "bg-white/15 font-semibold text-white"
                  : "font-normal text-white/70 hover:bg-white/8 hover:text-white",
              )}
            >
              <Icon size={18} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} className="opacity-50" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-2.5 p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15 text-sm font-bold text-white">
            {session?.user?.name?.[0]?.toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">
              {session?.user?.name || "Admin"}
            </p>
            <p className="truncate text-[11px] text-white/50">
              {((session?.user as Record<string, unknown>)?.role as string) ||
                "ADMIN"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            className="rounded-lg border-none bg-white/10 p-2 text-white/70 transition-colors hover:bg-danger/30 hover:text-white cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
