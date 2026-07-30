"use client";

import { motion } from "framer-motion";

export const kpiGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const kpiItemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export function KpiCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning" | "success";
  hint?: string;
}) {
  const toneClasses: Record<string, string> = {
    default: "text-slate-100",
    danger: "text-rose-400",
    warning: "text-amber-300",
    success: "text-emerald-300",
  };

  const glowClasses: Record<string, string> = {
    default: "before:from-[#D9009D]/20 before:to-[#0839FB]/10",
    danger: "before:from-rose-500/25 before:to-fuchsia-500/10",
    warning: "before:from-amber-400/25 before:to-orange-500/10",
    success: "before:from-emerald-400/25 before:to-[#0839FB]/10",
  };

  const formatted = typeof value === "number" ? value.toLocaleString("en-IN") : value;

  return (
    <motion.div
      variants={kpiItemVariants}
      whileHover={{ y: -3 }}
      className={`glass-card relative overflow-hidden rounded-xl p-4 shadow-lg shadow-black/20 before:absolute before:inset-0 before:-z-10 before:bg-gradient-to-br ${glowClasses[tone]}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneClasses[tone]}`}>
        {formatted}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </motion.div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl border border-white/5 bg-white/5 ${className ?? "h-24"}`} />
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}
