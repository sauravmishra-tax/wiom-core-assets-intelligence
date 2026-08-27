"use client";

import { useEffect, useState } from "react";
import { api, AgeingMatrix, ExecutiveKpis, InventoryBreakdown, LocationDeviceMatrix, PartnerSummaryResponse } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useGlobalFilters } from "@/components/GlobalFilters";
import { n, pct, Num, StatCard, HighlightTag, KeyHighlights, DeviceCostBanner, useDeviceCost, fmtCr } from "@/components/Highlights";

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
        {eyebrow}
      </div>
      <h2 className="mb-3 text-lg font-bold text-white">{title}</h2>
      <p className="text-sm leading-relaxed text-slate-300">{children}</p>
    </div>
  );
}

export default function SummaryPage() {
  const [kpis, setKpis] = useState<ExecutiveKpis | null>(null);
  const [inventory, setInventory] = useState<InventoryBreakdown | null>(null);
  const [ageing, setAgeing] = useState<AgeingMatrix | null>(null);
  const [partners, setPartners] = useState<PartnerSummaryResponse | null>(null);
  const [location, setLocation] = useState<LocationDeviceMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();
  const [deviceCost, setDeviceCost] = useDeviceCost();

  useEffect(() => {
    setKpis(null);
    setInventory(null);
    setAgeing(null);
    setPartners(null);
    setLocation(null);
    Promise.all([
      api.executiveKpis(queryString),
      api.inventoryBreakdown(queryString),
      api.ageingMatrix(queryString),
      api.partnerSummary(5000, queryString),
    ])
      .then(([k, i, a, p]) => {
        setKpis(k);
        setInventory(i);
        setAgeing(a);
        setPartners(p);
      })
      .catch((e) => setError(String(e.message ?? e)));
    api.locationDeviceMatrix(queryString).then(setLocation).catch(() => {});
  }, [queryString]);

  if (error) return <ErrorBanner message={error} />;
  if (!kpis || !inventory || !ageing || !partners) {
    return <div className="p-8 text-slate-500">Loading...</div>;
  }

  const aged180 = kpis.AGED_180_PLUS;
  const aged365 = kpis.AGED_365_PLUS;
  const noHistory = ageing.totals_by_bucket["no_recharge_history"] ?? 0;
  const custodied = kpis.CUSTODIED;
  const writtenOffPct = pct(kpis.WRITTEN_OFF, kpis.TOTAL_DEVICES);
  const lostPct = pct(kpis.LOST, kpis.TOTAL_DEVICES);

  const inTransitBackToWiom =
    kpis.CUSTOMER_RECOVERY_PENDING + kpis.RETRIEVAL_PENDING + kpis.PENDING_CSP_RECEIPT + kpis.RTO_INITIATED;
  const cspCount = partners.leaderboard.rows.filter((r) => r.CSP_STATUS === "CSP").length;
  const exCspCount = partners.leaderboard.total_partners - cspCount;

  // 180-364 days = "at risk but not yet write-off territory" - the mid-band
  // between the 180+ and 365+ thresholds, not called out anywhere else on
  // this page today.
  const aged180to364 = aged180 - aged365;
  const custodyIdlePool = custodied + kpis.IDLE;
  const topPartner = partners.leaderboard.rows.reduce(
    (max, r) => (r.TOTAL_DEVICES > (max?.TOTAL_DEVICES ?? 0) ? r : max),
    partners.leaderboard.rows[0]
  );

  return (
    <div className="space-y-6 p-8">
      <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-[#ff6fd8]/10 to-transparent p-5">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
          Fleet Summary
        </div>
        <h1 className="brand-gradient-text text-2xl font-bold">Where The Fleet Stands, And What It Costs</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
          As of {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
          {" "}&middot; live from PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL, deduplicated. For the
          full arithmetic proof behind every total, see{" "}
          <span className="text-slate-200">Executive</span>.
        </p>
      </div>

      <DeviceCostBanner cost={deviceCost} onChange={setDeviceCost} />

      {/* Headline numbers -- label / big value / % context / comparison, never a bare number */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total Fleet"
          value={n(kpis.TOTAL_DEVICES)}
          sub="devices end-to-end"
          foot={`${n(kpis.DISPATCHED)} dispatched, ${n(kpis.FRESH_GRN)} still fresh GRN`}
        />
        <StatCard
          label="Recharge Active"
          value={n(kpis.RECHARGE_ACTIVE)}
          tone="success"
          sub={`${pct(kpis.RECHARGE_ACTIVE, kpis.TOTAL_DEVICES)} of fleet`}
          foot="generating revenue today"
        />
        <StatCard
          label="Stuck Capital (365+)"
          value={fmtCr(aged365, deviceCost)}
          tone="danger"
          sub={`${n(aged365)} devices, ${pct(aged365, kpis.TOTAL_DEVICES)} of fleet`}
          foot="candidate pool for write-off"
        />
        <StatCard
          label="Lost + Written Off"
          value={fmtCr(kpis.LOST + kpis.WRITTEN_OFF, deviceCost)}
          tone="danger"
          sub={`${n(kpis.LOST + kpis.WRITTEN_OFF)} devices, ${pct(kpis.LOST + kpis.WRITTEN_OFF, kpis.TOTAL_DEVICES)} of fleet`}
          foot={`${n(kpis.LOST)} lost, ${n(kpis.WRITTEN_OFF)} written off`}
        />
        <StatCard
          label="Mid-Recovery"
          value={n(inTransitBackToWiom)}
          tone="warning"
          sub={`${pct(inTransitBackToWiom, kpis.TOTAL_DEVICES)} of fleet`}
          foot="on its way back to WIOM, not stuck"
        />
      </div>

      <KeyHighlights
        items={[
          <>
            <Num>{n(kpis.TOTAL_DEVICES)}</Num> devices are tracked end-to-end, of which{" "}
            <Num tone="success">{n(kpis.RECHARGE_ACTIVE)}</Num> ({pct(kpis.RECHARGE_ACTIVE, kpis.TOTAL_DEVICES)})
            have an active recharge right now <HighlightTag good />.
          </>,
          <>
            <Num tone="danger">{n(aged365)}</Num> devices ({pct(aged365, kpis.TOTAL_DEVICES)}) have been
            past recharge expiry for over a <strong>full year</strong>, worth{" "}
            <Num tone="danger">{fmtCr(aged365, deviceCost)}</Num> at the device cost above &mdash; the
            pool least likely to ever be physically recovered <HighlightTag good={false} />.
          </>,
          <>
            <Num tone="danger">{n(kpis.LOST + kpis.WRITTEN_OFF)}</Num> devices (
            {pct(kpis.LOST + kpis.WRITTEN_OFF, kpis.TOTAL_DEVICES)}, worth{" "}
            <Num tone="danger">{fmtCr(kpis.LOST + kpis.WRITTEN_OFF, deviceCost)}</Num>) are already lost
            or financially written off &mdash; treat as effectively gone unless a specific reactivation
            effort targets them.
          </>,
          <>
            <Num tone="warning">{n(inTransitBackToWiom)}</Num> devices are actively mid-recovery (pending
            pickup, retrieval, or RTO) &mdash; not stuck, but worth watching so they don&apos;t silently age
            into the 365+ bucket above.
          </>,
          <>
            Another <Num tone="warning">{n(aged180to364)}</Num> devices ({pct(aged180to364, kpis.TOTAL_DEVICES)}
            ) sit in the 180&ndash;364 day band &mdash; already at-risk, not yet in write-off territory.
            That&apos;s the pool to chase before it becomes next quarter&apos;s 365+ number.
          </>,
          <>
            <Num tone="danger">{n(kpis.RECHARGE_EXPIRED)}</Num> devices ({pct(kpis.RECHARGE_EXPIRED, kpis.TOTAL_DEVICES)}
            ) have a lapsed recharge &mdash; nearly{" "}
            <Num tone="danger">
              {(kpis.RECHARGE_EXPIRED / Math.max(kpis.RECHARGE_ACTIVE, 1)).toFixed(1)}&times;
            </Num>{" "}
            the active base, and growing every day a device sits unrecovered.
          </>,
          <>
            <Num tone="warning">{n(custodyIdlePool)}</Num> devices ({pct(custodyIdlePool, kpis.TOTAL_DEVICES)}
            ) are recovered but not yet back in the field &mdash; <Num>{n(custodied)}</Num> in custody,{" "}
            <Num>{n(kpis.IDLE)}</Num> idle. Redeployable capital sitting on the shelf.
          </>,
          topPartner && (
            <>
              The single largest partner (<span className="font-mono text-slate-200">
                {topPartner.PARTNER_NAME ?? topPartner.PARTNER_ACCOUNT_ID}
              </span>) holds <Num tone="warning">{n(topPartner.TOTAL_DEVICES)}</Num> devices (
              {pct(topPartner.TOTAL_DEVICES, kpis.TOTAL_DEVICES)} of the whole fleet) &mdash; a
              concentration worth knowing about before any partner-side policy change.
            </>
          ),
          <>
            Of <Num>{n(partners.leaderboard.total_partners)}</Num> CSPs ever attributed devices,{" "}
            <Num tone="success">{n(cspCount)}</Num> are live CSPs today and{" "}
            <Num tone="warning">{n(exCspCount)}</Num> are ex-CSP &mdash; churned or never onboarded, but
            still carrying device history.
          </>,
          <>
            Bottom line: roughly{" "}
            <Num tone="danger">{pct(aged365 + kpis.LOST + kpis.WRITTEN_OFF, kpis.TOTAL_DEVICES)}</Num> of
            the fleet (
            <Num tone="danger">{fmtCr(aged365 + kpis.LOST + kpis.WRITTEN_OFF, deviceCost)}</Num>) is aged
            past a year, lost, or written off, while{" "}
            <Num tone="success">{pct(kpis.RECHARGE_ACTIVE, kpis.TOTAL_DEVICES)}</Num> is active and
            generating revenue today.
          </>,
        ].filter(Boolean)}
      />

      {location && (() => {
        const liveRows = location.detail.filter((r) => r.LIFECYCLE === "LIVE");
        const dt = Array.from(new Set(liveRows.map((r) => r.DEVICE_TYPE_NORMALIZED))).sort();
        const matrix: Record<string, Record<string, number>> = {};
        for (const row of liveRows) {
          matrix[row.LOCATION_4WAY] ??= {};
          matrix[row.LOCATION_4WAY][row.DEVICE_TYPE_NORMALIZED] =
            (matrix[row.LOCATION_4WAY][row.DEVICE_TYPE_NORMALIZED] ?? 0) + row.DEVICE_COUNT;
        }
        const rowTotal = (loc: string) => dt.reduce((s, t) => s + (matrix[loc]?.[t] ?? 0), 0);
        const grand = location.location_order.reduce((s, loc) => s + rowTotal(loc), 0);

        // Second table: same 4 locations, but for devices whose CURRENT
        // status is Written-off or Lost. HOLDER_BUCKET on a written-off/lost
        // device reflects wherever it was LAST recorded (e.g. "Customer"
        // here means the device was written off while still marked as
        // installed with a customer, not that it's a live customer install)
        // - that's the useful signal: which channel a write-off traces back to.
        const woLostRows = location.detail.filter((r) => r.LIFECYCLE !== "LIVE");
        const woLostDt = Array.from(new Set(woLostRows.map((r) => r.DEVICE_TYPE_NORMALIZED))).sort();
        const woLostMatrix: Record<string, { WRITTEN_OFF: number; LOST: number }> = {};
        const woLostTypeMatrix: Record<string, Record<string, number>> = {};
        for (const row of woLostRows) {
          woLostMatrix[row.LOCATION_4WAY] ??= { WRITTEN_OFF: 0, LOST: 0 };
          woLostMatrix[row.LOCATION_4WAY][row.LIFECYCLE as "WRITTEN_OFF" | "LOST"] += row.DEVICE_COUNT;
          woLostTypeMatrix[row.LOCATION_4WAY] ??= {};
          woLostTypeMatrix[row.LOCATION_4WAY][row.DEVICE_TYPE_NORMALIZED] =
            (woLostTypeMatrix[row.LOCATION_4WAY][row.DEVICE_TYPE_NORMALIZED] ?? 0) + row.DEVICE_COUNT;
        }
        const woLostRowTotal = (loc: string) =>
          (woLostMatrix[loc]?.WRITTEN_OFF ?? 0) + (woLostMatrix[loc]?.LOST ?? 0);
        const woLostGrand = location.location_order.reduce((s, loc) => s + woLostRowTotal(loc), 0);
        const woGrand = location.location_order.reduce((s, loc) => s + (woLostMatrix[loc]?.WRITTEN_OFF ?? 0), 0);
        const lostGrand = location.location_order.reduce((s, loc) => s + (woLostMatrix[loc]?.LOST ?? 0), 0);

        return (
          <>
            <div className="glass-card overflow-x-auto rounded-xl p-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">
                Devices by Location &times; Type
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Live devices only (excludes written-off/lost &mdash; see the table below for those)
                &mdash; Customer, CSP (live partner), Ex-CSP (churned/never onboarded), Wiom Warehouse,
                and Other for anything that resolves to none of those.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">Location</th>
                    {dt.map((t) => (
                      <th key={t} className="p-2 text-right text-xs font-medium uppercase text-slate-500">
                        {t}
                      </th>
                    ))}
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-200">Total</th>
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-500">% of Live Fleet</th>
                  </tr>
                </thead>
                <tbody>
                  {location.location_order
                    .filter((loc) => rowTotal(loc) > 0)
                    .map((loc) => (
                      <tr key={loc} className="border-b border-white/5">
                        <td className="p-2 text-xs font-medium text-slate-300">
                          {location.location_labels[loc] ?? loc}
                        </td>
                        {dt.map((t) => (
                          <td key={t} className="p-2 text-right text-xs tabular-nums text-slate-300">
                            {n(matrix[loc]?.[t] ?? 0)}
                          </td>
                        ))}
                        <td className="p-2 text-right text-xs font-bold tabular-nums text-white">
                          {n(rowTotal(loc))}
                        </td>
                        <td className="p-2 text-right text-xs tabular-nums text-slate-500">
                          {pct(rowTotal(loc), grand)}
                        </td>
                      </tr>
                    ))}
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    <td className="p-2 text-xs uppercase text-slate-300">Total</td>
                    {dt.map((t) => (
                      <td key={t} className="p-2 text-right text-xs tabular-nums text-slate-200">
                        {n(location.location_order.reduce((s, loc) => s + (matrix[loc]?.[t] ?? 0), 0))}
                      </td>
                    ))}
                    <td className="p-2 text-right text-xs font-bold tabular-nums text-white">{n(grand)}</td>
                    <td className="p-2 text-right text-xs tabular-nums text-slate-300">100.0%</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-3.5 text-xs leading-relaxed text-slate-400">
                <strong className="text-slate-300">How the location mapping works:</strong> every device
                resolves to exactly one of these 4 (or Other) &mdash;
                <ul className="ml-4 mt-1.5 list-disc space-y-1">
                  <li>
                    <strong className="text-slate-300">Customer</strong> ({n(rowTotal("customer"))}) &mdash;
                    HOLDER_BUCKET = customer (installed/recovery-pending with a customer account).
                  </li>
                  <li>
                    <strong className="text-slate-300">CSP</strong> ({n(rowTotal("csp"))}) &mdash; with a
                    partner (HOLDER_BUCKET = partner) <em>and</em> that partner has a live, verified row
                    in the CSP gateway&apos;s account table today.
                  </li>
                  <li>
                    <strong className="text-slate-300">Ex-CSP</strong> ({n(rowTotal("ex_csp"))}) &mdash;
                    same partner-holder condition, but that partner has churned or was never onboarded to
                    the gateway &mdash; no live CSP account row.
                  </li>
                  <li>
                    <strong className="text-slate-300">Wiom Warehouse</strong> ({n(rowTotal("wiom_warehouse"))})
                    &mdash; HOLDER_BUCKET is wiom_warehouse (never dispatched) or returned_to_wiom
                    (dispatched, since come back), folded into one row here.
                  </li>
                  <li>
                    <strong className="text-slate-300">Other</strong> ({n(rowTotal("other"))}) &mdash; the
                    genuine residual: a device with no matching row in the source status/location table
                    <em>and</em> a recorded dispatch (so it can&apos;t be assumed to still be in a Wiom
                    warehouse either). Should stay near-zero.
                  </li>
                </ul>
                <p className="mt-2">
                  Written-off and Lost devices are excluded from every row above (that&apos;s the table
                  below) &mdash; so this table&apos;s {n(grand)} total plus the {n(woLostGrand)}{" "}
                  Written-off + Lost devices in the table below add up to {n(grand + woLostGrand)}, the
                  full Total Fleet. Full definitions on the{" "}
                  <span className="text-slate-300">Schema &amp; Methodology</span> page.
                </p>
              </div>
            </div>

            <div className="glass-card overflow-x-auto rounded-xl border border-rose-500/15 p-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">
                Lost &amp; Written-off, by Location{" "}
                <span className="text-xs font-normal text-slate-500">(for information)</span>
              </h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-2 text-left text-xs font-medium uppercase text-slate-500">Location</th>
                    {woLostDt.map((t) => (
                      <th key={t} className="p-2 text-right text-xs font-medium uppercase text-slate-500">
                        {t}
                      </th>
                    ))}
                    <th className="p-2 text-right text-xs font-medium uppercase text-rose-300">Written Off</th>
                    <th className="p-2 text-right text-xs font-medium uppercase text-rose-400">Lost</th>
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-200">Total</th>
                    <th className="p-2 text-right text-xs font-medium uppercase text-slate-500">% of Lost + WO</th>
                  </tr>
                </thead>
                <tbody>
                  {location.location_order
                    .filter((loc) => woLostRowTotal(loc) > 0)
                    .map((loc) => (
                      <tr key={loc} className="border-b border-white/5">
                        <td className="p-2 text-xs font-medium text-slate-300">
                          {location.location_labels[loc] ?? loc}
                        </td>
                        {woLostDt.map((t) => (
                          <td key={t} className="p-2 text-right text-xs tabular-nums text-slate-400">
                            {n(woLostTypeMatrix[loc]?.[t] ?? 0)}
                          </td>
                        ))}
                        <td className="p-2 text-right text-xs tabular-nums text-slate-300">
                          {n(woLostMatrix[loc]?.WRITTEN_OFF ?? 0)}
                        </td>
                        <td className="p-2 text-right text-xs tabular-nums text-slate-300">
                          {n(woLostMatrix[loc]?.LOST ?? 0)}
                        </td>
                        <td className="p-2 text-right text-xs font-bold tabular-nums text-white">
                          {n(woLostRowTotal(loc))}
                        </td>
                        <td className="p-2 text-right text-xs tabular-nums text-slate-500">
                          {pct(woLostRowTotal(loc), woLostGrand)}
                        </td>
                      </tr>
                    ))}
                  <tr className="border-t-2 border-white/20 bg-white/5 font-bold">
                    <td className="p-2 text-xs uppercase text-slate-300">Total</td>
                    {woLostDt.map((t) => (
                      <td key={t} className="p-2 text-right text-xs tabular-nums text-slate-200">
                        {n(location.location_order.reduce((s, loc) => s + (woLostTypeMatrix[loc]?.[t] ?? 0), 0))}
                      </td>
                    ))}
                    <td className="p-2 text-right text-xs tabular-nums text-slate-200">{n(woGrand)}</td>
                    <td className="p-2 text-right text-xs tabular-nums text-slate-200">{n(lostGrand)}</td>
                    <td className="p-2 text-right text-xs font-bold tabular-nums text-white">
                      {n(woLostGrand)}
                    </td>
                    <td className="p-2 text-right text-xs tabular-nums text-slate-300">100.0%</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                <strong className="text-slate-400">How to read this:</strong> the &quot;Location&quot;
                column here is the device&apos;s <em>last known</em> location before it was marked lost
                or written off &mdash; not where it physically is today. A device shown under
                &quot;Customer&quot; means it was still recorded as installed with a customer at the
                point it got written off (most commonly: never physically recovered after churn). A
                device under &quot;CSP&quot;/&quot;Ex-CSP&quot; means the same, but for a partner-held
                device. This table is informational only &mdash; it doesn&apos;t add to the Live-fleet
                table above (that one explicitly excludes these {n(woLostGrand)} devices), and the{" "}
                {n(woGrand)} + {n(lostGrand)} split here matches the &quot;Lost + Written Off&quot; total
                on the Key Highlights above and the verified equation on the Executive page.
              </p>

              {location.financial_wo_by_lifecycle && (() => {
                const fw = location.financial_wo_by_lifecycle;
                const totalFinancialWo = fw.LIVE + fw.LOST + fw.WRITTEN_OFF;
                return (
                  <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs leading-relaxed text-amber-200/90">
                    <strong className="text-amber-300">Finance vs. Ops mismatch, fleet-wide:</strong>{" "}
                    {n(totalFinancialWo)} devices have a financial write-off date recorded by Finance.
                    Only <Num>{n(fw.WRITTEN_OFF)}</Num> of those are also operationally marked
                    WRITTEN_OFF &mdash; the expected, clean overlap. The other{" "}
                    <Num tone="danger">{n(fw.LIVE)}</Num> are still showing as a{" "}
                    <strong className="text-slate-200">live</strong>, in-service device (in the table
                    above, not this one) even though Finance already booked the loss, and{" "}
                    <Num tone="warning">{n(fw.LOST)}</Num> more are marked LOST (not WRITTEN_OFF) with a
                    financial write-off already recorded &mdash; not wrong exactly (a lost device
                    getting financially written off is expected), just worth knowing it doesn&apos;t
                    show up under the WRITTEN_OFF status. The <Num tone="danger">{n(fw.LIVE)}</Num>{" "}
                    still-live figure is the one worth a Finance/Ops reconciliation pass &mdash; those
                    are devices being treated as active inventory that accounting has already written
                    off.
                  </div>
                );
              })()}
            </div>
          </>
        );
      })()}

      <div className="grid gap-5 lg:grid-cols-2">
        <Section eyebrow="Fleet size" title="Where the whole fleet stands today">
          WIOM currently manages <Num>{n(kpis.TOTAL_DEVICES)}</Num> devices end-to-end. Of these,{" "}
          <Num tone="success">{n(kpis.FRESH_GRN)}</Num> ({pct(kpis.FRESH_GRN, kpis.TOTAL_DEVICES)}) are
          fresh inbound stock that has never left a warehouse, while{" "}
          <Num>{n(kpis.DISPATCHED)}</Num> ({pct(kpis.DISPATCHED, kpis.TOTAL_DEVICES)}) have been
          dispatched into the field at some point. A further{" "}
          <Num>{n(kpis.NEVER_DISPATCHED)}</Num> sit in WIOM warehouses having never been sent out at
          all.
        </Section>

        <Section eyebrow="Current custody" title="Who is holding the devices right now">
          Of the dispatched fleet, <Num tone="success">{n(kpis.CUSTOMER_DEVICES)}</Num> devices (
          {pct(kpis.CUSTOMER_DEVICES, kpis.TOTAL_DEVICES)}) are installed with customers,{" "}
          <Num tone="warning">{n(kpis.PARTNER_DEVICES)}</Num> ({pct(kpis.PARTNER_DEVICES, kpis.TOTAL_DEVICES)})
          sit with partners, and <Num>{n(kpis.RETURNED_DEVICES)}</Num>{" "}
          have made their way back to a WIOM warehouse after being out in the field. Migrated-CSP
          vs. old-partner split isn&apos;t
          resolvable from this table alone yet &mdash; see Known Gaps.
        </Section>

        <Section eyebrow="Recharge health" title="Active vs. lapsed connections">
          <Num tone="success">{n(kpis.RECHARGE_ACTIVE)}</Num> devices ({pct(kpis.RECHARGE_ACTIVE, kpis.TOTAL_DEVICES)})
          have an active recharge today. <Num tone="danger">{n(kpis.RECHARGE_EXPIRED)}</Num> have a
          lapsed plan, and a further <Num>{n(noHistory)}</Num>{" "}
          show no recharge history at all in this table (likely never activated, or activated
          through a system this table doesn&apos;t cover).
        </Section>

        <Section eyebrow="Ageing risk" title="How long recovery has been pending">
          <Num tone="warning">{n(aged180)}</Num> devices ({pct(aged180, kpis.TOTAL_DEVICES)}) have been
          past their recharge expiry for over 180 days, and within that,{" "}
          <Num tone="danger">{n(aged365)}</Num> ({pct(aged365, kpis.TOTAL_DEVICES)}) have been aged
          past a full year &mdash; this is the pool most at risk of never being recovered and the
          natural candidate list for write-off review.
        </Section>

        <Section eyebrow="Loss & write-off" title="What's already been given up on">
          <Num tone="danger">{n(kpis.LOST)}</Num> devices ({lostPct}) are marked lost and{" "}
          <Num tone="danger">{n(kpis.WRITTEN_OFF)}</Num> ({writtenOffPct}) have been financially
          written off. Separately, <Num tone="warning">{n(custodied)}</Num> devices are held in
          custody (typically post-recovery, pre-redeployment) and <Num tone="warning">{n(kpis.IDLE)}</Num>{" "}
          are idle with no active assignment.
        </Section>

        <Section eyebrow="Inbound" title="What's newly arriving">
          <Num tone="success">{n(inventory.by_source["fresh_grn"] ?? 0)}</Num> devices have arrived as
          fresh GRN, against <Num>{n(inventory.by_source["ssot_csp"] ?? 0)}</Num> already tracked
          through the SSOT/CSP system and <Num>{n(inventory.by_source["other"] ?? 0)}</Num> from
          older or manual data sources that predate the current pipeline.
        </Section>

        <Section eyebrow="Recovery pipeline" title="What's already on its way back to WIOM">
          Separate from the ageing/lost/written-off pools above, <Num tone="warning">{n(inTransitBackToWiom)}</Num>{" "}
          devices are actively mid-recovery right now: <Num>{n(kpis.CUSTOMER_RECOVERY_PENDING)}</Num> pending
          pickup from a customer, <Num>{n(kpis.RETRIEVAL_PENDING)}</Num> pending retrieval from a partner,{" "}
          <Num>{n(kpis.PENDING_CSP_RECEIPT)}</Num> awaiting CSP-side receipt confirmation, and{" "}
          <Num>{n(kpis.RTO_INITIATED)}</Num>{" "}with an RTO already initiated. These aren&apos;t stuck &mdash;
          they&apos;re in progress &mdash; but the pool is worth tracking so it doesn&apos;t silently age
          into the 180+/365+ risk buckets above.
        </Section>

        <Section eyebrow="CSP Summary" title="Who the field fleet is attributed to">
          <Num>{n(partners.leaderboard.total_partners)}</Num> CSPs have devices attributed to them
          at some point, together accounting for <Num>{n(partners.kpis.total_devices)}</Num> devices (
          {pct(partners.kpis.total_devices, kpis.TOTAL_DEVICES)} of the whole fleet). Of these,{" "}
          <Num tone="success">{n(cspCount)}</Num> are live CSPs today and{" "}
          <Num tone="warning">{n(exCspCount)}</Num>{" "}are ex-CSP &mdash; churned or never onboarded to the
          gateway, but still carrying device history. See the CSP Summary tab for the
          per-CSP breakdown.
        </Section>
      </div>

      <div className="glass-card rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-6">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
          Known gaps &mdash; read before trusting a number blindly
        </div>
        <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-300">
          <li>
            <Num>{n(kpis.UNKNOWN_HOLDER)}</Num> devices ({pct(kpis.UNKNOWN_HOLDER, kpis.TOTAL_DEVICES)}) have
            no resolvable holder at all (not with a customer, partner, or WIOM warehouse) &mdash; split{" "}
            {n(kpis.UNKNOWN_HOLDER_FRESH_GRN)} fresh GRN / {n(kpis.UNKNOWN_HOLDER_SSOT_CSP)} SSOT-CSP /{" "}
            {n(kpis.UNKNOWN_HOLDER_OTHER_SOURCE)}{" "}other-source. Excluded from every &quot;current custody&quot;
            percentage above.
          </li>
          <li>
            <Num>{n(kpis.STATUS_UNKNOWN + kpis.OTHER_STATUS)}</Num>{" "}devices carry a status this table
            doesn&apos;t map to one of the named buckets above &mdash; see the Executive dashboard&apos;s
            status breakdown for the full list of what&apos;s in that residual.
          </li>
          <li>
            Asset Register (purchase/write-off by fiscal year) only has data from{" "}
            <span className="font-semibold text-slate-200">27 Apr 2024</span>{" "}onward in this table &mdash;
            earlier fiscal years shown there are necessarily incomplete, not zero.
          </li>
          <li>
            Recharge-based numbers (Active / Expired / No history) reflect the recharge table as of the
            last cache refresh, not this exact second &mdash; check the Refresh button&apos;s last-synced
            time if the figures look stale.
          </li>
        </ul>
      </div>
    </div>
  );
}
