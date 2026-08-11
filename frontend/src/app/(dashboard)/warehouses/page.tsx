"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, WarehouseRow } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

export default function WarehousesPage() {
  const [data, setData] = useState<{ rows: WarehouseRow[]; total_warehouses: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    api
      .warehouseBreakdown(100, queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );

  const chartData = data.rows.slice(0, 10).map((r) => ({
    name: r.WAREHOUSE,
    Idle: r.IDLE,
    Lost: r.LOST,
    "Written Off": r.WRITTEN_OFF,
  }));

  const totals = data.rows.reduce(
    (acc, r) => ({
      TOTAL_DEVICES: acc.TOTAL_DEVICES + r.TOTAL_DEVICES,
      IDLE: acc.IDLE + r.IDLE,
      LOST: acc.LOST + r.LOST,
      WRITTEN_OFF: acc.WRITTEN_OFF + r.WRITTEN_OFF,
      AGED_365_PLUS: acc.AGED_365_PLUS + r.AGED_365_PLUS,
      CURRENTLY_IN_WIOM_CUSTODY: acc.CURRENTLY_IN_WIOM_CUSTODY + r.CURRENTLY_IN_WIOM_CUSTODY,
    }),
    {
      TOTAL_DEVICES: 0,
      IDLE: 0,
      LOST: 0,
      WRITTEN_OFF: 0,
      AGED_365_PLUS: 0,
      CURRENTLY_IN_WIOM_CUSTODY: 0,
    }
  );

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Warehouse Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.total_warehouses}{" "}
            locations (PYROPS_LOCATION) &middot; ranked by total devices passed through
          </p>
        </div>
        <ExportButton href={`/api/warehouses/breakdown.csv${queryString}`} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Warehouses" value={data.total_warehouses} />
        <KpiCard label="Total devices" value={totals.TOTAL_DEVICES} />
        <KpiCard label="Idle" value={totals.IDLE} tone="warning" />
        <KpiCard label="Lost" value={totals.LOST} tone="danger" />
        <KpiCard label="Written off" value={totals.WRITTEN_OFF} tone="danger" />
        <KpiCard label="365+ aged" value={totals.AGED_365_PLUS} />
      </div>

      <div className="glass-card rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Idle / Lost / Written-off &mdash; top 10 warehouses by volume
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" stroke="#475569" angle={-20} textAnchor="end" height={70} />
            <YAxis stroke="#475569" />
            <Tooltip contentStyle={{ background: "var(--tooltip-bg, #fff)", border: "1px solid var(--tooltip-border, #e2e8f0)", color: "var(--tooltip-text, #0f172a)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }} />
            <Legend />
            <Bar dataKey="Idle" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Lost" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Written Off" fill="#f87171" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Two separate <table>s (header-only, body-only) - see customers/page.tsx
          for why: a frozen <thead> on one shared table measurably glitches
          under real scrolling on this app's large tables. Column alignment
          via shared <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div style={{ minWidth: "900px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "180px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "170px" }} />
              <col style={{ width: "110px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Warehouse</th>
                <th className="p-2 text-right">Total devices</th>
                <th className="p-2 text-right">Idle</th>
                <th className="p-2 text-right">Lost</th>
                <th className="p-2 text-right">Written off</th>
                <th className="p-2 text-right">365+ aged</th>
                <th className="p-2 text-right">Currently in Wiom custody</th>
                <th className="p-2"></th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "180px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "110px" }} />
              </colgroup>
              <tfoot>
                <tr className="border-b-2 border-white/20 bg-white/5 font-semibold">
                  <td className="p-2 text-slate-200">Total ({data.rows.length} warehouses)</td>
                  <td className="p-2 text-right text-white">
                    {totals.TOTAL_DEVICES.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-amber-300">
                    {totals.IDLE.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-rose-400">
                    {totals.LOST.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-rose-400">
                    {totals.WRITTEN_OFF.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-slate-400">
                    {totals.AGED_365_PLUS.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300">
                    {totals.CURRENTLY_IN_WIOM_CUSTODY.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.WAREHOUSE} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2 text-slate-200">{row.WAREHOUSE}</td>
                    <td className="p-2 text-right text-slate-300">
                      {row.TOTAL_DEVICES.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {row.IDLE.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.LOST.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.WRITTEN_OFF.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-400">
                      {row.AGED_365_PLUS.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.CURRENTLY_IN_WIOM_CUSTODY.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right">
                      <ExportButton
                        href={`/api/devices/export/full.csv?warehouse=${encodeURIComponent(row.WAREHOUSE)}`}
                        label="Devices"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
