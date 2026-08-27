"use client";

import { useEffect, useState } from "react";
import { api, PartnerSummaryResponse } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

function rateColor(pct: number): string {
  if (pct >= 60) return "text-rose-400";
  if (pct >= 30) return "text-amber-300";
  return "text-emerald-300";
}

const COL_WIDTHS = [
  "150px", "170px", "120px", "150px", "90px", "90px",
  "110px", "140px", "140px", "100px", "130px",
  "90px", "100px", "90px", "100px", "120px",
  "100px", "110px", "110px",
];

function cspStatusChip(status: "CSP" | "EX_CSP") {
  return status === "CSP"
    ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-300"
    : "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300";
}

function Colgroup() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

const PAGE_SIZE = 200;

export default function PartnersPage() {
  const [data, setData] = useState<PartnerSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cspStatus, setCspStatus] = useState<"" | "CSP" | "EX_CSP">("");
  const [grnSourceBucket, setGrnSourceBucket] = useState<"" | "fresh_grn" | "ssot_csp" | "other">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setData(null);
    api
      .partnerSummary(5000, queryString, cspStatus, grnSourceBucket)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString, cspStatus, grnSourceBucket]);

  useEffect(() => {
    setPage(0);
  }, [search, cspStatus, grnSourceBucket]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={10} />
    </div>
  );

  const { kpis, by_device_type, leaderboard } = data;
  const rows = leaderboard.rows;
  // total_partners is CSP + Ex-CSP combined (that's why the KpiCard below
  // says "Total Partners", never "Total CSP" - Ex-CSP would be
  // mislabeled). These two are the correct, separately-labeled split,
  // computed from whatever csp_status filter is currently applied above -
  // so they always match what the leaderboard table beneath is showing.
  const liveCspCount = rows.filter((r) => r.CSP_STATUS === "CSP").length;
  const exCspCount = rows.filter((r) => r.CSP_STATUS === "EX_CSP").length;

  const searchLower = search.trim().toLowerCase();
  const filteredRows = searchLower
    ? rows.filter((r) =>
        [r.PARTNER_ACCOUNT_ID, r.PARTNER_NAME, r.PARTNER_MOBILE, r.CITY]
          .some((v) => v != null && String(v).toLowerCase().includes(searchLower))
      )
    : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  // Footer sums always reflect the FULL matched population (all rows, not
  // just the current search/page slice) so they stay meaningful even while
  // searching or paging.
  const totals = rows.reduce(
    (acc, r) => ({
      LOST: acc.LOST + r.LOST,
      WRITTEN_OFF: acc.WRITTEN_OFF + r.WRITTEN_OFF,
      LOST_OR_WRITTEN_OFF: acc.LOST_OR_WRITTEN_OFF + r.LOST_OR_WRITTEN_OFF,
      TOTAL_DEVICES: acc.TOTAL_DEVICES + r.TOTAL_DEVICES,
      DEPLOYED_AT_CUSTOMER: acc.DEPLOYED_AT_CUSTOMER + r.DEPLOYED_AT_CUSTOMER,
      CURRENTLY_WITH_PARTNER: acc.CURRENTLY_WITH_PARTNER + r.CURRENTLY_WITH_PARTNER,
      DEPLOYED: acc.DEPLOYED + r.DEPLOYED,
      CUSTOMER_RECOVERY_PENDING: acc.CUSTOMER_RECOVERY_PENDING + r.CUSTOMER_RECOVERY_PENDING,
      IDLE: acc.IDLE + r.IDLE,
      CUSTODIED: acc.CUSTODIED + r.CUSTODIED,
      RETRIEVAL_PENDING: acc.RETRIEVAL_PENDING + r.RETRIEVAL_PENDING,
      AGED_365_PLUS: acc.AGED_365_PLUS + r.AGED_365_PLUS,
    }),
    {
      LOST: 0, WRITTEN_OFF: 0, LOST_OR_WRITTEN_OFF: 0, TOTAL_DEVICES: 0,
      DEPLOYED_AT_CUSTOMER: 0, CURRENTLY_WITH_PARTNER: 0, DEPLOYED: 0,
      CUSTOMER_RECOVERY_PENDING: 0, IDLE: 0, CUSTODIED: 0, RETRIEVAL_PENDING: 0,
      AGED_365_PLUS: 0,
    }
  );
  // Sourced from `kpis` (true unbounded server-side aggregate), not from
  // summing `rows` - `rows` is a page of the leaderboard and would silently
  // under-report this rate if the partner count ever grows past what's
  // fetched, same truncation risk already fixed for the leaderboard query.
  const totalRatePct = kpis.total_devices
    ? Math.round((1000 * (kpis.lost + kpis.written_off)) / kpis.total_devices) / 10
    : 0;

  const csvQuery = (() => {
    const parts: string[] = [];
    if (queryString) parts.push(queryString.slice(1));
    if (cspStatus) parts.push(`csp_status=${cspStatus}`);
    if (grnSourceBucket) parts.push(`grn_source_bucket=${grnSourceBucket}`);
    return parts.length ? `?${parts.join("&")}` : "";
  })();

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">CSP Summary</h1>
          <p className="mt-1 text-sm text-slate-500">
            Merged view (was two separate tabs showing the same partner population from two
            angles) &mdash; {leaderboard.total_partners.toLocaleString("en-IN")} partners with
            devices ever attributed to them, ranked by lost + written-off &mdash; worst first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={grnSourceBucket}
            onChange={(e) => setGrnSourceBucket(e.target.value as typeof grnSourceBucket)}
            className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 focus:border-[#D9009D]/60 focus:outline-none"
            title="Where the device record originated - Fresh GRN, the SSOT/CSP migration, or other."
          >
            <option value="">All sources</option>
            <option value="fresh_grn">Fresh GRN</option>
            <option value="ssot_csp">SSOT / CSP</option>
            <option value="other">Other</option>
          </select>
          <select
            value={cspStatus}
            onChange={(e) => setCspStatus(e.target.value as "" | "CSP" | "EX_CSP")}
            className="rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 focus:border-[#D9009D]/60 focus:outline-none"
            title="CSP = has a live row in the CSP gateway's account table. EX CSP = churned/never onboarded."
          >
            <option value="">All (CSP + EX CSP)</option>
            <option value="CSP">CSP only</option>
            <option value="EX_CSP">EX CSP only</option>
          </select>
          <ExportButton href={`/api/partners/leaderboard.csv${csvQuery}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard label="Total Partners" value={leaderboard.total_partners} />
        <KpiCard label="Live CSP" value={liveCspCount} tone="success" />
        <KpiCard label="Ex-CSP" value={exCspCount} tone="warning" />
        <KpiCard label="Total devices" value={kpis.total_devices} />
        <KpiCard label="At customer" value={kpis.at_customer} tone="success" />
        <KpiCard label="With partner" value={kpis.with_partner} />
        <KpiCard label="Returned to Wiom" value={kpis.returned_to_wiom} />
        <KpiCard label="In warehouse" value={kpis.in_warehouse} />
        <KpiCard label="Lost" value={kpis.lost} tone="danger" />
        <KpiCard label="Written off" value={kpis.written_off} tone="danger" />
        <KpiCard label="Idle" value={kpis.idle} tone="warning" />
        <KpiCard label="Custodied" value={kpis.custodied} tone="warning" />
        <KpiCard label="Recharge active" value={kpis.recharge_active} tone="success" />
        <KpiCard label="Recharge expired" value={kpis.recharge_expired} tone="warning" />
        <KpiCard label="No recharge history" value={kpis.no_recharge_history} />
        <KpiCard label="Overall Lost+WO rate" value={`${totalRatePct}%`} tone="danger" />
      </div>

      {(() => {
        const locationSum = kpis.at_customer + kpis.with_partner + kpis.returned_to_wiom + kpis.in_warehouse;
        const rechargeSum = kpis.recharge_active + kpis.recharge_expired + kpis.no_recharge_history;
        const rows = [
          { label: "At customer + With partner + Returned to Wiom + In warehouse", sum: locationSum },
          { label: "Recharge active + Recharge expired + No recharge history", sum: rechargeSum },
        ];
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((r) => {
              const matches = r.sum === kpis.total_devices;
              return (
                <div
                  key={r.label}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    matches ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-rose-500/30 bg-rose-500/5 text-rose-300"
                  }`}
                >
                  {matches ? "✓" : "✗"} {r.label} = {r.sum.toLocaleString("en-IN")}
                  {!matches && ` (expected ${kpis.total_devices.toLocaleString("en-IN")})`}
                </div>
              );
            })}
          </div>
        );
      })()}

      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">By Device Type</h2>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "17.5%" }} />
            <col style={{ width: "17.5%" }} />
            <col style={{ width: "17.5%" }} />
            <col style={{ width: "17.5%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-2">Device Type</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Deployed</th>
              <th className="p-2 text-right">Lost</th>
              <th className="p-2 text-right">Written Off</th>
            </tr>
          </thead>
          <tbody>
            {by_device_type.map((row) => (
              <tr key={row.DEVICE_TYPE_NORMALIZED} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-2 text-slate-200">{row.DEVICE_TYPE_NORMALIZED}</td>
                <td className="p-2 text-right text-slate-300">{row.DEVICE_COUNT.toLocaleString("en-IN")}</td>
                <td className="p-2 text-right text-emerald-300">{row.DEPLOYED.toLocaleString("en-IN")}</td>
                <td className="p-2 text-right text-rose-400">{row.LOST.toLocaleString("en-IN")}</td>
                <td className="p-2 text-right text-rose-400">{row.WRITTEN_OFF.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
              <td className="p-2 text-slate-200">TOTAL</td>
              <td className="p-2 text-right text-white tabular-nums">
                {by_device_type.reduce((s, r) => s + r.DEVICE_COUNT, 0).toLocaleString("en-IN")}
              </td>
              <td className="p-2 text-right text-emerald-300 tabular-nums">
                {by_device_type.reduce((s, r) => s + r.DEPLOYED, 0).toLocaleString("en-IN")}
              </td>
              <td className="p-2 text-right text-rose-300 tabular-nums">
                {by_device_type.reduce((s, r) => s + r.LOST, 0).toLocaleString("en-IN")}
              </td>
              <td className="p-2 text-right text-rose-300 tabular-nums">
                {by_device_type.reduce((s, r) => s + r.WRITTEN_OFF, 0).toLocaleString("en-IN")}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Two separate <table>s (header-only, body-only): a frozen <thead> on
          one shared table measurably glitches under real scrolling on this
          app's large tables (a data row renders above the header). A header
          outside the scrolling element structurally can't have that bug.
          Column alignment comes from both tables sharing the same
          <colgroup> + table-layout:fixed. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-300">CSP Leaderboard</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by partner ID, name, mobile, or city..."
            className="w-80 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-500 focus:border-[#D9009D]/60 focus:outline-none"
          />
        </div>
        <div style={{ minWidth: "2210px" }}>
          <table className="text-sm" style={{ tableLayout: "fixed", width: "2210px" }}>
            <Colgroup />
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Partner Account ID</th>
                <th className="p-2">Partner Name</th>
                <th className="p-2">Mobile</th>
                <th className="p-2">City / Zone</th>
                <th className="p-2">Status</th>
                <th className="p-2" title="CSP = live row in the CSP gateway's account table. EX CSP = churned/never onboarded.">
                  CSP Status
                </th>
                <th className="p-2 text-right">Total devices</th>
                <th className="p-2 text-right">Deployed at customer</th>
                <th className="p-2 text-right">Currently with partner</th>
                <th className="p-2 text-right" title="Customer bucket: status = DEPLOYED">Deployed</th>
                <th className="p-2 text-right" title="Customer bucket: status = CUSTOMER_RECOVERY_PENDING">
                  Recovery pending
                </th>
                <th className="p-2 text-right">Lost</th>
                <th className="p-2 text-right">Written off</th>
                <th className="p-2 text-right" title="Partner bucket: status = IDLE">Idle</th>
                <th className="p-2 text-right" title="Partner bucket: status = CUSTODIED">Custodied</th>
                <th className="p-2 text-right" title="Partner bucket: status = RETRIEVAL_PENDING">
                  Retrieval pending
                </th>
                <th className="p-2 text-right">365+ aged</th>
                <th className="p-2 text-right">Lost+WO rate</th>
                <th className="p-2"></th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="text-sm" style={{ tableLayout: "fixed", width: "2210px" }}>
              <Colgroup />
              <tfoot>
                <tr className="border-b-2 border-white/20 bg-white/5 font-semibold">
                  <td className="p-2 text-slate-200">Total ({leaderboard.total_partners.toLocaleString("en-IN")} partners)</td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2"></td>
                  <td className="p-2 text-right text-white">
                    {totals.TOTAL_DEVICES.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300">
                    {totals.DEPLOYED_AT_CUSTOMER.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-slate-300">
                    {totals.CURRENTLY_WITH_PARTNER.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-emerald-300">
                    {totals.DEPLOYED.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-slate-300">
                    {totals.CUSTOMER_RECOVERY_PENDING.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-rose-400">{totals.LOST.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-400">
                    {totals.WRITTEN_OFF.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-amber-300">
                    {totals.IDLE.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-amber-300">
                    {totals.CUSTODIED.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-slate-300">
                    {totals.RETRIEVAL_PENDING.toLocaleString("en-IN")}
                  </td>
                  <td className="p-2 text-right text-slate-400">
                    {totals.AGED_365_PLUS.toLocaleString("en-IN")}
                  </td>
                  <td className={`p-2 text-right ${rateColor(totalRatePct)}`}>{totalRatePct}%</td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
              <tbody>
                {pagedRows.map((row) => (
                  <tr
                    key={row.PARTNER_ACCOUNT_ID}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="p-2 font-mono text-xs text-slate-300">
                      {row.PARTNER_ACCOUNT_ID}
                    </td>
                    <td className="p-2 text-slate-200">{row.PARTNER_NAME ?? "—"}</td>
                    <td className="p-2 text-slate-400">{row.PARTNER_MOBILE ?? "—"}</td>
                    <td className="p-2 text-slate-400">
                      {row.CITY ?? "—"}
                      {row.ZONE ? ` / ${row.ZONE}` : ""}
                    </td>
                    <td className="p-2 text-slate-400">{row.PARTNER_STATUS ?? "—"}</td>
                    <td className="p-2">
                      <span className={cspStatusChip(row.CSP_STATUS)}>
                        {row.CSP_STATUS === "CSP" ? "CSP" : "EX CSP"}
                      </span>
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.TOTAL_DEVICES.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.DEPLOYED_AT_CUSTOMER.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.CURRENTLY_WITH_PARTNER.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-emerald-300">
                      {row.DEPLOYED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.CUSTOMER_RECOVERY_PENDING.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-rose-400">{row.LOST.toLocaleString("en-IN")}</td>
                    <td className="p-2 text-right text-rose-400">
                      {row.WRITTEN_OFF.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {row.IDLE.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-amber-300">
                      {row.CUSTODIED.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-300">
                      {row.RETRIEVAL_PENDING.toLocaleString("en-IN")}
                    </td>
                    <td className="p-2 text-right text-slate-400">
                      {row.AGED_365_PLUS.toLocaleString("en-IN")}
                    </td>
                    <td className={`p-2 text-right font-semibold ${rateColor(row.lost_or_written_off_rate_pct)}`}>
                      {row.lost_or_written_off_rate_pct}%
                    </td>
                    <td className="p-2 text-right">
                      <ExportButton
                        href={`/api/devices/export/full.csv?partner_account_id=${encodeURIComponent(row.PARTNER_ACCOUNT_ID)}`}
                        label="Devices"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {filteredRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}
            &ndash;{Math.min((currentPage + 1) * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length.toLocaleString("en-IN")}
            {searchLower && ` (filtered from ${rows.length.toLocaleString("en-IN")})`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-30 hover:bg-white/5"
            >
              Prev
            </button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-30 hover:bg-white/5"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
