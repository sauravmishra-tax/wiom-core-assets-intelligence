"use client";

import { useEffect, useState } from "react";
import { BACKEND_ORIGIN, api, AgeingMatrix, FinancialWriteoffMatrix } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";
import { n, pct } from "@/components/Highlights";

const STATUS_LABELS: Record<string, string> = {
  FINANCIAL_WO: "Financial Write-off",
  NON_FINANCIAL_WO: "Non-Financial Write-off",
};

// FINANCIAL_WO / NON_FINANCIAL_WO rows the /matrix endpoint unions in are
// subsets of WRITTEN_OFF (already counted there) - mixing them into this
// page's main status x ageing-bucket table double-counted those devices
// and answered the wrong question. Filtered out here; the dedicated
// Financial Write-off x Write-off Year table below is the correct cut for
// "how many devices are financial-write-off AND were with this customer."
const WO_SPLIT_STATUSES = new Set(["FINANCIAL_WO", "NON_FINANCIAL_WO"]);

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

export default function CxAgeingPage() {
  const [data, setData] = useState<AgeingMatrix | null>(null);
  const [finWo, setFinWo] = useState<FinancialWriteoffMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    setFinWo(null);
    // holder_bucket=customer fixes this view to customer devices only
    const qs = queryString
      ? queryString + "&holder_bucket=customer"
      : "?holder_bucket=customer";
    api
      .ageingMatrix(qs)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
    api.financialWriteoffMatrix(qs).then(setFinWo).catch(() => {});
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

  // Revert: FINANCIAL_WO/NON_FINANCIAL_WO used to be mixed into this status
  // list - they're subsets of WRITTEN_OFF, not separate statuses, so they
  // don't belong here. See the dedicated table below instead.
  const statuses = Array.from(new Set(data.detail.map((r) => r.STATUS_NORMALIZED)))
    .filter((s) => !WO_SPLIT_STATUSES.has(s))
    .sort();
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
    // `statuses` already excludes the WO splits (see above), so this is a
    // plain sum - no double-counting risk left to guard against here.
    colTotals[b] = statuses.reduce((s, st) => s + (matrix[b]?.[st] ?? 0), 0);
    grandTotal += colTotals[b];
  }

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CX Recharge Ageing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ageing = CURRENT_DATE &minus; LAST_RECHARGE_EXPIRY — customer devices only (HOLDER_BUCKET = customer)
          </p>
        </div>
        <ExportButton href={`${BACKEND_ORIGIN}/api/ageing/matrix.csv?holder_bucket=customer`} />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-12">
        {data.bucket_order.map((b) => (
          <div key={b} className="rounded-lg border glass-card p-3 text-center">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {BUCKET_LABELS[b] ?? b}
            </div>
            <div className="mt-1 text-lg font-bold text-white">
              {(data.totals_by_bucket[b] ?? 0).toLocaleString("en-IN")}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">
          Ageing bucket &times; status — customers only
        </h2>
        <div style={{ minWidth: "900px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "200px" }} />
              {data.bucket_order.map((b) => (
                <col key={b} style={{ width: `${Math.floor(700 / data.bucket_order.length)}px` }} />
              ))}
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">Status</th>
                {data.bucket_order.map((b) => (
                  <th key={b} className="p-2 text-center text-xs font-medium uppercase text-slate-500">
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
                <col style={{ width: "200px" }} />
                {data.bucket_order.map((b) => (
                  <col key={b} style={{ width: `${Math.floor(700 / data.bucket_order.length)}px` }} />
                ))}
                <col style={{ width: "80px" }} />
              </colgroup>
              <tbody>
                {statuses.map((status) => (
                  <tr key={status}>
                    <td className="p-2 text-xs font-medium text-slate-300">
                      {STATUS_LABELS[status] ?? status}
                    </td>
                    {data.bucket_order.map((b) => {
                      const value = matrix[b]?.[status] ?? 0;
                      return (
                        <td key={b} className="p-1">
                          <div className={`rounded px-2 py-1.5 text-center text-xs font-semibold ${heatColor(value, maxCell)}`}>
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

      {finWo && (() => {
        const fMatrix: Record<string, Record<number, number>> = {};
        for (const row of finWo.detail) {
          if (row.WRITE_OFF_YEAR == null) continue;
          fMatrix[row.AGING_BUCKET] ??= {};
          fMatrix[row.AGING_BUCKET][row.WRITE_OFF_YEAR] =
            (fMatrix[row.AGING_BUCKET][row.WRITE_OFF_YEAR] ?? 0) + row.DEVICE_COUNT;
        }
        const bucketTotal = (b: string) =>
          finWo.year_order.reduce((s, y) => s + (fMatrix[b]?.[y] ?? 0), 0);
        const grand = finWo.bucket_order.reduce((s, b) => s + bucketTotal(b), 0);
        const yearTotal = (y: number) =>
          finWo.bucket_order.reduce((s, b) => s + (fMatrix[b]?.[y] ?? 0), 0);

        return (
          <div className="glass-card overflow-x-auto rounded-xl border border-rose-500/15 p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">
              Financial Write-off &mdash; Ageing &times; Write-off Year{" "}
              <span className="text-xs font-normal text-slate-500">(customer-held, separate cut)</span>
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Devices that are <strong className="text-slate-300">financial write-off</strong> (
              <code className="font-mono text-[11px]">WRITE_OFF_DATE IS NOT NULL</code>, the
              accounting-recognized loss &mdash; excludes non-financial write-off) <em>and</em> were
              installed with this customer &mdash; crossed with recharge Ageing Bucket (still computed
              live off last recharge expiry, even though the device is already written off) and the
              Write-off Year. Not part of the status table above &mdash; a dedicated population, not a
              row that adds into WRITTEN_OFF there.
            </p>
            {finWo.status_mismatch_count > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
                <strong className="text-amber-300">Why these totals won&apos;t match the WRITTEN_OFF
                row above:</strong>{" "}
                <span className="font-mono font-bold">{finWo.status_mismatch_count.toLocaleString("en-IN")}</span>{" "}
                of these financial-write-off devices still carry a <em>live</em> operational status
                (mostly still shown as DEPLOYED) &mdash; Finance recorded the write-off, but Ops never
                updated the device&apos;s status to match. That&apos;s why, e.g., the Active bucket here
                can show <em>more</em> devices than the status table&apos;s WRITTEN_OFF/Active cell: the
                two tables are measuring different things (finance records vs. operational status), not
                one being a subset of the other. Worth a Finance/Ops reconciliation pass on this list.
              </div>
            )}
            {finWo.year_order.length === 0 ? (
              <p className="text-xs text-slate-500">No financial write-off devices in this filter.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">Ageing Bucket</th>
                    {finWo.year_order.map((y) => (
                      <th key={y} className="p-2 text-right text-xs font-medium uppercase text-slate-500">
                        {y}
                      </th>
                    ))}
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-200">Total</th>
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-500">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {finWo.bucket_order
                    .filter((b) => bucketTotal(b) > 0)
                    .map((b) => (
                      <tr key={b} className="border-b border-white/5">
                        <td className="p-2 text-xs font-medium text-slate-300">{BUCKET_LABELS[b] ?? b}</td>
                        {finWo.year_order.map((y) => (
                          <td key={y} className="p-2 text-right text-xs tabular-nums text-slate-300">
                            {n(fMatrix[b]?.[y] ?? 0)}
                          </td>
                        ))}
                        <td className="p-2 text-right text-xs font-bold tabular-nums text-white">
                          {n(bucketTotal(b))}
                        </td>
                        <td className="p-2 text-right text-xs tabular-nums text-slate-500">
                          {pct(bucketTotal(b), grand)}
                        </td>
                      </tr>
                    ))}
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    <td className="p-2 text-xs uppercase text-slate-300">Total</td>
                    {finWo.year_order.map((y) => (
                      <td key={y} className="p-2 text-right text-xs tabular-nums text-slate-200">
                        {n(yearTotal(y))}
                      </td>
                    ))}
                    <td className="p-2 text-right text-xs font-bold tabular-nums text-white">{n(grand)}</td>
                    <td className="p-2 text-right text-xs tabular-nums text-slate-300">100.0%</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        );
      })()}
    </div>
  );
}
