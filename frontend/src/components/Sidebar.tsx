"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { currentUserEmail, currentUserRole, isAdmin, signOut } from "@/components/AuthGate";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { href: "/summary", label: "Summary", icon: "✦" },
  { href: "/executive", label: "Executive", icon: "◆" },
  { href: "/inventory", label: "Inventory", icon: "▣" },
  { href: "/ageing", label: "Recharge Ageing", icon: "◷" },
  { href: "/ageing-pivot", label: "Ageing Pivot", icon: "▤" },
  { href: "/vintage", label: "Vintage & Write-off", icon: "⌂" },
  { href: "/asset-register", label: "Asset Register", icon: "▧" },
  { href: "/partners", label: "Partners & CSP", icon: "⚑" },
  { href: "/warehouses", label: "Warehouses", icon: "▦" },
  { href: "/lost-devices", label: "Lost Devices", icon: "⚠" },
  { href: "/recon", label: "Recon (FAR vs SSOT)", icon: "⇄" },
  { href: "/inventory-matrix", label: "Inventory Matrix", icon: "▦" },
  { href: "/cohort", label: "Cohort View", icon: "◫" },
  { href: "/invoice-register", label: "Invoice Register", icon: "▤" },
  { href: "/customers", label: "Customers", icon: "◉" },
  { href: "/cx-ageing", label: "CX Ageing", icon: "◷" },
  { href: "/search", label: "Device Search", icon: "⌕" },
  { href: "/methodology", label: "Methodology", icon: "ⓘ" },
  { href: "/schema-config", label: "Schema Config", icon: "⚙", adminOnly: true },
  { href: "/users", label: "Users", icon: "◈", adminOnly: true },
  { href: "/audit-log", label: "Audit Log", icon: "▤", adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const admin = isAdmin();
  const email = currentUserEmail();
  const role = currentUserRole();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-black/30 px-4 py-6 backdrop-blur-xl">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-14 shrink-0 items-center justify-center">
          <Image src="/wiom-logo.svg" alt="Wiom" width={52} height={26} />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Asset Intelligence
          </div>
          <div className="brand-gradient-text text-sm font-bold">Recovery Platform</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !item.adminOnly || admin).map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "text-[#ff6fd8]" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#D9009D]/20 to-[#0839FB]/10 shadow-[inset_0_0_0_1px_rgba(217,0,157,0.4)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 text-xs opacity-70">{item.icon}</span>
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 px-2">
        <ThemeToggle />
        <div className="text-xs text-slate-600">live &middot; Snowflake PROD_DB</div>
        {email && (
          <div className="truncate text-xs text-slate-500" title={email}>
            {email}{" "}
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
              {role}
            </span>
          </div>
        )}
        <button
          onClick={() => {
            api.logout().catch(() => {});
            signOut();
            router.replace("/login");
          }}
          className="text-xs font-medium text-slate-500 transition-colors hover:text-[#ff6fd8]"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
