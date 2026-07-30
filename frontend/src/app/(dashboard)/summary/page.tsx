"use client";

import { useEffect, useState } from "react";
import { api, AgeingMatrix, ExecutiveKpis, InventoryBreakdown, PartnerSummaryResponse } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useGlobalFilters } from "@/components/GlobalFilters";

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function n(value: number): string {
  return value.toLocaleString("en-IN");
}

function Num({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" | "warning" | "success" }) {
  const toneClasses: Record<string, string> = {
    default: "text-[#6f97ff]",
    danger: "text-rose-400",
    warning: "text-amber-300",
    success: "text-emerald-300",
  };
  return <span className={`font-semibold tabular-nums ${toneClasses[tone]}`}>{children}</span>;
}

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
  const [error, setError] = useState<string | null>(null);
  const { queryString } = useGlobalFilters();

  useEffect(() => {
    setKpis(null);
    setInventory(null);
    setAgeing(null);
    setPartners(null);
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

  return (
    <div className="space-y-6 p-8">
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Router Recovery Command Center &middot; equivalent
        </div>
        <h1 className="brand-gradient-text text-3xl font-bold">Fleet Summary</h1>
        <p className="mt-1 text-sm text-slate-500">
          As of {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
          {" "}&middot; live from PROD_DB.DBT_INVENTORY_REQUEST.INVENTORY_MODEL, deduplicated
        </p>
      </div>

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

        <Section eyebrow="Partners & CSP" title="Who the field fleet is attributed to">
          <Num>{n(partners.leaderboard.total_partners)}</Num> partners have devices attributed to them
          at some point, together accounting for <Num>{n(partners.kpis.total_devices)}</Num> devices (
          {pct(partners.kpis.total_devices, kpis.TOTAL_DEVICES)} of the whole fleet). Of these partners,{" "}
          <Num tone="success">{n(cspCount)}</Num> are live CSPs today and{" "}
          <Num tone="warning">{n(exCspCount)}</Num>{" "}are ex-CSP &mdash; churned or never onboarded to the
          gateway, but still carrying device history. See the Partners &amp; CSP tab for the
          per-partner breakdown.
        </Section>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
          Bottom line
        </div>
        <p className="text-sm leading-relaxed text-slate-300">
          Out of <Num>{n(kpis.TOTAL_DEVICES)}</Num> total devices, roughly{" "}
          <Num tone="danger">{pct(aged365 + kpis.LOST + kpis.WRITTEN_OFF, kpis.TOTAL_DEVICES)}</Num>{" "}
          of the fleet is either aged past a year, lost, or written off &mdash; the segment finance
          should treat as effectively unrecoverable unless a specific reactivation effort targets it.
          The remaining{" "}
          <Num tone="success">{pct(kpis.RECHARGE_ACTIVE, kpis.TOTAL_DEVICES)}</Num> active
          base is healthy and generating recharge revenue today.
        </p>
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
