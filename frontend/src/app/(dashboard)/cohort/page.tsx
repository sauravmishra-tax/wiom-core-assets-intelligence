"use client";

import { useEffect, useState } from "react";
import { BACKEND_ORIGIN, authHeaders } from "@/lib/api";
import { SkeletonCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";

interface CohortRow {
  DEVICE_TYPE_NORMALIZED: string;
  PURCHASE_FY: string;
  PURCHASE_FY_SORT: number;
  WRITEOFF_FY: string;
  WRITEOFF_FY_SORT: number;
  DEVICE_COUNT: number;
}

interface CohortData {
  purchase_fys: string[];
  writeoff_fys: string[];
  rows: CohortRow[];
}

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN");
}

function pct(n: number, total: number): string {
  if (!total) return "—";
  return (n / total * 100).toFixed(1) + "%";
}

// ---- heat color for cohort cells -------------------------------------------

function cohortHeat(value: number, rowTotal: number): string {
  if (!value) return "";
  const intensity = Math.min(1, value / Math.max(rowTotal, 1));
  if (intensity < 0.05) return "bg-blue-900/30";
  if (intensity < 0.15) return "bg-blue-800/40";
  if (intensity < 0.30) return "bg-indigo-700/40";
  if (intensity < 0.50) return "bg-purple-700/40";
  if (intensity < 0.70) return "bg-rose-700/40";
  return "bg-rose-600/60";
}

export default function CohortPage() {
  const [data, setData] = useState<CohortData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"absolute" | "pct" | "cumulative">("absolute");
  const [deviceType, setDeviceType] = useState<string>("All");

  useEffect(() => {
    fetch(`/api/cohort/matrix`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) { window.location.href = "/login"; return null; }
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<CohortData>;
      })
      .then((d) => { if (d) setData(d); })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data)
    return (
      <div className="p-8 space-y-4">
        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div>
      </div>
    );

  const filteredRows =
    deviceType === "All" ? data.rows : data.rows.filter((r) => r.DEVICE_TYPE_NORMALIZED === deviceType);

  // Build matrix: purchaseFy → writeoffFy → count
  const matrix = new Map<string, Map<string, number>>();
  const rowTotals = new Map<string, number>();
  const colTotals = new Map<string, number>();
  let grand = 0;

  for (const row of filteredRows) {
    if (!matrix.has(row.PURCHASE_FY)) matrix.set(row.PURCHASE_FY, new Map());
    const pfyMap = matrix.get(row.PURCHASE_FY)!;
    pfyMap.set(row.WRITEOFF_FY, (pfyMap.get(row.WRITEOFF_FY) ?? 0) + row.DEVICE_COUNT);
    rowTotals.set(row.PURCHASE_FY, (rowTotals.get(row.PURCHASE_FY) ?? 0) + row.DEVICE_COUNT);
    colTotals.set(row.WRITEOFF_FY, (colTotals.get(row.WRITEOFF_FY) ?? 0) + row.DEVICE_COUNT);
    grand += row.DEVICE_COUNT;
  }

  // Compute cumulative — for each purchase FY, cumulative write-offs over time
  const cumulativeMatrix = new Map<string, Map<string, number>>();
  for (const pFy of data.purchase_fys) {
    cumulativeMatrix.set(pFy, new Map());
    let cum = 0;
    for (const wFy of data.writeoff_fys) {
      if (wFy === "Not WO") continue;
      cum += matrix.get(pFy)?.get(wFy) ?? 0;
      cumulativeMatrix.get(pFy)!.set(wFy, cum);
    }
  }

  const woFys = data.writeoff_fys.filter((f) => f !== "Not WO");

  function cellValue(pFy: string, wFy: string): number {
    if (viewMode === "cumulative") {
      return cumulativeMatrix.get(pFy)?.get(wFy) ?? 0;
    }
    return matrix.get(pFy)?.get(wFy) ?? 0;
  }

  function cellDisplay(pFy: string, wFy: string): string {
    const v = cellValue(pFy, wFy);
    if (!v) return "—";
    if (viewMode === "pct") return pct(v, rowTotals.get(pFy) ?? 0);
    return fmt(v);
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Cohort View</h1>
          <p className="mt-1 text-sm text-slate-400">
            Purchase FY (rows) × Financial Write-off FY (columns) — see what % of each vintage was written off in each year
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["All", "Router", "ONT", "Unknown"] as const).map((dt) => (
            <button
              key={dt}
              onClick={() => setDeviceType(dt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                deviceType === dt
                  ? "bg-[#D9009D]/30 text-[#ff6fd8] border border-[#D9009D]/50"
                  : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {dt}
            </button>
          ))}
          <div className="ml-2 flex rounded-lg border border-white/10 overflow-hidden">
            {(["absolute", "pct", "cumulative"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === m ? "bg-[#D9009D]/30 text-[#ff6fd8]" : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {m === "absolute" && "Count"}
                {m === "pct" && "% of Row"}
                {m === "cumulative" && "Cumulative"}
              </button>
            ))}
          </div>
          <ExportButton
            href={`${BACKEND_ORIGIN}/api/cohort/matrix.csv`}
            label="Export CSV"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>Heat = write-off concentration per row</span>
        <span>·</span>
        <span>
          <span className="inline-block w-3 h-3 rounded bg-blue-900/50 mr-1" />low
        </span>
        <span>
          <span className="inline-block w-3 h-3 rounded bg-purple-700/50 mr-1" />medium
        </span>
        <span>
          <span className="inline-block w-3 h-3 rounded bg-rose-600/70 mr-1" />high
        </span>
      </div>

      {/* Cohort matrix */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div style={{ minWidth: `${Math.max(900, 130 + woFys.length * 90)}px` }}>
          <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
                <th className="p-2 sticky left-0 bg-slate-900/80 w-28">Purchase FY</th>
                <th className="p-2 text-right w-20">Purchased</th>
                {woFys.map((wFy) => (
                  <th key={wFy} className="p-2 text-right text-purple-400">
                    WO {wFy}
                  </th>
                ))}
                <th className="p-2 text-right text-slate-400">Not WO</th>
                <th className="p-2 text-right font-bold text-slate-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.purchase_fys.map((pFy) => {
                const purchased = rowTotals.get(pFy) ?? 0;
                const notWo = matrix.get(pFy)?.get("Not WO") ?? 0;
                if (!purchased) return null;
                return (
                  <tr key={pFy} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2 font-semibold text-slate-200 sticky left-0 bg-slate-900/60 w-28">
                      {pFy}
                    </td>
                    <td className="p-2 text-right tabular-nums text-slate-300">{fmt(purchased)}</td>
                    {woFys.map((wFy) => {
                      const v = cellValue(pFy, wFy);
                      const heat = cohortHeat(matrix.get(pFy)?.get(wFy) ?? 0, purchased);
                      return (
                        <td
                          key={wFy}
                          className={`p-2 text-right tabular-nums text-slate-200 rounded ${heat}`}
                          title={`${pFy} → WO ${wFy}: ${fmt(matrix.get(pFy)?.get(wFy) ?? 0)} (${pct(matrix.get(pFy)?.get(wFy) ?? 0, purchased)})`}
                        >
                          {cellDisplay(pFy, wFy) || "—"}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums text-slate-400">{fmt(notWo)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold text-slate-200">{fmt(purchased)}</td>
                  </tr>
                );
              })}

              {/* Column totals */}
              <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                <td className="p-2 text-slate-300 sticky left-0 bg-slate-900/80">TOTAL</td>
                <td className="p-2 text-right text-white tabular-nums">{fmt(grand)}</td>
                {woFys.map((wFy) => (
                  <td key={wFy} className="p-2 text-right tabular-nums text-purple-300">
                    {viewMode === "pct"
                      ? pct(colTotals.get(wFy) ?? 0, grand)
                      : fmt(colTotals.get(wFy))}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums text-slate-400">
                  {fmt(colTotals.get("Not WO"))}
                </td>
                <td className="p-2 text-right text-white tabular-nums">{fmt(grand)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Purchased", value: grand },
          { label: "Total Written Off", value: grand - (colTotals.get("Not WO") ?? 0) },
          { label: "Not Written Off", value: colTotals.get("Not WO") ?? 0 },
          {
            label: "Overall WO Rate",
            value: `${pct(grand - (colTotals.get("Not WO") ?? 0), grand)}`,
          },
        ].map(({ label, value }) => (
          <div key={label} className="glass-card rounded-xl p-4">
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <div className="mt-1 text-xl font-bold text-white tabular-nums">
              {typeof value === "number" ? fmt(value) : value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
