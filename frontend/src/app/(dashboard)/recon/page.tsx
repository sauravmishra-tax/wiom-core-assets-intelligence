"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/api";
import { KpiCard, SkeletonCard } from "@/components/KpiCard";
import { ErrorBanner } from "@/components/ErrorBanner";

// ---- types ----------------------------------------------------------------

interface SnowflakeRow {
  DEVICE_ID: string;
  INVOICE_NUMBER: string;
  STATUS_NORMALIZED: string;
  HOLDER_BUCKET: string;
  WRITE_OFF_DATE: string;
}

interface ExcelDevice {
  device_id: string;
  invoice_number: string;
  invoice_date: string;
  write_off_date: string;
  source: "SSOT" | "Pyrops";
}

interface InvoiceDiff {
  invoice_number: string;
  excel_count: number;
  sf_count: number;
  diff: number;
  excel_write_offs: number;
}

interface ReconResult {
  excel_total: number;
  sf_total: number;
  matched: number;
  only_in_excel: number;
  only_in_sf_for_same_invoices: number;
  invoice_diff: InvoiceDiff[];
  only_in_excel_sample: ExcelDevice[];
}

// ---- Excel serial date converter -------------------------------------------

function xlSerialToDate(serial: number | null | undefined): string {
  if (!serial || isNaN(serial)) return "";
  // Excel epoch: Dec 30, 1899 (accounting for leap year bug)
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

// ---- CSV parser (no external lib needed) -----------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = (vals[j] ?? "").replace(/^"|"$/g, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ---- Compare logic ---------------------------------------------------------

function buildReconResult(excel: ExcelDevice[], sfRows: SnowflakeRow[]): ReconResult {
  const sfMap = new Map<string, SnowflakeRow>();
  for (const row of sfRows) {
    sfMap.set(row.DEVICE_ID.trim().toUpperCase(), row);
  }

  const excelMap = new Map<string, ExcelDevice>();
  for (const d of excel) {
    excelMap.set(d.device_id.trim().toUpperCase(), d);
  }

  // Invoice-wise grouping
  const invoiceStats = new Map<
    string,
    { excel_count: number; sf_count: number; excel_write_offs: number }
  >();

  for (const d of excel) {
    const inv = d.invoice_number || "(blank)";
    const s = invoiceStats.get(inv) ?? { excel_count: 0, sf_count: 0, excel_write_offs: 0 };
    s.excel_count++;
    if (d.write_off_date) s.excel_write_offs++;
    invoiceStats.set(inv, s);
  }

  // Count SF devices for same invoice numbers (only invoices that appear in Excel)
  const excelInvoices = new Set([...excelMap.values()].map((d) => d.invoice_number || "(blank)"));
  for (const row of sfRows) {
    const inv = row.INVOICE_NUMBER || "(blank)";
    if (!excelInvoices.has(inv)) continue;
    const s = invoiceStats.get(inv);
    if (s) {
      s.sf_count++;
      invoiceStats.set(inv, s);
    }
  }

  const only_in_excel_sample: ExcelDevice[] = [];
  let matched = 0;
  let only_in_excel = 0;

  for (const [id, exc] of excelMap) {
    if (sfMap.has(id)) {
      matched++;
    } else {
      only_in_excel++;
      if (only_in_excel_sample.length < 500) only_in_excel_sample.push(exc);
    }
  }

  // Devices in SF with Excel invoices but NOT in Excel
  let only_in_sf_for_same_invoices = 0;
  for (const row of sfRows) {
    const inv = row.INVOICE_NUMBER || "(blank)";
    if (excelInvoices.has(inv) && !excelMap.has(row.DEVICE_ID.trim().toUpperCase())) {
      only_in_sf_for_same_invoices++;
    }
  }

  const invoice_diff: InvoiceDiff[] = [...invoiceStats.entries()]
    .map(([inv, s]) => ({
      invoice_number: inv,
      excel_count: s.excel_count,
      sf_count: s.sf_count,
      diff: s.sf_count - s.excel_count,
      excel_write_offs: s.excel_write_offs,
    }))
    .sort((a, b) => b.excel_count - a.excel_count);

  return {
    excel_total: excelMap.size,
    sf_total: sfRows.length,
    matched,
    only_in_excel,
    only_in_sf_for_same_invoices,
    invoice_diff,
    only_in_excel_sample,
  };
}

// ---- UI components ---------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DEPLOYED: "bg-emerald-500/20 text-emerald-300",
    WRITTEN_OFF: "bg-rose-500/20 text-rose-300",
    LOST: "bg-rose-600/20 text-rose-400",
    RETURNED: "bg-blue-500/20 text-blue-300",
    UNKNOWN: "bg-slate-500/20 text-slate-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? "bg-slate-500/20 text-slate-400"}`}
    >
      {status}
    </span>
  );
}

// ---- Main page -------------------------------------------------------------

export default function ReconPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [excelData, setExcelData] = useState<ExcelDevice[] | null>(null);
  const [sfData, setSfData] = useState<SnowflakeRow[] | null>(null);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [loadingSf, setLoadingSf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "invoices" | "missing">("summary");
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "short" | "excess" | "matched">("all");

  // Load Snowflake snapshot when Excel is ready
  useEffect(() => {
    if (!excelData) return;
    setLoadingSf(true);
    setSfData(null);
    setResult(null);

    fetch(`/api/recon/snapshot.csv`, {
      headers: authHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Snowflake snapshot failed: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const rows = parseCsv(text) as unknown as SnowflakeRow[];
        setSfData(rows);
        setResult(buildReconResult(excelData, rows));
        setLoadingSf(false);
      })
      .catch((e) => {
        setError(String(e.message ?? e));
        setLoadingSf(false);
      });
  }, [excelData]);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setExcelData(null);
    setResult(null);

    try {
      // Dynamic import so SheetJS is not included in the initial bundle
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const devices: ExcelDevice[] = [];

      // SSOT sheet
      const ssotSheet = wb.Sheets["SSOT"];
      if (ssotSheet) {
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ssotSheet, {
          defval: null,
        });
        for (const row of rows) {
          const id = String(row["device_id"] ?? "").trim();
          if (!id) continue;
          devices.push({
            device_id: id.toUpperCase(),
            invoice_number: String(row["Invoice number_Final"] ?? "").trim(),
            invoice_date: xlSerialToDate(row["Invoice Date V_2"] as number),
            write_off_date: xlSerialToDate(row["Writee off year"] as number),
            source: "SSOT",
          });
        }
      }

      // Pyrops (never dispatched) sheet
      const pySheet = wb.Sheets["Pyrops (never dispatched)"];
      if (pySheet) {
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(pySheet, {
          defval: null,
        });
        for (const row of rows) {
          const id = String(row["device_id"] ?? "").trim();
          if (!id) continue;
          devices.push({
            device_id: id.toUpperCase(),
            invoice_number: String(row["INVOICE_NUMBER"] ?? "").trim(),
            invoice_date: xlSerialToDate(row["FIRST_GRN_DATE"] as number),
            write_off_date: "",
            source: "Pyrops",
          });
        }
      }

      setExcelData(devices);
    } catch (e: unknown) {
      setError(`Failed to parse Excel: ${String((e as Error).message ?? e)}`);
    } finally {
      setParsing(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const filteredInvoices = result?.invoice_diff.filter((inv) => {
    if (invoiceFilter === "short") return inv.diff < 0;
    if (invoiceFilter === "excess") return inv.diff > 0;
    if (invoiceFilter === "matched") return inv.diff === 0;
    return true;
  });

  const isLoading = parsing || loadingSf;

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Recon — FAR vs SSOT</h1>
          <p className="mt-1 text-sm text-slate-400">
            Finance Fixed Asset Register (31 Mar 2026) compared against Snowflake live data
          </p>
        </div>
      </div>

      {/* Upload zone */}
      {!excelData && !isLoading && (
        <div
          className="glass-card flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-white/20 p-16 text-center transition-colors hover:border-[#D9009D]/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{ cursor: "pointer" }}
        >
          <div className="text-5xl opacity-40">⇄</div>
          <div>
            <p className="text-lg font-semibold text-slate-200">
              Drop your FAR Excel file here
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Supports .xlsb, .xlsx, .xls — expects sheets: SSOT &amp; Pyrops (never dispatched)
            </p>
          </div>
          <button className="rounded-lg bg-[#D9009D]/20 border border-[#D9009D]/40 px-5 py-2 text-sm font-medium text-[#ff6fd8] hover:bg-[#D9009D]/30 transition-colors">
            Choose File
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsb,.xls"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Parsing / loading */}
      {isLoading && (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="inline-flex items-center gap-3 text-slate-300">
            <span className="animate-spin text-2xl">⌛</span>
            <span className="text-sm font-medium">
              {parsing ? "Parsing Excel file…" : "Fetching Snowflake snapshot (350K rows)…"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {loadingSf && "This may take 30–60 seconds depending on Snowflake query time."}
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Results */}
      {result && !isLoading && (
        <>
          {/* Re-upload button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                setExcelData(null);
                setSfData(null);
                setResult(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Upload a different file
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard label="Excel Total" value={result.excel_total} />
            <KpiCard label="Snowflake Total" value={result.sf_total} />
            <KpiCard
              label="Matched"
              value={result.matched}
              tone="success"
            />
            <KpiCard
              label="Only in Excel"
              value={result.only_in_excel}
              tone={result.only_in_excel > 0 ? "danger" : "success"}
            />
            <KpiCard
              label="Extra in SF (same invoices)"
              value={result.only_in_sf_for_same_invoices}
              tone={result.only_in_sf_for_same_invoices > 0 ? "warning" : "success"}
            />
          </div>

          {/* Match rate bar */}
          <div className="glass-card rounded-xl p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-300 font-medium">Match Rate</span>
              <span className="font-bold text-white">
                {((result.matched / Math.max(result.excel_total, 1)) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D9009D] to-[#0839FB] transition-all duration-700"
                style={{
                  width: `${Math.min(100, (result.matched / Math.max(result.excel_total, 1)) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-2 flex gap-4 text-xs text-slate-500">
              <span>
                <span className="text-emerald-400 font-semibold">{result.matched.toLocaleString("en-IN")}</span> matched
              </span>
              <span>
                <span className="text-rose-400 font-semibold">{result.only_in_excel.toLocaleString("en-IN")}</span> missing from Snowflake
              </span>
              <span>
                <span className="text-amber-400 font-semibold">{result.only_in_sf_for_same_invoices.toLocaleString("en-IN")}</span> extra in Snowflake
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/10 pb-0">
            {(["summary", "invoices", "missing"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  tab === t
                    ? "bg-white/10 text-white border-b-2 border-[#D9009D]"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t === "summary" && "Summary"}
                {t === "invoices" && `Invoice Breakdown (${result.invoice_diff.length})`}
                {t === "missing" && `Missing from SF (${result.only_in_excel.toLocaleString("en-IN")})`}
              </button>
            ))}
          </div>

          {/* Summary tab */}
          {tab === "summary" && (
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-slate-200">Recon Summary — 31 Mar 2026</h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/5">
                  {[
                    ["Snapshot date", "31 March 2026 (Finance FAR)"],
                    ["Excel file sheets", "SSOT + Pyrops (never dispatched)"],
                    ["Total devices in Excel", result.excel_total.toLocaleString("en-IN")],
                    ["Total devices in Snowflake", result.sf_total.toLocaleString("en-IN")],
                    ["Devices matched (ID found in SF)", result.matched.toLocaleString("en-IN")],
                    [
                      "Devices in Excel but NOT in Snowflake",
                      `${result.only_in_excel.toLocaleString("en-IN")} (${((result.only_in_excel / Math.max(result.excel_total, 1)) * 100).toFixed(1)}%)`,
                    ],
                    [
                      "Devices in Snowflake (same invoices) but NOT in Excel",
                      result.only_in_sf_for_same_invoices.toLocaleString("en-IN"),
                    ],
                    ["Match rate", `${((result.matched / Math.max(result.excel_total, 1)) * 100).toFixed(1)}%`],
                    ["Unique invoices in Excel", result.invoice_diff.length.toLocaleString("en-IN")],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td className="py-2 pr-4 text-slate-400 w-64">{label}</td>
                      <td className="py-2 font-semibold text-slate-100">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Invoice breakdown tab */}
          {tab === "invoices" && (
            <div className="glass-card rounded-xl p-5">
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Filter:</span>
                {(["all", "short", "excess", "matched"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setInvoiceFilter(f)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      invoiceFilter === f
                        ? "bg-[#D9009D]/30 text-[#ff6fd8] border border-[#D9009D]/50"
                        : "bg-white/5 text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {f === "all" && "All"}
                    {f === "short" && "SF Short (SF < Excel)"}
                    {f === "excess" && "SF Excess (SF > Excel)"}
                    {f === "matched" && "Exactly Matched"}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">
                  {filteredInvoices?.length ?? 0} invoices
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: "700px" }}>
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                      <th className="p-2">Invoice Number</th>
                      <th className="p-2 text-right">Excel Count</th>
                      <th className="p-2 text-right">SF Count</th>
                      <th className="p-2 text-right">Diff (SF−Excel)</th>
                      <th className="p-2 text-right">Write-offs in Excel</th>
                      <th className="p-2 text-right">Status</th>
                    </tr>
                  </thead>
                </table>
                <div className="max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: "700px" }}>
                    <colgroup>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "10%" }} />
                    </colgroup>
                    <tbody>
                      {filteredInvoices?.map((inv) => (
                        <tr key={inv.invoice_number} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-2 font-mono text-xs text-slate-300 truncate" title={inv.invoice_number}>
                            {inv.invoice_number}
                          </td>
                          <td className="p-2 text-right text-slate-300">
                            {inv.excel_count.toLocaleString("en-IN")}
                          </td>
                          <td className="p-2 text-right text-slate-300">
                            {inv.sf_count.toLocaleString("en-IN")}
                          </td>
                          <td
                            className={`p-2 text-right font-semibold ${
                              inv.diff === 0
                                ? "text-emerald-400"
                                : inv.diff < 0
                                ? "text-rose-400"
                                : "text-amber-400"
                            }`}
                          >
                            {inv.diff > 0 ? "+" : ""}
                            {inv.diff.toLocaleString("en-IN")}
                          </td>
                          <td className="p-2 text-right text-slate-500">
                            {inv.excel_write_offs > 0
                              ? inv.excel_write_offs.toLocaleString("en-IN")
                              : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {inv.diff === 0 ? (
                              <span className="text-emerald-400 text-xs">✓</span>
                            ) : inv.diff < 0 ? (
                              <span className="text-rose-400 text-xs">↓ Short</span>
                            ) : (
                              <span className="text-amber-400 text-xs">↑ Extra</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Missing devices tab */}
          {tab === "missing" && (
            <div className="glass-card rounded-xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-300">
                    Devices in Excel but NOT found in Snowflake
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showing first 500 of {result.only_in_excel.toLocaleString("en-IN")} devices
                  </p>
                </div>
                <button
                  onClick={() => {
                    const rows = result.only_in_excel_sample;
                    const csv = [
                      "DEVICE_ID,INVOICE_NUMBER,INVOICE_DATE,WRITE_OFF_DATE,SOURCE",
                      ...rows.map(
                        (r) =>
                          `${r.device_id},${r.invoice_number},${r.invoice_date},${r.write_off_date},${r.source}`
                      ),
                    ].join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "recon_missing_from_snowflake.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: "650px" }}>
                  <colgroup>
                    <col style={{ width: "180px" }} />
                    <col style={{ width: "220px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "90px" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                      <th className="p-2">Device ID</th>
                      <th className="p-2">Invoice Number</th>
                      <th className="p-2">Invoice Date</th>
                      <th className="p-2">Write-off Date</th>
                      <th className="p-2">Sheet</th>
                    </tr>
                  </thead>
                </table>
                <div className="max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: "650px" }}>
                    <colgroup>
                      <col style={{ width: "180px" }} />
                      <col style={{ width: "220px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "90px" }} />
                    </colgroup>
                    <tbody>
                      {result.only_in_excel_sample.map((dev) => (
                        <tr key={dev.device_id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-2 font-mono text-xs text-slate-300">{dev.device_id}</td>
                          <td className="p-2 font-mono text-xs text-slate-400 truncate" title={dev.invoice_number}>
                            {dev.invoice_number || "—"}
                          </td>
                          <td className="p-2 text-xs text-slate-500">{dev.invoice_date || "—"}</td>
                          <td className="p-2 text-xs text-slate-500">{dev.write_off_date || "—"}</td>
                          <td className="p-2">
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                dev.source === "SSOT"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : "bg-purple-500/20 text-purple-300"
                              }`}
                            >
                              {dev.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
