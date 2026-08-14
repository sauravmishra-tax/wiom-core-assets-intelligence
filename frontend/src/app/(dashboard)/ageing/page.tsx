"use client";

import { useEffect, useState } from "react";
import { BACKEND_ORIGIN, api, AgeingMatrix } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

const STATUS_LABELS: Record<string, string> = {
  FINANCIAL_WO: "Financial Write-off",
  NON_FINANCIAL_WO: "Non-Financial Write-off",
};

const BUCKET_LABELS: Record<string, string> = {
  active: "Active",
  "0-15": "0-15d",
  "15-30": "15-30d",
  "30-45": "30-45d",
  "45-60": "45-60d",
  "60-90": "60-90d",
  "90-120": "90-120d",
  "120-180": "120-180d",
  "180-240": "180-240d",
  "240-365": "240-365d",
  "365+": "365+d",
  no_recharge_history: "No history",
};

function heatColor(value: number, max: number): string {
  if (value === 0)
    return "bg-slate-100 text-slate-400 dark:bg-slate-900/40 dark:text-slate-600";
  const intensity = Math.min(1, value / max);
  if (intensity < 0.15)
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (intensity < 0.35)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
  if (intensity < 0.6)
    return "bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300";
  return "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300";
}

export default function AgeingPage() {
  const [data, setData] = useState<AgeingMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    api
      .ageingMatrix(queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
        {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );

  const statuses = Array.from(new Set(data.detail.map((r) => r.STATUS_NORMALIZED))).sort();
  const matrix: Record<string, Record<string, number>> = {};
  for (const row of data.detail) {
    matrix[row.AGING_BUCKET] ??= {};
    matrix[row.AGING_BUCKET][row.STATUS_NORMALIZED] =
      (matrix[row.AGING_BUCKET][row.STATUS_NORMALIZED] ?? 0) + row.DEVICE_COUNT;
  }
  const maxCell = Math.max(
    ...data.bucket_order.flatMap((b) => statuses.map((s) => matrix[b]?.[s] ?? 0))
  );

  const rowTotals: Record<string, number> = {};
  const colTotals: Record<string, number> = {};
  let grandTotal = 0;
  for (const status of statuses) {
    rowTotals[status] = data.bucket_order.reduce((s, b) => s + (matrix[b]?.[status] ?? 0), 0);
  }
  for (const b of data.bucket_order) {
    colTotals[b] = statuses.reduce((s, st) => s + (matrix[b]?.[st] ?? 0), 0);
    grandTotal += colTotals[b];
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Recharge Ageing Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ageing = CURRENT_DATE &minus; LAST_RECHARGE_EXPIRY, computed live on every request
          </p>
        </div>
        <ExportButton href={`${BACKEND_ORIGIN}/api/ageing/matrix.csv`} />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
        {data.bucket_order.map((b) => (
          <div
            key={b}
            className="rounded-lg border glass-card p-3 text-center"
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {BUCKET_LABELS[b] ?? b}
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {(data.totals_by_bucket[b] ?? 0).toLocaleString("en-IN")}
            </div>
          </div>
        ))}
      </div>

      {/* Two separate <table>s (header-only, body-only): a frozen <thead> on
          one shared table measurably glitches under real scrolling on this
          app's large tables (a data row renders above the header). A header
          outside the scrolling element structurally can't have that bug.
          Column alignment comes from both tables sharing the same
          <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Ageing bucket &times; status
        </h2>
        <div style={{ minWidth: "900px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "160px" }} />
              {data.bucket_order.map((b) => (
                <col key={b} style={{ width: `${Math.floor(700 / data.bucket_order.length)}px` }} />
              ))}
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">
                  Status
                </th>
                {data.bucket_order.map((b) => (
                  <th
                    key={b}
                    className="p-2 text-center text-xs font-medium uppercase text-slate-500"
                  >
                    {BUCKET_LABELS[b] ?? b}
                  </th>
                ))}
                <th className="p-2 text-center text-xs font-medium uppercase text-slate-200">Total</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "160px" }} />
                {data.bucket_order.map((b) => (
                  <col key={b} style={{ width: `${Math.floor(700 / data.bucket_order.length)}px` }} />
                ))}
                <col style={{ width: "80px" }} />
              </colgroup>
              <tbody>
                {statuses.map((status) => (
                  <tr key={status}>
                    <td className="p-2 text-xs font-medium text-slate-300">{STATUS_LABELS[status] ?? status}</td>
                    {data.bucket_order.map((b) => {
                      const value = matrix[b]?.[status] ?? 0;
                      return (
                        <td key={b} className="p-1">
                          <div
                            className={`rounded px-2 py-1.5 text-center text-xs font-semibold ${heatColor(
                              value,
                              maxCell
                            )}`}
                          >
                            {value.toLocaleString("en-IN")}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center text-xs font-bold text-slate-200 tabular-nums">
                      {rowTotals[status].toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
                {/* Column totals */}
                <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                  <td className="p-2 text-xs uppercase text-slate-300">TOTAL</td>
                  {data.bucket_order.map((b) => (
                    <td key={b} className="p-2 text-center text-xs tabular-nums text-slate-200">
                      {colTotals[b].toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="p-2 text-center text-xs font-bold text-white tabular-nums">
                    {grandTotal.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
