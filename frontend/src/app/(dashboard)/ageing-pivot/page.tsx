"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { BACKEND_ORIGIN, api, AgeingSegmentMatrix } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";
import { useSavedView } from "@/lib/useSavedView";

const BUCKET_LABELS: Record<string, string> = {
  active: "Active (not expired)",
  "0-15": "0-15 days",
  "15-30": "15-30 days",
  "30-45": "30-45 days",
  "45-60": "45-60 days",
  "60-90": "60-90 Days",
  "90-120": "90-120 Days",
  "120-180": "120-180 Days",
  "180-240": "180-240 days",
  "240-365": "240-365 days",
  "365+": "more than 365 days",
  no_recharge_history: "No recharge history",
};

const STATUS_LABELS: Record<string, string> = {
  DEPLOYED: "Deployed",
  CUSTOMER_RECOVERY_PENDING: "Recovery pending",
  LOST: "Lost",
  WRITTEN_OFF: "Written off",
  IDLE: "Idle",
  CUSTODIED: "Custodied",
  RETRIEVAL_PENDING: "Retrieval pending",
};

const SEGMENT_LABELS: Record<string, string> = {
  CSP: "CSP",
  EX_CSP: "EX CSP",
  WIOM: "WIOM",
};

function rowId(segment: string, status: string): string {
  return `${segment}::${status}`;
}

export default function AgeingPivotPage() {
  const [data, setData] = useState<AgeingSegmentMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();
  const [saveAsName, setSaveAsName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setData(null);
    api
      .ageingSegmentMatrix(queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  const allRowIds = useMemo(() => {
    if (!data) return [];
    return data.segments.flatMap((seg) => data.statuses.map((st) => rowId(seg, st)));
  }, [data]);

  const {
    visible,
    toggle,
    selectAll,
    clearAll,
    setGroup,
    saveCurrentAs,
    loadView,
    deleteView,
    savedViewNames,
    activeView,
  } = useSavedView("ageing-pivot", allRowIds);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <SkeletonTable rows={12} />
    </div>
  );

  const matrix: Record<string, Record<string, number>> = {};
  for (const row of data.detail) {
    const key = rowId(row.SEGMENT, row.STATUS_NORMALIZED);
    matrix[key] ??= {};
    matrix[key][row.AGING_BUCKET] = (matrix[key][row.AGING_BUCKET] ?? 0) + row.DEVICE_COUNT;
  }

  const visibleRowIds = data.segments.flatMap((seg) =>
    data.statuses.filter((st) => visible.has(rowId(seg, st))).map((st) => rowId(seg, st))
  );
  const pivotColTotals: Record<string, number> = {};
  let pivotGrandTotal = 0;
  for (const b of data.buckets) {
    pivotColTotals[b] = visibleRowIds.reduce((s, id) => s + (matrix[id]?.[b] ?? 0), 0);
    pivotGrandTotal += pivotColTotals[b];
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Ageing Pivot &mdash; by Segment</h1>
            <ExportButton href={`${BACKEND_ORIGIN}/api/ageing/segment-matrix.csv${queryString}`} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            WIOM = device currently at wiom_warehouse/returned_to_wiom (wins regardless of
            partner history) &middot; CSP = has a partner with a live CSP_ACCOUNT row &middot;
            EX CSP = has a partner but no matching active CSP_ACCOUNT row (churned/never
            onboarded to the CSP gateway)
          </p>
          <p className="mt-1 text-xs text-amber-300/80">
            Now exhaustive &mdash; &ldquo;Active&rdquo; and &ldquo;No recharge history&rdquo;
            columns are included, not just expired buckets. Previously these two were silently
            excluded, hiding ~60% of CSP/EX CSP devices from this table.
          </p>
        </div>
      </div>

      <div className="glass-card flex flex-wrap items-center gap-3 rounded-xl p-4">
        <span className="text-xs uppercase tracking-wide text-slate-500">View:</span>
        <select
          value={activeView === "__custom__" ? "" : activeView}
          onChange={(e) => e.target.value && loadView(e.target.value)}
          className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-slate-200"
        >
          <option value="" disabled={activeView !== "__custom__"}>
            {activeView === "__custom__" ? "Custom (unsaved)" : "Choose a saved view"}
          </option>
          <option value="__all__">All rows</option>
          {savedViewNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {activeView !== "__all__" && activeView !== "__custom__" && (
          <button
            onClick={() => deleteView(activeView)}
            className="text-xs text-rose-400 hover:text-rose-300"
          >
            Delete &ldquo;{activeView}&rdquo;
          </button>
        )}

        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          {pickerOpen ? "Close row picker" : "Pick rows..."}
        </button>

        <button
          onClick={selectAll}
          className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          Select all
        </button>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            placeholder="Save current selection as..."
            className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            onClick={() => {
              saveCurrentAs(saveAsName);
              setSaveAsName("");
            }}
            disabled={!saveAsName.trim()}
            className="rounded-md bg-gradient-to-r from-[#D9009D] to-[#0839FB] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save view
          </button>
        </div>
      </div>

      {pickerOpen && (
        <div className="glass-card space-y-4 rounded-xl p-4">
          <div className="flex items-center gap-4 border-b border-white/10 pb-3">
            <button
              onClick={selectAll}
              className="text-xs font-semibold text-[#ff6fd8] hover:text-[#ff9ee8]"
            >
              Select all
            </button>
            <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-200">
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {data.segments.map((seg) => {
              const idsInSegment = data.statuses.map((st) => rowId(seg, st));
              const allChecked = idsInSegment.every((id) => visible.has(id));
              const someChecked = idsInSegment.some((id) => visible.has(id));
              return (
                <div key={seg}>
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked;
                      }}
                      onChange={(e) => setGroup(idsInSegment, e.target.checked)}
                      className="accent-[#D9009D]"
                    />
                    {SEGMENT_LABELS[seg] ?? seg}
                  </label>
                  <div className="space-y-1 pl-6">
                    {data.statuses.map((st) => {
                      const id = rowId(seg, st);
                      return (
                        <label key={id} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={visible.has(id)}
                            onChange={() => toggle(id)}
                            className="accent-[#D9009D]"
                          />
                          {STATUS_LABELS[st] ?? st}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two separate <table>s (header-only, body-only): a frozen <thead> on
          one shared table measurably glitches under real scrolling on this
          app's large tables (a data row renders above the header). A header
          outside the scrolling element structurally can't have that bug.
          Column alignment comes from both tables sharing the same
          <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div style={{ minWidth: "1300px" }}>
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "160px" }} />
              {data.buckets.map((b) => (
                <col key={b} style={{ width: `${Math.floor(990 / data.buckets.length)}px` }} />
              ))}
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">
                  Segment
                </th>
                <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">
                  Status
                </th>
                {data.buckets.map((b) => (
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
                <col style={{ width: "110px" }} />
                <col style={{ width: "160px" }} />
                {data.buckets.map((b) => (
                  <col key={b} style={{ width: `${Math.floor(990 / data.buckets.length)}px` }} />
                ))}
                <col style={{ width: "80px" }} />
              </colgroup>
              <tbody>
                {data.segments.map((seg) => {
                  const rowsForSegment = data.statuses.filter((st) => visible.has(rowId(seg, st)));
                  if (rowsForSegment.length === 0) return null;
                  return (
                    <Fragment key={seg}>
                      <tr className="border-t border-white/10">
                        <td
                          colSpan={data.buckets.length + 3}
                          className="p-2 text-sm font-bold text-[#ff6fd8]"
                        >
                          {SEGMENT_LABELS[seg] ?? seg}
                        </td>
                      </tr>
                      {rowsForSegment.map((st) => {
                        const cells = matrix[rowId(seg, st)] ?? {};
                        const rowTotal = data.buckets.reduce((s, b) => s + (cells[b] ?? 0), 0);
                        return (
                          <tr key={rowId(seg, st)} className="border-b border-white/5">
                            <td className="p-2"></td>
                            <td className="p-2 text-slate-300">{STATUS_LABELS[st] ?? st}</td>
                            {data.buckets.map((b) => (
                              <td key={b} className="p-2 text-center text-slate-400">
                                {(cells[b] ?? 0).toLocaleString("en-IN")}
                              </td>
                            ))}
                            <td className="p-2 text-center font-semibold text-slate-200 tabular-nums">
                              {rowTotal.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {/* Column totals */}
                <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                  <td className="p-2 text-slate-300" colSpan={2}>TOTAL</td>
                  {data.buckets.map((b) => (
                    <td key={b} className="p-2 text-center tabular-nums text-slate-200">
                      {pivotColTotals[b].toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="p-2 text-center font-bold text-white tabular-nums">
                    {pivotGrandTotal.toLocaleString("en-IN")}
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
