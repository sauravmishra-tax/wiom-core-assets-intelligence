"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ExecutiveKpis } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { SkeletonCard } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";
import { n, pct, Num, StatCard, HighlightTag, KeyHighlights, DeviceCostBanner, useDeviceCost, fmtCr } from "@/components/Highlights";

const HOLDER_COLORS = ["#34d399", "#38bdf8", "#f59e0b", "#a78bfa", "#64748b"];
const STATUS_COLORS: Record<string, string> = {
  DEPLOYED: "#34d399",
  RETURNED: "#38bdf8",
  IDLE: "#94a3b8",
  WRITTEN_OFF: "#f87171",
  LOST: "#ef4444",
  CUSTODIED: "#a78bfa",
  OTHER: "#64748b",
};

type SubPart = { label: string; value: number };
type Part = {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger" | "neutral";
  /** This part is itself a rollup of smaller buckets - shown as a nested
   * mini-equation right under the main row, with its own +/= check. */
  breakdown?: SubPart[];
};

function toneClass(tone: Part["tone"]): string {
  return tone === "success"
    ? "text-emerald-300"
    : tone === "warning"
      ? "text-amber-300"
      : tone === "danger"
        ? "text-rose-400"
        : "text-white";
}

/** One exhaustive breakdown of TOTAL_DEVICES: a row of parts that must sum to
 * `total`, ending in a live +/= check so the arithmetic is never something
 * you have to verify yourself by hand. Any part can carry its own nested
 * `breakdown` - e.g. "Unknown" or "Other" rolling up several tiny buckets -
 * rendered as a second, smaller equation right underneath it. */
function EquationGroup({
  title,
  note,
  parts,
  total,
}: {
  title: string;
  note: string;
  parts: Part[];
  total: number;
}) {
  const sum = parts.reduce((s, p) => s + p.value, 0);
  const matches = sum === total;
  const withBreakdown = parts.filter((p) => p.breakdown && p.breakdown.length > 0);

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            matches ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
          }`}
        >
          {matches ? "✓ adds up to total" : "✗ doesn't match total"}
        </span>
      </div>
      <p className="mb-4 text-xs text-slate-500">{note}</p>

      <div className="flex flex-wrap items-center gap-2">
        {parts.map((p, i) => (
          <div key={p.label} className="flex items-center gap-2">
            {i > 0 && <span className="text-lg text-slate-600">+</span>}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{p.label}</div>
              <div className={`text-base font-bold tabular-nums ${toneClass(p.tone)}`}>
                {p.value.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        ))}
        <span className="text-lg text-slate-600">=</span>
        <div
          className={`rounded-lg border px-3 py-2 text-center ${
            matches ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
          }`}
        >
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total devices</div>
          <div className="text-base font-bold tabular-nums text-white">
            {sum.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {withBreakdown.map((p) => {
        const subSum = p.breakdown!.reduce((s, b) => s + b.value, 0);
        const subMatches = subSum === p.value;
        return (
          <div key={p.label} className="mt-3 border-t border-white/5 pt-3 pl-3">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <span>↳ breakdown of &ldquo;{p.label}&rdquo; ({p.value.toLocaleString("en-IN")})</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                  subMatches ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                }`}
              >
                {subMatches ? "✓" : "✗"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {p.breakdown!.map((b, i) => (
                <div key={b.label} className="flex items-center gap-2">
                  {i > 0 && <span className="text-sm text-slate-600">+</span>}
                  <div className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-center">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500">{b.label}</div>
                    <div className="text-sm font-semibold tabular-nums text-slate-300">
                      {b.value.toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ExecutivePage() {
  const [data, setData] = useState<ExecutiveKpis | null>(null);
  const [dq, setDq] = useState<{
    total_rows_before_id_filter: number;
    blank_device_id_rows_excluded: number;
    note: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();
  const [deviceCost, setDeviceCost] = useDeviceCost();

  useEffect(() => {
    setData(null);
    api
      .executiveKpis(queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
    api.dataQuality().then(setDq).catch(() => {});
  }, [queryString]);

  if (error) {
    return <ErrorBanner message={error} />;
  }

  if (!data) {
    return <LoadingGrid />;
  }

  const holderData = [
    { name: "Customer", value: data.CUSTOMER_DEVICES },
    { name: "Partner", value: data.PARTNER_DEVICES },
    { name: "Returned to Wiom", value: data.RETURNED_DEVICES },
    { name: "Wiom Warehouse", value: data.WAREHOUSE_DEVICES },
    { name: "Unknown", value: data.UNKNOWN_HOLDER },
  ].filter((d) => d.value > 0);

  const statusData = [
    { name: "Deployed", key: "DEPLOYED", value: data.DEPLOYED },
    { name: "Returned", key: "RETURNED", value: data.STATUS_RETURNED },
    { name: "Idle", key: "IDLE", value: data.IDLE },
    { name: "Custodied", key: "CUSTODIED", value: data.CUSTODIED },
    { name: "Lost", key: "LOST", value: data.LOST },
    { name: "Written Off", key: "WRITTEN_OFF", value: data.WRITTEN_OFF },
    { name: "Other", key: "OTHER", value: data.OTHER_STATUS },
  ];

  const writtenOffOrLost = data.WRITTEN_OFF + data.LOST;
  const unresolvedOther =
    data.CUSTOMER_RECOVERY_PENDING + data.RETRIEVAL_PENDING + data.PENDING_CSP_RECEIPT + data.RTO_INITIATED;

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-[#ff6fd8]/10 to-transparent p-5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
            Executive Dashboard
          </div>
          <h1 className="brand-gradient-text text-2xl font-bold">Where The Entire Fleet Stands</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Live from PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL, deduplicated. Every number below
            is one of five complete, non-overlapping splits of the same {n(data.TOTAL_DEVICES)}-device
            total &mdash; see the equations further down for the full arithmetic.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ExportButton href={`/api/executive/kpis.csv${queryString}`} label="Export totals" />
          <ExportButton href={`/api/devices/export/full.csv${queryString}`} label="Export device-level (full)" />
        </div>
      </div>

      {dq && dq.blank_device_id_rows_excluded > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          <strong>{dq.blank_device_id_rows_excluded} rows</strong> with a blank/null DEVICE_ID were
          excluded from all counts (out of {dq.total_rows_before_id_filter?.toLocaleString("en-IN")}{" "}
          raw rows). These come from audit/tracking sources; a subset shared a MAC_ID with an
          already-counted device, which would have caused double-counting.
        </div>
      )}

      <DeviceCostBanner cost={deviceCost} onChange={setDeviceCost} />

      {/* Headline numbers -- label / big value / % context / comparison, never a bare number */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Devices" value={n(data.TOTAL_DEVICES)} sub="tracked end-to-end" />
        <StatCard
          label="Deployed"
          value={n(data.DEPLOYED)}
          tone="success"
          sub={`${pct(data.DEPLOYED, data.TOTAL_DEVICES)} of fleet`}
          foot="live with a customer today"
        />
        <StatCard
          label="Recharge Active"
          value={n(data.RECHARGE_ACTIVE)}
          tone="success"
          sub={`${pct(data.RECHARGE_ACTIVE, data.TOTAL_DEVICES)} of fleet`}
          foot="generating revenue"
        />
        <StatCard
          label="Stuck Capital (365+)"
          value={fmtCr(data.AGED_365_PLUS, deviceCost)}
          tone="danger"
          sub={`${n(data.AGED_365_PLUS)} devices, ${pct(data.AGED_365_PLUS, data.TOTAL_DEVICES)} of fleet`}
          foot="write-off candidate pool"
        />
        <StatCard
          label="Lost + Written Off"
          value={fmtCr(writtenOffOrLost, deviceCost)}
          tone="danger"
          sub={`${n(writtenOffOrLost)} devices, ${pct(writtenOffOrLost, data.TOTAL_DEVICES)} of fleet`}
          foot={`${n(data.LOST)} lost, ${n(data.WRITTEN_OFF)} written off`}
        />
      </div>

      <KeyHighlights
        items={[
          <>
            <Num>{n(data.TOTAL_DEVICES)}</Num> devices are tracked end-to-end, of which{" "}
            <Num tone="success">{n(data.DISPATCHED)}</Num> ({pct(data.DISPATCHED, data.TOTAL_DEVICES)})
            have been dispatched into the field at some point.
          </>,
          <>
            <Num tone="success">{n(data.CUSTOMER_DEVICES)}</Num> devices (
            {pct(data.CUSTOMER_DEVICES, data.TOTAL_DEVICES)}) sit at a customer right now, while{" "}
            <Num>{n(data.PARTNER_DEVICES)}</Num> are with a partner and{" "}
            <Num>{n(data.RETURNED_DEVICES)}</Num> have made it back to a Wiom warehouse.
          </>,
          <>
            <Num tone="success">{n(data.RECHARGE_ACTIVE)}</Num> devices (
            {pct(data.RECHARGE_ACTIVE, data.TOTAL_DEVICES)}) have an active recharge today{" "}
            <HighlightTag good />.
          </>,
          <>
            <Num tone="danger">{n(data.AGED_365_PLUS)}</Num> devices (
            {pct(data.AGED_365_PLUS, data.TOTAL_DEVICES)}) have been past recharge expiry for over a{" "}
            <strong>full year</strong>, worth <Num tone="danger">{fmtCr(data.AGED_365_PLUS, deviceCost)}</Num>{" "}
            at the device cost above &mdash; the pool least likely to ever be physically recovered{" "}
            <HighlightTag good={false} />.
          </>,
          <>
            <Num tone="danger">{n(writtenOffOrLost)}</Num> devices (
            {pct(writtenOffOrLost, data.TOTAL_DEVICES)}, worth{" "}
            <Num tone="danger">{fmtCr(writtenOffOrLost, deviceCost)}</Num>) are already lost or
            financially written off &mdash; <Num>{n(data.LOST)}</Num> lost, <Num>{n(data.WRITTEN_OFF)}</Num>{" "}
            written off.
          </>,
          <>
            <Num tone="warning">{n(unresolvedOther)}</Num> devices are actively mid-recovery (pending
            customer pickup, partner retrieval, CSP receipt, or RTO) &mdash; not stuck, but worth
            watching so they don&apos;t silently age into the 365+ bucket above.
          </>,
          data.UNKNOWN_HOLDER > 0 && (
            <>
              <Num tone="warning">{n(data.UNKNOWN_HOLDER)}</Num> devices (
              {pct(data.UNKNOWN_HOLDER, data.TOTAL_DEVICES)}) have no resolvable current holder &mdash;
              excluded from every &ldquo;current custody&rdquo; percentage above; see the breakdown in
              row 3 of the equations below.
            </>
          ),
        ].filter(Boolean)}
      />

      <div className="space-y-4">
        <EquationGroup
          title="1. Where devices came from"
          note="GRN source — every device is exactly one of these three."
          total={data.TOTAL_DEVICES}
          parts={[
            { label: "Fresh GRN", value: data.FRESH_GRN, tone: "success" },
            { label: "SSOT / CSP migration", value: data.SSOT_CSP },
            { label: "Other source", value: data.OTHER_SOURCE, tone: "neutral" },
          ]}
        />

        <EquationGroup
          title="2. Dispatch status"
          note="Has this device ever left the Wiom warehouse?"
          total={data.TOTAL_DEVICES}
          parts={[
            { label: "Never dispatched", value: data.NEVER_DISPATCHED },
            { label: "Dispatched", value: data.DISPATCHED, tone: "success" },
          ]}
        />

        <EquationGroup
          title="3. Where every device sits right now"
          note="Current holder — independent of dispatch history above (e.g. a dispatched device can have come back and be sitting at the warehouse again as 'Returned to Wiom')."
          total={data.TOTAL_DEVICES}
          parts={[
            { label: "At customer", value: data.CUSTOMER_DEVICES, tone: "success" },
            { label: "With partner", value: data.PARTNER_DEVICES },
            { label: "Returned to Wiom", value: data.RETURNED_DEVICES },
            { label: "Wiom warehouse", value: data.WAREHOUSE_DEVICES },
            {
              label: "Unknown",
              value: data.UNKNOWN_HOLDER,
              tone: data.UNKNOWN_HOLDER > 0 ? "warning" : "neutral",
              breakdown: [
                { label: "Fresh GRN", value: data.UNKNOWN_HOLDER_FRESH_GRN },
                { label: "Other source", value: data.UNKNOWN_HOLDER_OTHER_SOURCE },
                { label: "SSOT / CSP", value: data.UNKNOWN_HOLDER_SSOT_CSP },
              ],
            },
          ]}
        />

        <EquationGroup
          title="4. Current device status"
          note="Every STATUS_NORMALIZED value. 'Other' folds in Customer-recovery-pending, Retrieval-pending, Pending-CSP-receipt, RTO-initiated, In-warehouse, and Unknown-status — each individually small, so they're combined here rather than cluttering this row with six near-zero cards."
          total={data.TOTAL_DEVICES}
          parts={[
            { label: "Deployed", value: data.DEPLOYED, tone: "success" },
            { label: "Returned", value: data.STATUS_RETURNED },
            { label: "Idle", value: data.IDLE, tone: "warning" },
            { label: "Custodied", value: data.CUSTODIED, tone: "warning" },
            { label: "Lost", value: data.LOST, tone: "danger" },
            { label: "Written off", value: data.WRITTEN_OFF, tone: "danger" },
            {
              label: "Other",
              value: data.OTHER_STATUS,
              tone: "neutral",
              breakdown: [
                { label: "Unknown status", value: data.STATUS_UNKNOWN },
                { label: "Customer recovery pending", value: data.CUSTOMER_RECOVERY_PENDING },
                { label: "Retrieval pending", value: data.RETRIEVAL_PENDING },
                { label: "Pending CSP receipt", value: data.PENDING_CSP_RECEIPT },
                { label: "RTO initiated", value: data.RTO_INITIATED },
                { label: "In warehouse", value: data.STATUS_IN_WAREHOUSE },
              ],
            },
          ]}
        />

        <EquationGroup
          title="5. Recharge status"
          note="Active = recharge not yet expired. No history = never had a recharge record at all (mostly never-installed devices) - this is why Active + Expired alone looked wrong before: this third bucket was missing."
          total={data.TOTAL_DEVICES}
          parts={[
            { label: "Recharge active", value: data.RECHARGE_ACTIVE, tone: "success" },
            { label: "Recharge expired", value: data.RECHARGE_EXPIRED, tone: "warning" },
            { label: "No recharge history", value: data.NO_RECHARGE_HISTORY, tone: "neutral" },
          ]}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Informational subsets (not part of any equation above)
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          These overlap with rows above rather than adding to Total Devices - e.g. every
          365+ aged device is already counted inside "Recharge expired" in row 5.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="180+ Days Aged" value={data.AGED_180_PLUS} tone="warning" />
          <KpiCard label="365+ Days Aged" value={data.AGED_365_PLUS} tone="danger" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Where devices currently sit">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={holderData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {holderData.map((_, i) => (
                  <Cell key={i} fill={HOLDER_COLORS[i % HOLDER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg, #fff)", border: "1px solid var(--tooltip-border, #e2e8f0)", color: "var(--tooltip-text, #0f172a)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status distribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" stroke="#475569" />
              <YAxis type="category" dataKey="name" width={110} stroke="#475569" />
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg, #fff)", border: "1px solid var(--tooltip-border, #e2e8f0)", color: "var(--tooltip-text, #0f172a)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
                cursor={{ fill: "#1e293b55" }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? "#64748b"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 p-8 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
