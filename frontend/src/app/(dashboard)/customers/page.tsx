"use client";

import { useEffect, useState } from "react";
import { api, CustomerKpis, CustomerRow } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

const COLS: Array<{ width: string; align?: "right" }> = [
  { width: "200px" },
  { width: "110px", align: "right" },
  { width: "110px", align: "right" },
  { width: "110px", align: "right" },
  { width: "110px", align: "right" },
  { width: "110px", align: "right" },
  { width: "110px", align: "right" },
  { width: "130px", align: "right" },
  { width: "130px", align: "right" },
  { width: "110px" },
];

function Colgroup() {
  return (
    <colgroup>
      {COLS.map((c, i) => (
        <col key={i} style={{ width: c.width }} />
      ))}
    </colgroup>
  );
}

export default function CustomersPage() {
  const [data, setData] = useState<{ kpis: CustomerKpis; leaderboard: { rows: CustomerRow[]; total_customers: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    api
      .customerSummary(5000, queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={10} />
    </div>
  );

  const { kpis, leaderboard } = data;

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Devices at active customer accounts &mdash; showing {leaderboard.rows.length.toLocaleString("en-IN")} of {leaderboard.total_customers.toLocaleString("en-IN")} customers
          </p>
        </div>
        <ExportButton href={`/api/customers/leaderboard.csv${queryString}`} />
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        Customer <strong>names</strong> aren&apos;t in this table, only account IDs &mdash; same
        as partner page, Phase 2 join item.
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="Total devices" value={kpis.total_customer_devices} />
        <KpiCard label="Deployed" value={kpis.deployed} tone="success" />
        <KpiCard label="Installed" value={kpis.installed} tone="success" />
        <KpiCard label="Lost" value={kpis.lost} tone="danger" />
        <KpiCard label="Written off" value={kpis.written_off} tone="danger" />
        <KpiCard label="Idle" value={kpis.idle} tone="warning" />
        <KpiCard label="Recharge Active" value={kpis.recharge_active} tone="success" />
        <KpiCard label="Recharge Expired" value={kpis.recharge_expired} tone="warning" />
      </div>

      {/* Two separate <table>s (header-only, body-only) instead of one table
          with a sticky/frozen <thead>: native position:sticky (and even a
          manual scroll-linked transform) measurably glitches on this app's
          real tables under real scrolling - a data row visibly renders above
          the header. A header that is structurally outside the scrolling
          element can't have that bug; column alignment is kept by giving
          both tables the same <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div style={{ minWidth: "1100px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <Colgroup />
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Customer Account ID</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Deployed</th>
                <th className="p-2 text-right">Installed</th>
                <th className="p-2 text-right">Lost</th>
                <th className="p-2 text-right">Written Off</th>
                <th className="p-2 text-right">Idle</th>
                <th className="p-2 text-right">Recharge Active</th>
                <th className="p-2 text-right">Recharge Expired</th>
                <th className="p-2">Export</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <Colgroup />
              <tbody>
                {leaderboard.rows.map((row) => (
                  <tr
                    key={row.CUSTOMER_ACCOUNT_ID}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="p-2 font-mono text-xs text-slate-300">
                      {row.CUSTOMER_ACCOUNT_ID.replace(/\.0+$/, "")}
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.TOTAL_DEVICES.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.DEPLOYED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.INSTALLED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.LOST.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.WRITTEN_OFF.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {row.IDLE.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.RECHARGE_ACTIVE.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {row.RECHARGE_EXPIRED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right">
                      <ExportButton
                        href={`/api/devices/export/full.csv?customer_account_id=${encodeURIComponent(row.CUSTOMER_ACCOUNT_ID.replace(/\.0+$/, ""))}`}
                        label="Devices"
                      />
                    </td>
                  </tr>
                ))}
                {/* Column totals */}
                <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                  <td className="p-2 text-slate-200">
                    TOTAL ({leaderboard.total_customers.toLocaleString("en-IN")} customers)
                  </td>
                  <td className="p-2 text-right text-white tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.TOTAL_DEVICES, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.DEPLOYED, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.INSTALLED, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-rose-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.LOST, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-rose-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.WRITTEN_OFF, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-amber-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.IDLE, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.RECHARGE_ACTIVE, 0).toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-amber-300 tabular-nums">
                    {leaderboard.rows.reduce((s, r) => s + r.RECHARGE_EXPIRED, 0).toLocaleString("en-IN")}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
