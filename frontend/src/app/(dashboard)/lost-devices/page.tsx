"use client";

import { useEffect, useState } from "react";
import { api, LostDeviceRow, LostDevicesSummary } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ExportButton } from "@/components/ExportButton";
import { KpiCard } from "@/components/KpiCard";
import { SkeletonCard, SkeletonTable } from "@/components/KpiCard";
import { useGlobalFilters } from "@/components/GlobalFilters";

const LIST_PAGE_SIZE = 100;

function Colgroup() {
  return (
    <colgroup>
      <col style={{ width: "40%" }} />
      <col style={{ width: "20%" }} />
      <col style={{ width: "20%" }} />
      <col style={{ width: "20%" }} />
    </colgroup>
  );
}

function ListColgroup() {
  return (
    <colgroup>
      <col style={{ width: "150px" }} />
      <col style={{ width: "170px" }} />
      <col style={{ width: "110px" }} />
      <col style={{ width: "130px" }} />
      <col style={{ width: "110px" }} />
      <col style={{ width: "170px" }} />
      <col style={{ width: "150px" }} />
      <col style={{ width: "150px" }} />
      <col style={{ width: "100px" }} />
      <col style={{ width: "110px" }} />
    </colgroup>
  );
}

export default function LostDevicesPage() {
  const [data, setData] = useState<LostDevicesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  const [listRows, setListRows] = useState<LostDeviceRow[] | null>(null);
  const [listTotal, setListTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setData(null);
    api
      .lostDevicesSummary(queryString)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
  }, [queryString]);

  useEffect(() => {
    setListPage(0);
  }, [queryString, search]);

  useEffect(() => {
    setListRows(null);
    api
      .lostDevicesList(LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE, queryString, search)
      .then((r) => {
        setListRows(r.rows);
        setListTotal(r.total);
      })
      .catch((e) => setListError(String(e.message ?? e)));
  }, [queryString, search, listPage]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return (
    <div className="space-y-4 p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );

  const listPageCount = Math.max(1, Math.ceil(listTotal / LIST_PAGE_SIZE));

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Lost &amp; Written-Off Devices</h1>
        </div>
        <ExportButton href={`/api/lost-devices/export.csv${queryString}`} label="Export device list" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Total Lost" value={data.total_lost} tone="danger" />
        <KpiCard label="Total Written Off" value={data.total_written_off} tone="danger" />
        <KpiCard label="Combined Lost + WO" value={data.total_lost_or_wo} tone="danger" />
      </div>

      {/* Two separate <table>s (header-only, body-only) per section - see
          customers/page.tsx for why: a frozen <thead> on one shared table
          measurably glitches under real scrolling on this app's large
          tables. Column alignment via shared <colgroup> + table-layout:fixed. */}

      {/* By Device Type */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">By Device Type</h2>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <Colgroup />
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-2">Device Type</th>
              <th className="p-2 text-right">Lost</th>
              <th className="p-2 text-right">Written Off</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <Colgroup />
            <tbody>
              {data.by_device_type.map((row) => (
                <tr key={row.DEVICE_TYPE_NORMALIZED} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-2 text-slate-200">{row.DEVICE_TYPE_NORMALIZED}</td>
                  <td className="p-2 text-right text-rose-400">{row.LOST.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-400">{row.WRITTEN_OFF.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-300 font-semibold">{row.TOTAL.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Holder */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">By Holder</h2>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <Colgroup />
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-2">Holder Bucket</th>
              <th className="p-2 text-right">Lost</th>
              <th className="p-2 text-right">Written Off</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <Colgroup />
            <tbody>
              {data.by_holder.map((row) => (
                <tr key={row.HOLDER_BUCKET} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-2 text-slate-200">{row.HOLDER_BUCKET}</td>
                  <td className="p-2 text-right text-rose-400">{row.LOST.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-400">{row.WRITTEN_OFF.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-300 font-semibold">{row.TOTAL.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Invoice Year */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">By Invoice Year</h2>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <Colgroup />
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-2">Invoice Year</th>
              <th className="p-2 text-right">Lost</th>
              <th className="p-2 text-right">Written Off</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
            <Colgroup />
            <tbody>
              {data.by_invoice_year.map((row) => (
                <tr key={row.INVOICE_YEAR} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-2 text-slate-200">{row.INVOICE_YEAR}</td>
                  <td className="p-2 text-right text-rose-400">{row.LOST.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-400">{row.WRITTEN_OFF.toLocaleString("en-IN")}</td>
                  <td className="p-2 text-right text-rose-300 font-semibold">{row.TOTAL.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Device-level list: the summary tables above only ever showed
          aggregates, despite the page title implying a device list - this
          is the actual per-device view, server-paginated since the full
          lost+written-off population runs to ~88k rows. */}
      <div className="glass-card overflow-x-auto rounded-xl p-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-300">Device List</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by device ID, MAC, partner, or customer ID..."
            className="w-96 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-500 focus:border-[#D9009D]/60 focus:outline-none"
          />
        </div>
        {listError && <ErrorBanner message={listError} />}
        <div style={{ minWidth: "1350px" }}>
          <table className="text-sm" style={{ tableLayout: "fixed", width: "1350px" }}>
            <ListColgroup />
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Device ID</th>
                <th className="p-2">MAC ID</th>
                <th className="p-2">Device Type</th>
                <th className="p-2">Status</th>
                <th className="p-2">Holder</th>
                <th className="p-2">Location</th>
                <th className="p-2">Partner ID</th>
                <th className="p-2">Customer ID</th>
                <th className="p-2 text-right">Invoice Year</th>
                <th className="p-2">Ageing</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="text-sm" style={{ tableLayout: "fixed", width: "1350px" }}>
              <ListColgroup />
              <tbody>
                {!listRows && (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-500">
                      Loading...
                    </td>
                  </tr>
                )}
                {listRows && listRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-500">
                      No devices match this search/filter.
                    </td>
                  </tr>
                )}
                {listRows?.map((row) => (
                  <tr key={row.DEVICE_ID} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-2 font-mono text-xs text-slate-300">{row.DEVICE_ID}</td>
                    <td className="p-2 font-mono text-xs text-slate-400">{row.MAC_ID ?? "—"}</td>
                    <td className="p-2 text-slate-300">{row.DEVICE_TYPE_NORMALIZED}</td>
                    <td className="p-2 text-rose-400">{row.STATUS_NORMALIZED}</td>
                    <td className="p-2 text-slate-400">{row.HOLDER_BUCKET}</td>
                    <td className="p-2 text-slate-400">{row.CURRENT_LOCATION_RESOLVED ?? "—"}</td>
                    <td className="p-2 font-mono text-xs text-slate-400">{row.PARTNER_ACCOUNT_ID ?? "—"}</td>
                    <td className="p-2 font-mono text-xs text-slate-400">{row.CUSTOMER_ACCOUNT_ID ?? "—"}</td>
                    <td className="p-2 text-right text-slate-400">{row.INVOICE_YEAR ?? "—"}</td>
                    <td className="p-2 text-slate-400">{row.AGING_BUCKET}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {listTotal === 0 ? 0 : listPage * LIST_PAGE_SIZE + 1}
            &ndash;{Math.min((listPage + 1) * LIST_PAGE_SIZE, listTotal)} of{" "}
            {listTotal.toLocaleString("en-IN")}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setListPage((p) => Math.max(0, p - 1))}
              disabled={listPage === 0}
              className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-30 hover:bg-white/5"
            >
              Prev
            </button>
            <span>
              Page {listPage + 1} of {listPageCount}
            </span>
            <button
              onClick={() => setListPage((p) => Math.min(listPageCount - 1, p + 1))}
              disabled={listPage >= listPageCount - 1}
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
