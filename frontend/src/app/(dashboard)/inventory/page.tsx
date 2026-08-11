"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
import { api, InventoryBreakdown } from "@/lib/api";
import { KpiCard, kpiGridVariants, SkeletonCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { useGlobalFilters } from "@/components/GlobalFilters";

const SOURCE_LABELS: Record<string, string> = {
  fresh_grn: "Fresh GRN",
  ssot_csp: "SSOT & CSP",
  other: "Other",
};

const DISPATCH_LABELS: Record<string, string> = {
  never_dispatched: "Never dispatched (in warehouse)",
  dispatched: "Dispatched",
};

export default function InventoryPage() {
  const [data, setData] = useState<InventoryBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    api
      .inventoryBreakdown(queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-white/5" />
    </div>
  );

  const dispatchTotals: Record<string, number> = {};
  for (const row of data.detail) {
    dispatchTotals[row.DISPATCH_BUCKET] = (dispatchTotals[row.DISPATCH_BUCKET] ?? 0) + row.DEVICE_COUNT;
  }

  // Source x dispatch (not source x holder, which Executive already covers
  // via its "where every device sits" equation group) - the distinct angle
  // this page owns is intake: how much of each source's stock has actually
  // moved out of the warehouse yet.
  const sourceDispatchMatrix: Record<string, Record<string, number>> = {};
  for (const row of data.detail) {
    sourceDispatchMatrix[row.GRN_SOURCE_BUCKET] ??= {};
    sourceDispatchMatrix[row.GRN_SOURCE_BUCKET][row.DISPATCH_BUCKET] =
      (sourceDispatchMatrix[row.GRN_SOURCE_BUCKET][row.DISPATCH_BUCKET] ?? 0) + row.DEVICE_COUNT;
  }

  const dispatchStates = Object.keys(DISPATCH_LABELS);
  const chartData = Object.entries(sourceDispatchMatrix).map(([source, dispatchCounts]) => ({
    source: SOURCE_LABELS[source] ?? source,
    ...dispatchCounts,
  }));

  const dispatchColors: Record<string, string> = {
    never_dispatched: "#38bdf8",
    dispatched: "#34d399",
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory &amp; Stock Intake</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fresh GRN / SSOT &amp; CSP / Other, deduplicated by MAC against PNM-prefixed records
            &mdash; focused on where new stock comes from and how much of it has moved out of the
            warehouse. For current custody (customer/partner/warehouse) see Executive; for
            per-location detail see Warehouses.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton href="/api/inventory/breakdown.csv" label="Export summary" />
          <ExportButton href="/api/inventory/new-grn.csv" label="Export fresh GRN (full)" />
        </div>
      </div>

      <motion.div
        variants={kpiGridVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3"
      >
        {Object.entries(data.by_source).map(([source, count]) => (
          <KpiCard key={source} label={SOURCE_LABELS[source] ?? source} value={count} />
        ))}
        {dispatchStates.map((d) => (
          <KpiCard key={d} label={DISPATCH_LABELS[d]} value={dispatchTotals[d] ?? 0} />
        ))}
      </motion.div>

      <div className="glass-card rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Source &times; dispatch status &mdash; how much of each source has left the warehouse
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="source" stroke="#475569" />
            <YAxis stroke="#475569" />
            <Tooltip contentStyle={{ background: "var(--tooltip-bg, #fff)", border: "1px solid var(--tooltip-border, #e2e8f0)", color: "var(--tooltip-text, #0f172a)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }} />
            <Legend />
            {dispatchStates.map((d) => (
              <Bar key={d} dataKey={d} stackId="a" name={DISPATCH_LABELS[d]} fill={dispatchColors[d]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
