"use client";

import { useEffect, useState } from "react";
import { BACKEND_ORIGIN, authHeaders } from "@/lib/api";
import { KpiCard, SkeletonCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";

interface InvoiceRow {
  INVOICE_NUMBER: string;
  INVOICE_DATE: string;
  INVOICE_FY: string;
  DEVICE_TYPE_NORMALIZED: string;
  TOTAL_PURCHASED: number;
  TOTAL_WRITTEN_OFF: number;
  WO_FY_2022_23: number;
  WO_FY_2023_24: number;
  WO_FY_2024_25: number;
  WO_FY_2025_26: number;
  REMAINING: number;
  BLANK_INVOICE_COUNT: number;
}

interface RegisterData {
  totals: {
    total_purchased: number;
    total_written_off: number;
    total_remaining: number;
  };
  rows: InvoiceRow[];
}

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (n === 0) return "—";
  return n.toLocaleString("en-IN");
}

const WO_COLS = [
  { key: "WO_FY_2022_23", label: "WO 2022-23" },
  { key: "WO_FY_2023_24", label: "WO 2023-24" },
  { key: "WO_FY_2024_25", label: "WO 2024-25" },
  { key: "WO_FY_2025_26", label: "WO 2025-26" },
] as const;

export default function InvoiceRegisterPage() {
  const [data, setData] = useState<RegisterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fyFilter, setFyFilter] = useState("All");
  const [dtFilter, setDtFilter] = useState("All");
  const [showOnlyWo, setShowOnlyWo] = useState(false);
  const [showOnlyBlank, setShowOnlyBlank] = useState(false);

  useEffect(() => {
    fetch(`/api/invoice-register/summary`, { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<RegisterData>;
      })
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data)
    return (
      <div className="p-8 space-y-4">
        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <SkeletonCard key={i} />)}</div>
      </div>
    );

  // Unique FYs for filter
  const allFYs = ["All", ...new Set(data.rows.map((r) => r.INVOICE_FY))].filter(Boolean);

  const filtered = data.rows.filter((row) => {
    if (dtFilter !== "All" && row.DEVICE_TYPE_NORMALIZED !== dtFilter) return false;
    if (fyFilter !== "All" && row.INVOICE_FY !== fyFilter) return false;
    if (showOnlyWo && row.TOTAL_WRITTEN_OFF === 0) return false;
    if (showOnlyBlank && row.INVOICE_NUMBER !== "(blank)") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        row.INVOICE_NUMBER.toLowerCase().includes(q) ||
        (row.INVOICE_DATE ?? "").includes(q)
      );
    }
    return true;
  });

  // Filtered totals
  const filteredTotals = {
    purchased: filtered.reduce((s, r) => s + r.TOTAL_PURCHASED, 0),
    written_off: filtered.reduce((s, r) => s + r.TOTAL_WRITTEN_OFF, 0),
    remaining: filtered.reduce((s, r) => s + r.REMAINING, 0),
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoice Register</h1>
          <p className="mt-1 text-sm text-slate-400">
            Invoice-wise purchase quantity, financial write-off by FY, and remaining — since inception
          </p>
        </div>
        <ExportButton
          href={`${BACKEND_ORIGIN}/api/invoice-register/summary.csv`}
          label="Export full CSV"
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Purchased" value={data.totals.total_purchased} />
        <KpiCard label="Total Written Off" value={data.totals.total_written_off} tone="danger" />
        <KpiCard label="Remaining (not WO)" value={data.totals.total_remaining} tone="success" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice number or date…"
          className="w-72 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-500 focus:border-[#D9009D]/60 focus:outline-none"
        />
        <select
          value={fyFilter}
          onChange={(e) => setFyFilter(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 focus:border-[#D9009D]/60 focus:outline-none"
        >
          {allFYs.map((fy) => <option key={fy} value={fy}>{fy}</option>)}
        </select>
        {(["All", "Router", "ONT", "Unknown"] as const).map((dt) => (
          <button
            key={dt}
            onClick={() => setDtFilter(dt)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              dtFilter === dt
                ? "bg-[#D9009D]/30 text-[#ff6fd8] border border-[#D9009D]/50"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {dt}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showOnlyWo} onChange={(e) => setShowOnlyWo(e.target.checked)} />
          Only with WO
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={showOnlyBlank} onChange={(e) => setShowOnlyBlank(e.target.checked)} />
          Blanks only
        </label>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} invoices · {filteredTotals.purchased.toLocaleString("en-IN")} devices
        </span>
      </div>

      {/* Table */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div style={{ minWidth: "1100px" }}>
          <table className="w-full text-xs" style={{ tableLayout: "fixed", width: "1200px" }}>
            <colgroup>
              <col style={{ width: "200px" }} />
              <col style={{ width: "100px" }} />
              <col style={{ width: "85px" }} />
              <col style={{ width: "85px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "90px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
                <th className="p-2 sticky left-0 bg-slate-900/80">Invoice Number</th>
                <th className="p-2">Invoice Date</th>
                <th className="p-2">FY</th>
                <th className="p-2">Device Type</th>
                <th className="p-2 text-right">Purchased</th>
                <th className="p-2 text-right text-rose-400">Total WO</th>
                {WO_COLS.map((c) => (
                  <th key={c.key} className="p-2 text-right text-purple-400">{c.label}</th>
                ))}
                <th className="p-2 text-right text-emerald-400">Remaining</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[65vh] overflow-y-auto">
            <table className="w-full text-xs" style={{ tableLayout: "fixed", width: "1200px" }}>
              <colgroup>
                <col style={{ width: "200px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "85px" }} />
                <col style={{ width: "85px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "90px" }} />
              </colgroup>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={`${row.INVOICE_NUMBER}-${row.DEVICE_TYPE_NORMALIZED}`}
                    className={`border-b border-white/5 hover:bg-white/5 ${
                      row.INVOICE_NUMBER === "(blank)" ? "opacity-60" : ""
                    }`}
                  >
                    <td
                      className="p-2 font-mono text-slate-300 truncate sticky left-0 bg-slate-900/60"
                      title={row.INVOICE_NUMBER}
                    >
                      {row.INVOICE_NUMBER}
                    </td>
                    <td className="p-2 text-slate-500">{row.INVOICE_DATE || "—"}</td>
                    <td className="p-2 text-slate-400">{row.INVOICE_FY}</td>
                    <td className="p-2 text-slate-400">{row.DEVICE_TYPE_NORMALIZED}</td>
                    <td className="p-2 text-right tabular-nums text-slate-200 font-semibold">
                      {row.TOTAL_PURCHASED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right tabular-nums text-rose-400">
                      {fmt(row.TOTAL_WRITTEN_OFF)}
                    </td>
                    {WO_COLS.map((c) => (
                      <td key={c.key} className="p-2 text-right tabular-nums text-purple-300">
                        {fmt(row[c.key])}
                      </td>
                    ))}
                    <td className="p-2 text-right tabular-nums text-emerald-400">
                      {row.REMAINING.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
                {/* Footer totals */}
                <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                  <td className="p-2 text-slate-200 sticky left-0 bg-slate-900/80" colSpan={4}>
                    TOTAL ({filtered.length} invoices)
                  </td>
                  <td className="p-2 text-right tabular-nums text-white">
                    {filteredTotals.purchased.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right tabular-nums text-rose-300">
                    {filteredTotals.written_off.toLocaleString("en-IN")}
                  </td>
                  {WO_COLS.map((c) => (
                    <td key={c.key} className="p-2 text-right tabular-nums text-purple-300">
                      {filtered.reduce((s, r) => s + r[c.key], 0).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums text-emerald-300">
                    {filteredTotals.remaining.toLocaleString("en-IN")}
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
