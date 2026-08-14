"use client";

import { useEffect, useState } from "react";
import { BACKEND_ORIGIN, authHeaders } from "@/lib/api";
import { KpiCard, SkeletonCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";

// ---- types ----------------------------------------------------------------

interface StatusRow {
  SEGMENT: string;
  PARTNER_SUB?: string | null;
  DEVICE_TYPE_NORMALIZED: string;
  STATUS_NORMALIZED: string;
  DEVICE_COUNT: number;
}

interface OverlapRow {
  SEGMENT: string;
  PARTNER_SUB?: string | null;
  DEVICE_TYPE_NORMALIZED: string;
  TOTAL: number;
  FINANCIAL_WO: number;
  OPS_WO: number;
  LOST: number;
  FIN_AND_OPS_WO: number;
  FIN_AND_LOST: number;
  FIN_WO_AND_ANY_OPS_FLAG: number;
  OPS_WO_ONLY_NO_FIN: number;
  LOST_ONLY_NO_FIN: number;
}

interface AgeingRow {
  SEGMENT: string;
  DEVICE_TYPE_NORMALIZED: string;
  AGING_BUCKET: string;
  DEVICE_COUNT: number;
}

interface InvoiceFyRow {
  SEGMENT: string;
  DEVICE_TYPE_NORMALIZED: string;
  INVOICE_FY: string;
  INVOICE_FY_SORT: number;
  DEVICE_COUNT: number;
}

const SEGMENTS = ["WIOM", "CSP", "Ex-CSP"] as const;
const DEVICE_TYPES = ["Router", "ONT", "Unknown"] as const;
const AGING_ORDER = [
  "active", "0-15", "15-30", "30-45", "45-60",
  "60-90", "90-120", "120-180", "180-240", "240-365", "365+", "no_recharge_history",
];

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("401"); }
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json();
}

function fmt(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN");
}

// ---- Pivot helpers ---------------------------------------------------------

function pivotStatus(rows: StatusRow[]) {
  const allStatuses = [...new Set(rows.map((r) => r.STATUS_NORMALIZED))].sort();
  type Key = `${string}|${string}`;
  const map = new Map<Key, Map<string, number>>();
  const totals = { seg: new Map<string, number>(), overall: 0 };

  for (const r of rows) {
    const key: Key = `${r.SEGMENT}|${r.DEVICE_TYPE_NORMALIZED}`;
    if (!map.has(key)) map.set(key, new Map());
    map.get(key)!.set(r.STATUS_NORMALIZED, r.DEVICE_COUNT);
    totals.seg.set(
      r.SEGMENT,
      (totals.seg.get(r.SEGMENT) ?? 0) + r.DEVICE_COUNT
    );
    totals.overall += r.DEVICE_COUNT;
  }
  return { map, allStatuses, totals };
}

// ---- Main component -------------------------------------------------------

export default function InventoryMatrixPage() {
  const [tab, setTab] = useState<"status" | "writeoff" | "ageing" | "invoicefy">("status");
  const [statusData, setStatusData] = useState<StatusRow[] | null>(null);
  const [overlapData, setOverlapData] = useState<OverlapRow[] | null>(null);
  const [ageingData, setAgeingData] = useState<AgeingRow[] | null>(null);
  const [invoiceFyData, setInvoiceFyData] = useState<InvoiceFyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>("All");
  const [showSub, setShowSub] = useState(false);

  useEffect(() => {
    fetchJson<{ rows: StatusRow[] }>(`/api/inventory-matrix/status${showSub ? "?sub=true" : ""}`)
      .then((d) => setStatusData(d.rows))
      .catch((e) => setError(String(e.message)));
    fetchJson<{ rows: OverlapRow[] }>("/api/inventory-matrix/writeoff-overlap")
      .then((d) => setOverlapData(d.rows))
      .catch((e) => setError(String(e.message)));
    fetchJson<{ rows: AgeingRow[] }>("/api/inventory-matrix/ageing")
      .then((d) => setAgeingData(d.rows))
      .catch((e) => setError(String(e.message)));
    fetchJson<{ rows: InvoiceFyRow[] }>("/api/inventory-matrix/invoice-fy")
      .then((d) => setInvoiceFyData(d.rows))
      .catch((e) => setError(String(e.message)));
  }, [showSub]);

  const loading = !statusData || !overlapData || !ageingData || !invoiceFyData;

  const filterRows = <T extends { DEVICE_TYPE_NORMALIZED: string }>(rows: T[]) =>
    deviceTypeFilter === "All" ? rows : rows.filter((r) => r.DEVICE_TYPE_NORMALIZED === deviceTypeFilter);

  // ---- KPI totals from status ----
  const totalBySegment = statusData
    ? SEGMENTS.map((seg) => ({
        seg,
        count: filterRows(statusData)
          .filter((r) => r.SEGMENT === seg)
          .reduce((s, r) => s + r.DEVICE_COUNT, 0),
      }))
    : [];

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Matrix</h1>
          <p className="mt-1 text-sm text-slate-400">
            WIOM / CSP / Ex-CSP × Router / ONT — status, write-off, ageing, invoice FY
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSub((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
              showSub
                ? "bg-[#D9009D]/30 text-[#ff6fd8] border-[#D9009D]/50"
                : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
            }`}
          >
            {showSub ? "▸ Hide sub-breakdown" : "▸ CSP / Ex-CSP by Partner ID"}
          </button>
          {(["All", "Router", "ONT", "Unknown"] as const).map((dt) => (
            <button
              key={dt}
              onClick={() => setDeviceTypeFilter(dt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                deviceTypeFilter === dt
                  ? "bg-[#D9009D]/30 text-[#ff6fd8] border border-[#D9009D]/50"
                  : "bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {dt}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* KPI cards */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {totalBySegment.map(({ seg, count }) => (
            <KpiCard key={seg} label={seg} value={count} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {(["status", "writeoff", "ageing", "invoicefy"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t
                ? "bg-white/10 text-white border-b-2 border-[#D9009D]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "status" && "Status Matrix"}
            {t === "writeoff" && "Write-off Overlap"}
            {t === "ageing" && "Ageing Cut"}
            {t === "invoicefy" && "Invoice FY"}
          </button>
        ))}
      </div>

      {/* ---- STATUS MATRIX ---- */}
      {tab === "status" && statusData && (
        <StatusMatrix rows={filterRows(statusData)} showSub={showSub} />
      )}

      {/* ---- WRITE-OFF OVERLAP ---- */}
      {tab === "writeoff" && overlapData && (
        <WriteoffOverlap
          rows={filterRows(overlapData)}
          exportHref={`${BACKEND_ORIGIN}/api/inventory-matrix/writeoff-overlap.csv`}
        />
      )}

      {/* ---- AGEING CUT ---- */}
      {tab === "ageing" && ageingData && (
        <AgeingMatrix rows={filterRows(ageingData)} />
      )}

      {/* ---- INVOICE FY ---- */}
      {tab === "invoicefy" && invoiceFyData && (
        <InvoiceFyMatrix rows={filterRows(invoiceFyData)} />
      )}
    </div>
  );
}

// ---- STATUS MATRIX COMPONENT -----------------------------------------------

function StatusMatrix({ rows, showSub }: { rows: StatusRow[]; showSub: boolean }) {
  const { allStatuses } = pivotStatus(rows);

  // Build: segment → subKey → deviceType → status → count
  // subKey = PARTNER_SUB when showSub, else DEVICE_TYPE_NORMALIZED directly under segment
  const data: Record<string, Record<string, Record<string, Record<string, number>>>> = {};
  const segTotals: Record<string, number> = {};
  let grand = 0;

  for (const row of rows) {
    const subKey = showSub && row.PARTNER_SUB ? row.PARTNER_SUB : "__agg__";
    data[row.SEGMENT] ??= {};
    data[row.SEGMENT][subKey] ??= {};
    data[row.SEGMENT][subKey][row.DEVICE_TYPE_NORMALIZED] ??= {};
    data[row.SEGMENT][subKey][row.DEVICE_TYPE_NORMALIZED][row.STATUS_NORMALIZED] =
      (data[row.SEGMENT][subKey][row.DEVICE_TYPE_NORMALIZED][row.STATUS_NORMALIZED] ?? 0) + row.DEVICE_COUNT;
    segTotals[row.SEGMENT] = (segTotals[row.SEGMENT] ?? 0) + row.DEVICE_COUNT;
    grand += row.DEVICE_COUNT;
  }

  // Back-compat for non-sub path: collapse subKey dimension
  const dtTotals: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    dtTotals[row.SEGMENT] ??= {};
    const sk = showSub && row.PARTNER_SUB ? row.PARTNER_SUB : "__agg__";
    const key = `${sk}::${row.DEVICE_TYPE_NORMALIZED}`;
    dtTotals[row.SEGMENT][key] = (dtTotals[row.SEGMENT][key] ?? 0) + row.DEVICE_COUNT;
  }

  const statusColors: Record<string, string> = {
    DEPLOYED: "text-emerald-400",
    LOST: "text-rose-400",
    WRITTEN_OFF: "text-rose-300",
    RETURNED: "text-blue-400",
    CUSTOMER_RECOVERY_PENDING: "text-amber-400",
    PENDING_CSP_RECEIPT: "text-amber-300",
    UNKNOWN: "text-slate-500",
  };

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-300">
        Status Matrix — SEGMENT × Device Type × Status (vertical + horizontal totals)
      </h2>
      <div style={{ minWidth: "900px" }}>
        <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
              <th className="p-2 sticky left-0 bg-slate-900/80">Segment</th>
              {showSub && <th className="p-2 text-[10px]">Partner ID</th>}
              <th className="p-2">Device Type</th>
              {allStatuses.map((s) => (
                <th key={s} className={`p-2 text-right ${statusColors[s] ?? "text-slate-400"}`}>
                  {s.replace(/_/g, " ")}
                </th>
              ))}
              <th className="p-2 text-right text-slate-400 font-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((seg) => {
              if (!data[seg]) return null;
              const subKeys = Object.keys(data[seg]).sort();
              const totalColspan = showSub ? 3 : 2;

              return subKeys.flatMap((subKey, subIdx) => {
                const dtKeys = Object.keys(data[seg][subKey]);
                const isPartnerSub = subKey !== "__agg__";
                return dtKeys.map((dt, dtIdx) => {
                  const rowKey = `${seg}-${subKey}-${dt}`;
                  const dtCount = dtTotals[seg][`${subKey}::${dt}`] ?? 0;
                  return (
                    <tr key={rowKey} className={`border-b border-white/5 hover:bg-white/5 ${isPartnerSub ? "bg-white/[0.02]" : ""}`}>
                      {/* Segment cell — spans all sub + dt rows */}
                      {subIdx === 0 && dtIdx === 0 && (
                        <td
                          className="p-2 font-bold text-slate-200 sticky left-0 bg-slate-900/60 align-top"
                          rowSpan={subKeys.reduce((s, k) => s + Object.keys(data[seg][k]).length, 0)}
                        >
                          {seg}
                          <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                            {fmt(segTotals[seg])}
                          </div>
                        </td>
                      )}
                      {/* Partner sub cell */}
                      {showSub && dtIdx === 0 && (
                        <td
                          className="p-2 text-[10px] font-mono text-slate-500 align-top"
                          rowSpan={dtKeys.length}
                          title={isPartnerSub ? subKey : undefined}
                        >
                          {isPartnerSub ? subKey : "—"}
                        </td>
                      )}
                      <td className="p-2 text-slate-400">{dt}</td>
                      {allStatuses.map((s) => (
                        <td key={s} className={`p-2 text-right tabular-nums ${statusColors[s] ?? "text-slate-400"}`}>
                          {fmt(data[seg][subKey][dt][s])}
                        </td>
                      ))}
                      <td className="p-2 text-right font-semibold text-slate-200 tabular-nums">
                        {fmt(dtCount)}
                      </td>
                    </tr>
                  );
                });
              });
            })}
            {/* Grand total row */}
            <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
              <td className="p-2 text-slate-300 sticky left-0 bg-slate-900/80" colSpan={showSub ? 3 : 2}>
                GRAND TOTAL
              </td>
              {allStatuses.map((s) => {
                const total = rows
                  .filter((r) => r.STATUS_NORMALIZED === s)
                  .reduce((a, b) => a + b.DEVICE_COUNT, 0);
                return (
                  <td key={s} className={`p-2 text-right tabular-nums ${statusColors[s] ?? "text-slate-400"}`}>
                    {fmt(total)}
                  </td>
                );
              })}
              <td className="p-2 text-right text-white tabular-nums">{fmt(grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- WRITE-OFF OVERLAP COMPONENT -------------------------------------------

function WriteoffOverlap({ rows, exportHref }: { rows: OverlapRow[]; exportHref: string }) {
  // Aggregate by segment (sum across device types)
  const bySegment: Record<string, OverlapRow> = {};
  for (const row of rows) {
    if (!bySegment[row.SEGMENT]) {
      bySegment[row.SEGMENT] = { ...row };
    } else {
      const s = bySegment[row.SEGMENT];
      s.TOTAL += row.TOTAL;
      s.FINANCIAL_WO += row.FINANCIAL_WO;
      s.OPS_WO += row.OPS_WO;
      s.LOST += row.LOST;
      s.FIN_AND_OPS_WO += row.FIN_AND_OPS_WO;
      s.FIN_AND_LOST += row.FIN_AND_LOST;
      s.FIN_WO_AND_ANY_OPS_FLAG += row.FIN_WO_AND_ANY_OPS_FLAG;
      s.OPS_WO_ONLY_NO_FIN += row.OPS_WO_ONLY_NO_FIN;
      s.LOST_ONLY_NO_FIN += row.LOST_ONLY_NO_FIN;
    }
  }

  const cols = [
    { key: "TOTAL", label: "Total Devices", color: "text-slate-200" },
    { key: "FINANCIAL_WO", label: "Financial WO", color: "text-purple-400" },
    { key: "OPS_WO", label: "Ops WO", color: "text-orange-400" },
    { key: "LOST", label: "Lost", color: "text-rose-400" },
    { key: "FIN_AND_OPS_WO", label: "Fin ∩ Ops WO", color: "text-amber-400" },
    { key: "FIN_AND_LOST", label: "Fin WO ∩ Lost", color: "text-red-400" },
    { key: "FIN_WO_AND_ANY_OPS_FLAG", label: "Fin WO ∩ (Ops WO or Lost)", color: "text-red-300" },
    { key: "OPS_WO_ONLY_NO_FIN", label: "Ops WO only (no Fin WO)", color: "text-slate-400" },
    { key: "LOST_ONLY_NO_FIN", label: "Lost only (no Fin WO)", color: "text-slate-400" },
  ] as const;

  // Device type rows within each segment
  const dtBySegment: Record<string, OverlapRow[]> = {};
  for (const row of rows) {
    dtBySegment[row.SEGMENT] ??= [];
    dtBySegment[row.SEGMENT].push(row);
  }

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">
          Write-off Overlap — Financial WO | Ops WO | Lost | Intersections
        </h2>
        <ExportButton href={exportHref} label="Export CSV" />
      </div>
      <div style={{ minWidth: "1100px" }}>
        <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
              <th className="p-2 sticky left-0 bg-slate-900/80">Segment</th>
              <th className="p-2">Device Type</th>
              {cols.map((c) => (
                <th key={c.key} className={`p-2 text-right ${c.color}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((seg) => {
              const segRow = bySegment[seg];
              const dtRows = dtBySegment[seg] ?? [];
              if (!segRow) return null;
              return (
                <>
                  {dtRows.map((row, dtIdx) => (
                    <tr key={`${seg}-${row.DEVICE_TYPE_NORMALIZED}`} className="border-b border-white/5 hover:bg-white/5">
                      {dtIdx === 0 && (
                        <td
                          className="p-2 font-bold text-slate-200 sticky left-0 bg-slate-900/60 align-top"
                          rowSpan={dtRows.length + 1}
                        >
                          {seg}
                        </td>
                      )}
                      <td className="p-2 text-slate-400">{row.DEVICE_TYPE_NORMALIZED}</td>
                      {cols.map((c) => (
                        <td key={c.key} className={`p-2 text-right tabular-nums ${c.color}`}>
                          {fmt(row[c.key as keyof OverlapRow] as number)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr key={`${seg}-total`} className="border-b border-white/10 bg-white/5 font-semibold">
                    <td className="p-2 text-slate-300">Subtotal</td>
                    {cols.map((c) => (
                      <td key={c.key} className={`p-2 text-right tabular-nums ${c.color}`}>
                        {fmt(segRow[c.key as keyof OverlapRow] as number)}
                      </td>
                    ))}
                  </tr>
                </>
              );
            })}
            {/* Grand total */}
            <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
              <td className="p-2 text-slate-200 sticky left-0 bg-slate-900/80" colSpan={2}>
                GRAND TOTAL
              </td>
              {cols.map((c) => {
                const total = rows.reduce(
                  (s, r) => s + ((r[c.key as keyof OverlapRow] as number) ?? 0),
                  0
                );
                return (
                  <td key={c.key} className={`p-2 text-right tabular-nums font-bold ${c.color}`}>
                    {fmt(total)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- AGEING MATRIX COMPONENT -----------------------------------------------

function AgeingMatrix({ rows }: { rows: AgeingRow[] }) {
  const allBuckets = AGING_ORDER.filter((b) => rows.some((r) => r.AGING_BUCKET === b));
  const data: Record<string, Record<string, Record<string, number>>> = {};
  const segTotals: Record<string, number> = {};
  const dtTotals: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    data[row.SEGMENT] ??= {};
    data[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED] ??= {};
    data[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED][row.AGING_BUCKET] = row.DEVICE_COUNT;
    segTotals[row.SEGMENT] = (segTotals[row.SEGMENT] ?? 0) + row.DEVICE_COUNT;
    dtTotals[row.SEGMENT] ??= {};
    dtTotals[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED] =
      (dtTotals[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED] ?? 0) + row.DEVICE_COUNT;
  }

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-300">
        Ageing Cut — days since last recharge, by segment &amp; device type
      </h2>
      <div style={{ minWidth: "900px" }}>
        <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
              <th className="p-2 sticky left-0 bg-slate-900/80">Segment</th>
              <th className="p-2">Device Type</th>
              {allBuckets.map((b) => (
                <th key={b} className="p-2 text-right">{b}</th>
              ))}
              <th className="p-2 text-right font-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((seg) => {
              if (!data[seg]) return null;
              const dtKeys = Object.keys(data[seg]);
              return dtKeys.map((dt, dtIdx) => (
                <tr key={`${seg}-${dt}`} className="border-b border-white/5 hover:bg-white/5">
                  {dtIdx === 0 && (
                    <td className="p-2 font-bold text-slate-200 sticky left-0 bg-slate-900/60 align-top" rowSpan={dtKeys.length}>
                      {seg}
                    </td>
                  )}
                  <td className="p-2 text-slate-400">{dt}</td>
                  {allBuckets.map((b) => (
                    <td key={b} className="p-2 text-right tabular-nums text-slate-300">
                      {fmt(data[seg][dt][b])}
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold text-slate-200 tabular-nums">
                    {fmt(dtTotals[seg][dt])}
                  </td>
                </tr>
              ));
            })}
            {/* Column totals */}
            <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
              <td className="p-2 text-slate-300 sticky left-0 bg-slate-900/80" colSpan={2}>TOTAL</td>
              {allBuckets.map((b) => (
                <td key={b} className="p-2 text-right tabular-nums text-slate-200">
                  {fmt(rows.filter((r) => r.AGING_BUCKET === b).reduce((s, r) => s + r.DEVICE_COUNT, 0))}
                </td>
              ))}
              <td className="p-2 text-right text-white tabular-nums">
                {fmt(rows.reduce((s, r) => s + r.DEVICE_COUNT, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- INVOICE FY MATRIX COMPONENT -------------------------------------------

function InvoiceFyMatrix({ rows }: { rows: InvoiceFyRow[] }) {
  const allFYs = [...new Map(rows.map((r) => [r.INVOICE_FY, r.INVOICE_FY_SORT]))].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const data: Record<string, Record<string, Record<string, number>>> = {};
  const segTotals: Record<string, number> = {};

  for (const row of rows) {
    data[row.SEGMENT] ??= {};
    data[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED] ??= {};
    data[row.SEGMENT][row.DEVICE_TYPE_NORMALIZED][row.INVOICE_FY] = row.DEVICE_COUNT;
    segTotals[row.SEGMENT] = (segTotals[row.SEGMENT] ?? 0) + row.DEVICE_COUNT;
  }

  return (
    <div className="glass-card overflow-x-auto rounded-xl p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-300">
        Invoice FY Cut — device count by financial year of purchase
      </h2>
      <div style={{ minWidth: "1000px" }}>
        <table className="w-full text-xs" style={{ tableLayout: "auto" }}>
          <thead>
            <tr className="border-b border-white/10 text-left text-slate-500 uppercase">
              <th className="p-2 sticky left-0 bg-slate-900/80">Segment</th>
              <th className="p-2">Device Type</th>
              {allFYs.map((fy) => <th key={fy} className="p-2 text-right">{fy}</th>)}
              <th className="p-2 text-right font-bold">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((seg) => {
              if (!data[seg]) return null;
              const dtKeys = Object.keys(data[seg]);
              return dtKeys.map((dt, dtIdx) => {
                const rowTotal = allFYs.reduce((s, fy) => s + (data[seg][dt][fy] ?? 0), 0);
                return (
                  <tr key={`${seg}-${dt}`} className="border-b border-white/5 hover:bg-white/5">
                    {dtIdx === 0 && (
                      <td className="p-2 font-bold text-slate-200 sticky left-0 bg-slate-900/60 align-top" rowSpan={dtKeys.length}>
                        {seg}
                      </td>
                    )}
                    <td className="p-2 text-slate-400">{dt}</td>
                    {allFYs.map((fy) => (
                      <td key={fy} className="p-2 text-right tabular-nums text-slate-300">
                        {fmt(data[seg][dt][fy])}
                      </td>
                    ))}
                    <td className="p-2 text-right font-semibold text-slate-200 tabular-nums">{fmt(rowTotal)}</td>
                  </tr>
                );
              });
            })}
            {/* Column totals */}
            <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
              <td className="p-2 text-slate-300 sticky left-0 bg-slate-900/80" colSpan={2}>TOTAL</td>
              {allFYs.map((fy) => {
                const total = rows.filter((r) => r.INVOICE_FY === fy).reduce((s, r) => s + r.DEVICE_COUNT, 0);
                return <td key={fy} className="p-2 text-right tabular-nums text-slate-200">{fmt(total)}</td>;
              })}
              <td className="p-2 text-right text-white tabular-nums">{fmt(rows.reduce((s, r) => s + r.DEVICE_COUNT, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
