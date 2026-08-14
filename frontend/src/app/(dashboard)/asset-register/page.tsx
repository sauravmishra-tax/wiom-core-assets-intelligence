"use client";

import { useEffect, useState } from "react";
import {
  api,
  PurchaseWriteoffResponse,
  CumulativeResponse,
  CohortResponse,
  LocationWriteoffResponse,
} from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";

const DEVICE_TYPES = ["Router", "ONT"];

function n(v: number): string {
  return v.toLocaleString("en-IN");
}

function pct(v: number): string {
  return `${v}%`;
}

export default function AssetRegisterPage() {
  const [pw, setPw] = useState<PurchaseWriteoffResponse | null>(null);
  const [cum, setCum] = useState<CumulativeResponse | null>(null);
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  const [loc, setLoc] = useState<LocationWriteoffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.assetRegisterPurchaseWriteoff(),
      api.assetRegisterCumulative(),
      api.assetRegisterCohort(),
      api.assetRegisterLocationWriteoff(),
    ])
      .then(([a, b, c, d]) => {
        setPw(a);
        setCum(b);
        setCohort(c);
        setLoc(d);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!pw || !cum || !cohort || !loc) return <div className="p-8 text-slate-500">Loading...</div>;

  const purchaseWriteoff = pw;

  // ---- Purchase & write-off pivot: FY -> device type -> count ----
  const purchaseFys = Array.from(new Set(purchaseWriteoff.rows.filter((r) => r.KIND === "purchase").map((r) => r.FY))).sort();
  const writeoffFys = Array.from(new Set(purchaseWriteoff.rows.filter((r) => r.KIND === "write_off").map((r) => r.FY))).sort();

  function pivotFor(kind: "purchase" | "write_off", fys: string[]) {
    const grid: Record<string, Record<string, number>> = {};
    for (const dt of DEVICE_TYPES) grid[dt] = {};
    for (const r of purchaseWriteoff.rows) {
      if (r.KIND !== kind) continue;
      grid[r.DEVICE_TYPE_NORMALIZED] ??= {};
      grid[r.DEVICE_TYPE_NORMALIZED][r.FY] = r.DEVICE_COUNT;
    }
    const totalRow: Record<string, number> = {};
    for (const fy of fys) {
      totalRow[fy] = DEVICE_TYPES.reduce((s, dt) => s + (grid[dt]?.[fy] ?? 0), 0);
    }
    const rowTotal = (dt: string) => fys.reduce((s, fy) => s + (grid[dt]?.[fy] ?? 0), 0);
    return { grid, totalRow, rowTotal, grandTotal: fys.reduce((s, fy) => s + totalRow[fy], 0) };
  }

  const purchasePivot = pivotFor("purchase", purchaseFys);
  const writeoffPivot = pivotFor("write_off", writeoffFys);

  return (
    <div className="space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Asset Register</h1>
        <p className="mt-1 text-sm text-slate-500">
          Purchase / write-off cuts by fiscal year, cumulative write-off rate, purchase-year
          cohort mapping, and a location-wise write-off view &mdash; live off the warehouse,
          Router + ONT only.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        <strong>Coverage limit:</strong> {pw.coverage.note}
      </div>

      {/* ============ 1. Purchase & Write-off qty by FY ============ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Purchase &amp; Write-off Quantity by Fiscal Year
        </h2>

        <div className="glass-card overflow-x-auto rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">
            Purchase quantity since FY24-25
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Particulars</th>
                {purchaseFys.map((fy) => (
                  <th key={fy} className="p-2 text-right">{fy}</th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {DEVICE_TYPES.map((dt) => (
                <tr key={dt} className="border-b border-white/5">
                  <td className="p-2 text-slate-200">{dt}</td>
                  {purchaseFys.map((fy) => (
                    <td key={fy} className="p-2 text-right text-slate-300">
                      {n(purchasePivot.grid[dt]?.[fy] ?? 0)}
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold text-white">
                    {n(purchasePivot.rowTotal(dt))}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-2 text-slate-200">Total</td>
                {purchaseFys.map((fy) => (
                  <td key={fy} className="p-2 text-right text-white">{n(purchasePivot.totalRow[fy])}</td>
                ))}
                <td className="p-2 text-right text-white">{n(purchasePivot.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="glass-card overflow-x-auto rounded-xl p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">
            Write-off quantity since FY24-25
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-2">Particulars</th>
                {writeoffFys.map((fy) => (
                  <th key={fy} className="p-2 text-right">{fy}</th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {DEVICE_TYPES.map((dt) => (
                <tr key={dt} className="border-b border-white/5">
                  <td className="p-2 text-slate-200">{dt}</td>
                  {writeoffFys.map((fy) => (
                    <td key={fy} className="p-2 text-right text-rose-400">
                      {n(writeoffPivot.grid[dt]?.[fy] ?? 0)}
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold text-rose-300">
                    {n(writeoffPivot.rowTotal(dt))}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-2 text-slate-200">Total</td>
                {writeoffFys.map((fy) => (
                  <td key={fy} className="p-2 text-right text-rose-300">{n(writeoffPivot.totalRow[fy])}</td>
                ))}
                <td className="p-2 text-right text-rose-300">{n(writeoffPivot.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ 2. Cumulative write-off ============ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Cumulative Written-off Every Year Closure
        </h2>
        <p className="text-xs text-slate-500">
          FY22-23/23-24 can show a write-off % over 100%: those write-offs are real, but their
          purchase record predates this table&apos;s GRN/invoice coverage (from FY24-25 only),
          so they were never counted in &ldquo;cumulative purchased&rdquo; to begin with.
        </p>
        {DEVICE_TYPES.map((dt) => {
          const fyRows = cum.by_device_type[dt] ?? [];
          if (fyRows.length === 0) return null;
          return (
            <div key={dt} className="glass-card overflow-x-auto rounded-xl p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{dt}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                    <th className="p-2">Particulars</th>
                    {fyRows.map((r) => (
                      <th key={r.fy} className="p-2 text-right">{r.fy}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="p-2 text-slate-300">Cumulative purchased</td>
                    {fyRows.map((r) => (
                      <td key={r.fy} className="p-2 text-right text-slate-300">{n(r.cumulative_purchased)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="p-2 text-slate-300">Cumulative write-off</td>
                    {fyRows.map((r) => (
                      <td key={r.fy} className="p-2 text-right text-rose-400">{n(r.cumulative_written_off)}</td>
                    ))}
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="p-2 text-slate-400">% of write-off of cumulative</td>
                    {fyRows.map((r) => (
                      <td key={r.fy} className="p-2 text-right text-amber-300">{pct(r.pct_of_cumulative)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 text-slate-400" title="Cumulative write-off this year, as a % of LAST year's cumulative purchased base">
                      % of write-off of cumulative with (Y-1)
                    </td>
                    {fyRows.map((r) => (
                      <td key={r.fy} className="p-2 text-right text-amber-300">
                        {pct(r.pct_of_cumulative_vs_prior_year)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* ============ 3. Purchase-year cohort write-off mapping ============ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Purchase-year-wise Write-off Mapping
        </h2>
        {DEVICE_TYPES.map((dt) => {
          const rows = cohort.by_device_type[dt] ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={dt} className="glass-card overflow-x-auto rounded-xl p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase text-slate-500">{dt}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                    <th className="p-2">Purchase FY \ Written off by</th>
                    {cohort.closures.map((c) => (
                      <th key={c} className="p-2 text-right">FY {c} close</th>
                    ))}
                    <th className="p-2 text-right">Total purchased</th>
                    <th className="p-2 text-right">Active</th>
                    <th className="p-2 text-right">WO % to date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.cohort_fy} className="border-b border-white/5">
                      <td className="p-2 text-slate-200">{r.cohort_fy}</td>
                      {cohort.closures.map((c) => (
                        <td key={c} className="p-2 text-right text-rose-400">
                          {n(r.cumulative_written_off_by_closure[c] ?? 0)}
                        </td>
                      ))}
                      <td className="p-2 text-right text-slate-300">{n(r.total_purchased)}</td>
                      <td className="p-2 text-right text-emerald-300">{n(r.active)}</td>
                      <td className="p-2 text-right text-amber-300">{pct(r.written_off_pct_to_date)}</td>
                    </tr>
                  ))}
                  {/* Column totals */}
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    <td className="p-2 text-slate-200">TOTAL</td>
                    {cohort.closures.map((c) => (
                      <td key={c} className="p-2 text-right text-rose-300 tabular-nums">
                        {n(rows.reduce((s, r) => s + (r.cumulative_written_off_by_closure[c] ?? 0), 0))}
                      </td>
                    ))}
                    <td className="p-2 text-right text-white tabular-nums">
                      {n(rows.reduce((s, r) => s + r.total_purchased, 0))}
                    </td>
                    <td className="p-2 text-right text-emerald-300 tabular-nums">
                      {n(rows.reduce((s, r) => s + r.active, 0))}
                    </td>
                    <td className="p-2 text-right text-slate-500">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* ============ 4. Location-wise write-off ============ */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Location-wise View of Devices Written Off
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Assumption (not a stored business rule): &ldquo;recency&rdquo; = the device&apos;s
            last resolved recharge-expiry date relative to {loc.cutoff_date}. Tell me if your
            team defines before/after differently and I&apos;ll adjust the backend rule.
          </p>
        </div>
        {(() => {
          const fys = Array.from(new Set(loc.rows.map((r) => r.WRITEOFF_FY))).filter(Boolean).sort();
          const locations = ["Customer", "Partner", "WIOM"];
          const recencies = ["After_2025-04-01", "Before_2025-04-01", "No_Recharge_Found"];
          const get = (fy: string, location: string, recency: string) =>
            loc.rows.find((r) => r.WRITEOFF_FY === fy && r.LOCATION === location && r.RECENCY === recency)
              ?.DEVICE_COUNT ?? 0;
          const rowTotal = (fy: string) =>
            locations.reduce((s, l) => s + recencies.reduce((s2, r) => s2 + get(fy, l, r), 0), 0);
          const locationTotal = (fy: string, location: string) =>
            recencies.reduce((s, r) => s + get(fy, location, r), 0);

          return (
            <div className="glass-card overflow-x-auto rounded-xl p-5">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase text-slate-500">
                    <th className="p-2 text-left" rowSpan={2}>Write-off FY</th>
                    {locations.map((l) => (
                      <th key={l} className="p-2 text-center" colSpan={3}>{l}</th>
                    ))}
                    <th className="p-2 text-right" rowSpan={2}>Total write-off</th>
                    <th className="p-2 text-right" rowSpan={2}>Total of customer</th>
                    <th className="p-2 text-right" rowSpan={2}>WO % at customer</th>
                  </tr>
                  <tr className="border-b border-white/10 text-[10px] uppercase text-slate-600">
                    {locations.map((l) =>
                      recencies.map((r) => (
                        <th key={`${l}-${r}`} className="p-1 text-right font-normal">
                          {r.replace("_2025-04-01", "").replace(/_/g, " ")}
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fys.map((fy) => {
                    const total = rowTotal(fy);
                    const customerTotal = locationTotal(fy, "Customer");
                    return (
                      <tr key={fy} className="border-b border-white/5">
                        <td className="p-2 text-slate-200">{fy}</td>
                        {locations.map((l) =>
                          recencies.map((r) => (
                            <td key={`${l}-${r}`} className="p-2 text-right text-slate-300">
                              {n(get(fy, l, r))}
                            </td>
                          ))
                        )}
                        <td className="p-2 text-right font-semibold text-white">{n(total)}</td>
                        <td className="p-2 text-right text-slate-300">{n(customerTotal)}</td>
                        <td className="p-2 text-right text-amber-300">
                          {total ? pct(Math.round((1000 * customerTotal) / total) / 10) : "0%"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Column totals */}
                  {(() => {
                    const grandTotal = fys.reduce((s, fy) => s + rowTotal(fy), 0);
                    const grandCustomer = fys.reduce((s, fy) => s + locationTotal(fy, "Customer"), 0);
                    return (
                      <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                        <td className="p-2 text-slate-200">TOTAL</td>
                        {locations.map((l) =>
                          recencies.map((r) => (
                            <td key={`${l}-${r}`} className="p-2 text-right text-slate-200 tabular-nums">
                              {n(fys.reduce((s, fy) => s + get(fy, l, r), 0))}
                            </td>
                          ))
                        )}
                        <td className="p-2 text-right text-white tabular-nums">{n(grandTotal)}</td>
                        <td className="p-2 text-right text-slate-300 tabular-nums">{n(grandCustomer)}</td>
                        <td className="p-2 text-right text-amber-300 tabular-nums">
                          {grandTotal ? pct(Math.round((1000 * grandCustomer) / grandTotal) / 10) : "0%"}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
