"use client";

import { useEffect, useState } from "react";

/** Shared "Router Recovery Command Center" style presentation primitives --
 * used on Summary and Executive so every number lands with context (a %,
 * a comparison) instead of sitting bare, and headline takeaways read as a
 * short numbered narrative instead of scattered cards. */

export function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function n(value: number): string {
  return value.toLocaleString("en-IN");
}

const DEVICE_COST_KEY = "waip_device_cost_rs";
const DEFAULT_DEVICE_COST = 1500;

/** Device cost in Rs, editable and persisted per-browser (localStorage) -
 * same "editable placeholder, pending finance sign-off" pattern as the
 * Router Recovery Command Center's cost banner. Every Rs. Cr figure on
 * Summary/Executive is derived from this single number. */
export function useDeviceCost(): [number, (v: number) => void] {
  const [cost, setCostState] = useState(DEFAULT_DEVICE_COST);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DEVICE_COST_KEY);
      if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed) && parsed > 0) setCostState(parsed);
      }
    } catch {
      // localStorage unavailable - fall back to default silently
    }
  }, []);

  const setCost = (v: number) => {
    setCostState(v);
    try {
      localStorage.setItem(DEVICE_COST_KEY, String(v));
    } catch {
      // ignore
    }
  };

  return [cost, setCost];
}

/** devices * cost/device, in Rs. Crore, formatted as "Rs.X.XX Cr" */
export function fmtCr(devices: number, costPerDevice: number): string {
  const cr = (devices * costPerDevice) / 1e7;
  return `Rs.${cr.toFixed(2)} Cr`;
}

/** Sticky banner with an editable device-cost input, driving every Rs. Cr
 * figure on the page. Placeholder pending finance sign-off - same framing
 * as the reference dashboard, so nobody mistakes it for an audited number. */
export function DeviceCostBanner({
  cost,
  onChange,
}: {
  cost: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
      <span className="text-rose-600 dark:text-rose-300">⚠</span>
      <span>Device cost used in every Rs. figure below &mdash;</span>
      <span className="inline-flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300">
        Rs.
        <input
          type="number"
          min={1}
          step={50}
          value={cost}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) onChange(v);
          }}
          className="w-20 rounded border-2 border-rose-500 bg-white px-1.5 py-0.5 font-bold text-rose-700 tabular-nums outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-300 dark:bg-[#1a1020] dark:text-rose-200 dark:focus:ring-rose-800"
        />
        /device
      </span>
      <span className="text-slate-500">(editable placeholder, pending finance sign-off)</span>
    </div>
  );
}

const NUM_TONE_CLASSES: Record<string, string> = {
  default: "text-[#6f97ff]",
  danger: "text-rose-400",
  warning: "text-amber-300",
  success: "text-emerald-300",
};

export function Num({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  return <span className={`font-semibold tabular-nums ${NUM_TONE_CLASSES[tone]}`}>{children}</span>;
}

const STAT_TONE_CLASSES: Record<string, string> = {
  default: "text-white",
  danger: "text-rose-400",
  warning: "text-amber-300",
  success: "text-emerald-300",
};

/** label -> big number -> sub (what it means) -> foot (comparison/context).
 * Never a bare number - always paired with a % or a comparison right underneath it. */
export function StatCard({
  label,
  value,
  tone = "default",
  sub,
  foot,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "warning" | "success";
  sub?: string;
  foot?: string;
}) {
  return (
    <div className="glass-card rounded-xl border-l-[3px] border-l-[#ff6fd8]/40 p-4 pl-5 transition-colors hover:border-l-[#ff6fd8]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-[28px] font-extrabold leading-none tabular-nums ${STAT_TONE_CLASSES[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-slate-400">{sub}</div>}
      {foot && <div className="mt-1 text-[11px] text-slate-600">{foot}</div>}
    </div>
  );
}

export function HighlightTag({ good, label }: { good: boolean; label?: string }) {
  return (
    <span
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        good ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
      }`}
    >
      {label ?? (good ? "healthy" : "at risk")}
    </span>
  );
}

/** Numbered narrative list -- one crisp sentence per insight, bold numbers
 * inline, a good/bad tag where it helps. The "point-wise, mudde ki baat"
 * format instead of scattering every number across separate cards. */
export function KeyHighlights({ items }: { items: React.ReactNode[] }) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
        Key Highlights
      </div>
      <div className="flex flex-col gap-3.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6fd8] to-[#a855f7] text-[11px] font-bold text-white">
              {i + 1}
            </span>
            <p className="pt-0.5 text-[13.5px] leading-relaxed text-slate-300">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
