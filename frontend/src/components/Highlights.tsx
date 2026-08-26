"use client";

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
