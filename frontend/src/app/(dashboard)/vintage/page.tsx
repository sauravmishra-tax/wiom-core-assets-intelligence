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
import { api, VintageMatrix } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

const TYPE_COLORS: Record<string, string> = {
  Router: "#0839FB",
  ONT: "#D9009D",
  Unknown: "#64748b",
};

export default function VintagePage() {
  const [data, setData] = useState<VintageMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { device_type } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    const qs = device_type ? `?device_type=${encodeURIComponent(device_type)}` : "";
    api
      .vintageMatrix(qs)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [device_type]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-6 p-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl bg-white/5" />
        <div className="h-80 animate-pulse rounded-xl bg-white/5" />
      </div>
      <SkeletonTable rows={8} />
    </div>
  );

  const years = Array.from(new Set(data.rows.map((r) => r.INVOICE_YEAR))).sort((a, b) => b - a);
  const types = ["Router", "ONT"];

  const rateChartData = years.map((year) => {
    const row: Record<string, number | string> = { year: String(year) };
    for (const t of types) {
      const match = data.rows.find((r) => r.INVOICE_YEAR === year && r.DEVICE_TYPE_NORMALIZED === t);
      row[t] = match?.written_off_or_lost_rate_pct ?? 0;
    }
    return row;
  });

  const volumeChartData = years.map((year) => {
    const row: Record<string, number | string> = { year: String(year) };
    for (const t of types) {
      const match = data.rows.find((r) => r.INVOICE_YEAR === year && r.DEVICE_TYPE_NORMALIZED === t);
      row[t] = match?.TOTAL_PURCHASED ?? 0;
    }
    return row;
  });

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Purchase Vintage &amp; Write-off</h1>
          <p className="mt-1 text-sm text-slate-500">
            Purchase year = invoice_date from GRN record &middot; Router and ONT shown separately
          </p>
        </div>
        <ExportButton href="/api/vintage/writeoff-matrix.csv" />
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        <strong>Coverage note:</strong> invoice_date is only captured for{" "}
        <strong>{data.coverage.coverage_pct}%</strong> of the fleet (
        {data.coverage.with_invoice_date.toLocaleString("en-IN")} of{" "}
        {data.coverage.total_devices.toLocaleString("en-IN")}
        {" "}devices) &mdash; the rest predate this GRN detail being captured, or came through a
        source that doesn&apos;t set it. Every number below excludes that uncovered ~39%.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">
            Written-off / lost rate by purchase year
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rateChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="year" stroke="#475569" />
              <YAxis stroke="#475569" unit="%" />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
                formatter={(v) => `${v}%`}
              />
              <Legend />
              {types.map((t) => (
                <Bar key={t} dataKey={t} fill={TYPE_COLORS[t]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card rounded-xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">
            Devices purchased by year (volume)
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={volumeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="year" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Legend />
              {types.map((t) => (
                <Bar key={t} dataKey={t} fill={TYPE_COLORS[t]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two separate <table>s (header-only, body-only) - see customers/page.tsx
          for why: a frozen <thead> on one shared table measurably glitches
          under real scrolling on this app's large tables. Column alignment
          via shared <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Detail &mdash; year &times; device type</h2>
        <div style={{ minWidth: "900px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "80px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "100px" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Year</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Purchased</th>
                <th className="p-2 text-right">Written off</th>
                <th className="p-2 text-right">Lost</th>
                <th className="p-2 text-right">WO+Lost rate</th>
                <th className="p-2 text-right">Still deployed</th>
                <th className="p-2 text-right">365+ aged</th>
                <th className="p-2"></th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "80px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "100px" }} />
              </colgroup>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={`${row.INVOICE_YEAR}-${row.DEVICE_TYPE_NORMALIZED}`}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="p-2 text-slate-300">{row.INVOICE_YEAR}</td>
                    <td className="p-2">
                      <span style={{ color: TYPE_COLORS[row.DEVICE_TYPE_NORMALIZED] ?? "#94a3b8" }}>
                        {row.DEVICE_TYPE_NORMALIZED}
                      </span>
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.TOTAL_PURCHASED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.WRITTEN_OFF.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">
                      {row.LOST.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right font-semibold text-amber-300">
                      {row.written_off_or_lost_rate_pct}%
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.STILL_DEPLOYED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-400">
                      {row.AGED_365_PLUS.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right">
                      <ExportButton
                        href={`/api/devices/export/full.csv?invoice_year=${row.INVOICE_YEAR}&device_type=${row.DEVICE_TYPE_NORMALIZED}`}
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

      <div className="glass-card rounded-xl p-6">
        <h2 className="mb-3 text-sm font-semibold text-[#ff6fd8]">More cuts on this same data</h2>
        <ul className="list-inside list-disc space-y-2 text-sm leading-relaxed text-slate-300">
          <li>
            <strong>Vendor-wise</strong> (<code>vendor_number</code> inside the GRN detail) &mdash;
            which supplier&apos;s batches fail most, independent of year.
          </li>
          <li>
            <strong>Warehouse-of-origin</strong> (<code>warehouse_name</code> in the same GRN
            detail) &mdash; is failure concentrated at one intake warehouse.
          </li>
          <li>
            <strong>Time-to-failure</strong> &mdash; days between <code>invoice_date</code> and
            when STATUS flipped to LOST/WRITTEN_OFF, instead of just current-year snapshot.
          </li>
          <li>
            <strong>Model/version within a vintage year</strong> &mdash; a bad year might really be
            one bad hardware batch, not the whole year&apos;s stock.
          </li>
          <li>
            <strong>Recharge revenue vs. write-off cost</strong> &mdash; join{" "}
            <code>LAST_RECHARGE_DETAIL:totalPaid</code> to see if older cohorts are still worth
            keeping alive financially before writing off.
          </li>
        </ul>
      </div>
    </div>
  );
}
