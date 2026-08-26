"use client";

import { useEffect, useState } from "react";
import { api, SchemaConfig } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { isAdmin } from "@/components/AuthGate";

const HINTS: Record<string, string> = {
  grn_dedup: "Deduplicates INVENTORY_MODEL by MAC against PNM%-prefixed shadow records. Feeds Fresh GRN / SSOT & CSP / Other.",
  status_location: "Derives normalized status + holder (wiom / partner / customer) from raw T_DEVICE. Drives every status/holder number in the app.",
  recharge_expiry: "Last recharge expiry per device from T_DEVICE x T_ROUTER_USER_MAPPING. Drives every ageing bucket in the app.",
  status_normalized_expr: "Cleans up blank/typo status values from status_location before display.",
  holder_bucket_expr: "Splits the 3-way location (wiom/partner/customer) into the 4 holder buckets used across dashboards, using dispatch history.",
  dispatch_bucket_expr: "Never-dispatched vs dispatched, from FIRST_DISPATCHED_DATE.",
  grn_source_bucket_expr: "Fresh GRN / SSOT & CSP / Other, from DATA_SOURCE.",
  device_type_normalized_expr: "Collapses DEVICE_TYPE into ONT / Router / Unknown (drops the 'Invalid' data-quality bucket).",
  aging_bucket_expr: "The 11 ageing buckets (active, 0-15 ... 365+), computed from the resolved recharge expiry.",
  invoice_date_expr: "Purchase/invoice date, pulled from the FIRST_GRN_DETAIL JSON blob (only ~61% of devices have this).",
  invoice_number_expr: "Purchase/invoice number, same JSON source as invoice date.",
  write_off_date_expr: "Best-effort write-off date - no dedicated column exists, so this falls back through STATUS_UPDATED_AT then a ticket-resolution timestamp.",
};

const KIND_LABELS: Record<string, string> = {
  statement: "Base queries (joined into the pipeline)",
  expression: "Derived expressions (spliced inline)",
};

// ---------------------------------------------------------------------
// Methodology tab -- plain-English "where does this number come from"
// documentation. Visible to everyone; the Edit SQL tab below is admin-only.
// ---------------------------------------------------------------------
function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
        {eyebrow}
      </div>
      <h2 className="mb-3 text-lg font-bold text-white">{title}</h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-slate-300">{children}</div>
    </div>
  );
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="font-mono text-xs font-bold text-[#6f97ff]">{term}</div>
      <div className="mt-1 text-xs leading-relaxed text-slate-400">{children}</div>
    </div>
  );
}

function SourceRow({
  table,
  purpose,
  fields,
}: {
  table: string;
  purpose: string;
  fields: string;
}) {
  return (
    <div className="border-b border-white/5 py-2.5 last:border-0">
      <div className="font-mono text-xs font-semibold text-emerald-300">{table}</div>
      <div className="mt-0.5 text-xs text-slate-400">{purpose}</div>
      <div className="mt-0.5 font-mono text-[11px] text-slate-600">{fields}</div>
    </div>
  );
}

function MethodologyTab({ onEditSql }: { onEditSql: () => void }) {
  const [dq, setDq] = useState<{
    total_rows_before_id_filter: number;
    blank_device_id_rows_excluded: number;
    note: string;
  } | null>(null);

  useEffect(() => {
    api.dataQuality().then(setDq).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <Card eyebrow="1 &middot; Base Pipeline" title="How every device row is built">
        <p>
          Everything starts from <code className="font-mono text-emerald-300">PROD_DB.PUBLIC.INVENTORY_MODEL</code>,
          run through four chained steps (each independently editable in the{" "}
          <button onClick={onEditSql} className="text-[#ff6fd8] underline underline-offset-2">
            Edit SQL
          </button>{" "}
          tab &mdash; admin only):
        </p>
        <ol className="ml-4 list-decimal space-y-2 pl-2">
          <li>
            <strong className="text-slate-200">Dedup</strong> &mdash; one row per physical device. A
            MAC-keyed anti-join drops any row that shares a MAC_ID with a{" "}
            <code className="font-mono text-xs">PNM%</code>-prefixed shadow record, so the same
            physical device never gets counted twice.
          </li>
          <li>
            <strong className="text-slate-200">Status &amp; Location</strong> &mdash; joins raw{" "}
            <code className="font-mono text-xs">T_DEVICE</code> to resolve each device&apos;s current
            status (mapped from source values like <code className="font-mono text-xs">SALE_TO_PARTNER</code>{" "}
            &rarr; <code className="font-mono text-xs">WRITTEN_OFF</code>) and holder location.
          </li>
          <li>
            <strong className="text-slate-200">Recharge Expiry</strong> &mdash; joins{" "}
            <code className="font-mono text-xs">T_DEVICE</code> to{" "}
            <code className="font-mono text-xs">T_ROUTER_USER_MAPPING</code> on NAS ID, taking the max
            OTP-verified expiry &mdash; this drives every Ageing Bucket on the app.
          </li>
          <li>
            <strong className="text-slate-200">Enrichment</strong> &mdash; the three joins above,
            plus write-off dates from{" "}
            <code className="font-mono text-xs">FINANCIAL_WRITE_OFF_DEVICES</code>, combine into the
            final <code className="font-mono text-emerald-300">enriched</code> view every page queries.
          </li>
        </ol>
      </Card>

      <Card eyebrow="2 &middot; Data Sources" title="Tables behind each part of the app">
        <SourceRow
          table="PROD_DB.PUBLIC.INVENTORY_MODEL"
          purpose="Base device list — GRN, invoice, dispatch, install history"
          fields="DEVICE_ID, MAC_ID, INVOICE_DATE_FINANCE, FIRST_DISPATCHED_DATE, DATA_SOURCE ..."
        />
        <SourceRow
          table="PROD_DB.DBT_INVENTORY_REQUEST.T_DEVICE"
          purpose="Current status + location — feeds Status Normalization and Holder Bucket"
          fields="STATUS, LCO_ACCOUNT_ID, USER_ACCOUNT_ID, CONNECTION_ID"
        />
        <SourceRow
          table="PROD_DB.MASTER_DB_READ_DBO.T_DEVICE + T_ROUTER_USER_MAPPING"
          purpose="Recharge history — feeds every Ageing Bucket across the app"
          fields="LONG_NAS_ID, OTP_EXPIRY_TIME, OTP, DEVICE_LIMIT"
        />
        <SourceRow
          table="PROD_DB.PUBLIC.FINANCIAL_WRITE_OFF_DEVICES"
          purpose="Financial write-off dates — splits Financial vs Non-Financial write-off"
          fields="DEVICE_ID, WRITTEN_OFF_DATE"
        />
        <SourceRow
          table="PROD_DB.CSP_GATEWAY_SERVICE_CSP_GATEWAY_SERVICE.CSP_ACCOUNT"
          purpose="Live/verified CSP partners — feeds CSP vs Ex-CSP segmentation"
          fields="csp_id, partner_id, _fivetran_active"
        />
        <SourceRow
          table="CSP_ASSET_CUSTODY_SERVICE_...CUSTODY_AUDIT_LOG + POSTGRES_...T_DEVICE_AUDIT"
          purpose="Per-device history timeline — powers the Device Search history view"
          fields="EVENT_TYPE, FROM_STATE, TO_STATE, REASON, TRIGGERED_BY, CREATED_AT"
        />
        <SourceRow
          table="prod_db.public.supply_model + t_account"
          purpose="Partner master — name, mobile, zone, city, account manager"
          fields="partner_account_id, partner_name, partner_mobile, zone"
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card eyebrow="3 &middot; Definitions" title="Status &amp; holder logic">
          <Def term="STATUS_NORMALIZED">
            Blank/typo cleanup only &mdash; blank status1 becomes UNKNOWN,{" "}
            <code>IN_WAREHOUES</code> (source typo) is corrected to IN_WAREHOUSE. Every other value
            passes through unchanged.
          </Def>
          <Def term="HOLDER_BUCKET">
            wiom_warehouse (never dispatched, sitting at WIOM) / returned_to_wiom (dispatched, now
            back) / customer / partner &mdash; derived from location + dispatch history, not status
            alone.
          </Def>
          <Def term="DISPATCH_BUCKET">
            never_dispatched vs dispatched &mdash; purely whether FIRST_DISPATCHED_DATE is set. A
            device can be &quot;dispatched&quot; and still be sitting at a WIOM warehouse today
            (returned_to_wiom).
          </Def>
          <Def term="GRN_SOURCE_BUCKET">
            fresh_grn (DATA_SOURCE = inbound_inward_devices) / ssot_csp (DATA_SOURCE =
            t_device_devices) / other (older or manual sources).
          </Def>
        </Card>

        <Card eyebrow="3 &middot; Definitions" title="Ageing &amp; write-off logic">
          <Def term="AGEING_BUCKET">
            CURRENT_DATE &minus; last recharge expiry, computed live on every request (never
            stored). no_recharge_history = never had a recharge record at all (mostly
            never-installed devices) &mdash; this is why Active + Expired alone always looked short
            by that bucket.
          </Def>
          <Def term="Financial Write-off">
            WRITE_OFF_DATE IS NOT NULL &mdash; has an entry in FINANCIAL_WRITE_OFF_DEVICES. This is
            the accounting-recognized loss.
          </Def>
          <Def term="Non-Financial Write-off">
            STATUS_NORMALIZED = &apos;WRITTEN_OFF&apos; but no financial write-off date &mdash;
            operationally given up on, not yet booked as a financial loss. These two are mutually
            exclusive subsets of the WRITTEN_OFF total, not additive with it.
          </Def>
          <Def term="365+ Days Aged">
            Same underlying ageing-bucket expression, filtered to the 365+ bucket &mdash; the
            standard candidate pool for write-off review across Summary, Executive, and Vintage.
          </Def>
        </Card>
      </div>

      <Card eyebrow="4 &middot; Known Corrections &amp; Caveats" title="Read before trusting a number blindly">
        <ul className="ml-4 list-disc space-y-2 pl-2">
          <li>
            <strong className="text-slate-200">Migrated-CSP vs. old-partner (pending FNF)</strong>{" "}
            can&apos;t be told apart from this table alone &mdash; every dispatched-to-partner row
            shares DATA_SOURCE = t_device_devices regardless of migration status. That distinction
            lives on the partner record, joinable on PARTNER_ACCOUNT_ID, but isn&apos;t surfaced yet.
          </li>
          <li>
            <strong className="text-slate-200">Unknown holder</strong> devices (no resolvable
            customer/partner/warehouse) are excluded from every &quot;current custody&quot;
            percentage on Summary and Executive &mdash; see the breakdown in each page&apos;s Known
            Gaps / equation rows.
          </li>
          <li>
            <strong className="text-slate-200">Asset Register</strong> (purchase/write-off by fiscal
            year) only has data from <span className="text-slate-200">27 Apr 2024</span> onward &mdash;
            earlier fiscal years are necessarily incomplete, not zero.
          </li>
          <li>
            <strong className="text-slate-200">Recharge-based numbers</strong> reflect the recharge
            table as of the last cache refresh, not the exact second you load the page &mdash; check
            the &quot;Synced&quot; time in the top bar if figures look stale, or hit Refresh Data.
          </li>
          {dq && dq.blank_device_id_rows_excluded > 0 && (
            <li>
              <strong className="text-slate-200">{dq.blank_device_id_rows_excluded.toLocaleString("en-IN")} rows</strong>{" "}
              with a blank/null DEVICE_ID are excluded from every count on this app (out of{" "}
              {dq.total_rows_before_id_filter?.toLocaleString("en-IN")} raw rows) &mdash; these come
              from audit/tracking sources, and a subset shared a MAC_ID with an already-counted
              device, which would have caused double-counting.
            </li>
          )}
        </ul>
      </Card>

      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-6">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
          Not yet built &mdash; churn-recovery funnel views
        </div>
        <p className="text-sm leading-relaxed text-slate-300">
          Reference dashboards in this space (e.g. Journey Logic-style Funnel View / Non-Funnel View)
          track <em>when</em> a device churned and <em>when</em> it was resolved &mdash; CSP pickup,
          Wiom pickup, or customer winback &mdash; to compute cohort-matched resolution rates and
          project annual financial impact. That needs a churn-event + resolution-event timeline this
          app doesn&apos;t currently query (this app&apos;s data model tracks device custody and
          status, not a ticket/resolution log). Building it means first identifying which system owns
          that data (support tickets, recharge/winback events) and wiring a new source into Schema
          Config &mdash; not yet scoped.
        </p>
      </div>

      <div className="border-t border-white/5 pt-4 text-[11px] text-slate-600">
        Every fragment above is editable without a code deploy from the{" "}
        <button onClick={onEditSql} className="text-slate-400 underline underline-offset-2">
          Edit SQL
        </button>{" "}
        tab (admin only) &mdash; it shows the live SQL for each step, whether it&apos;s been
        customized from the default, and a dry-run row-count check before saving.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Edit SQL tab -- the original Schema Config editor, admin-only.
// ---------------------------------------------------------------------
function EditSqlTab() {
  const [config, setConfig] = useState<SchemaConfig | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  function load() {
    api
      .schemaConfig()
      .then((cfg) => {
        setConfig(cfg);
        setDrafts(Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v.sql])));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }

  useEffect(load, []);

  async function handleTest(name: string) {
    setBusy(name);
    setStatus((s) => ({ ...s, [name]: "" }));
    try {
      const res = await api.testSchemaQuery(name, drafts[name]);
      setStatus((s) => ({ ...s, [name]: `✓ Valid — ${res.row_count.toLocaleString("en-IN")} rows` }));
    } catch (e) {
      setStatus((s) => ({ ...s, [name]: `✗ ${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
  }

  async function handleSave(name: string) {
    setBusy(name);
    try {
      await api.updateSchemaQuery(name, drafts[name]);
      setStatus((s) => ({ ...s, [name]: "✓ Saved — live everywhere now" }));
      load();
    } catch (e) {
      setStatus((s) => ({ ...s, [name]: `✗ ${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
  }

  async function handleReset(name: string) {
    setBusy(name);
    try {
      await api.resetSchemaQuery(name);
      setStatus((s) => ({ ...s, [name]: "✓ Reset to default" }));
      load();
    } catch (e) {
      setStatus((s) => ({ ...s, [name]: `✗ ${(e as Error).message}` }));
    } finally {
      setBusy(null);
    }
  }

  if (!isAdmin()) {
    return (
      <ErrorBanner message="Editing SQL is admin-only. Ask an admin to make changes here, or to grant you the admin role on the Users page." />
    );
  }

  if (error) return <ErrorBanner message={error} />;
  if (!config) return (
    <div className="space-y-6">
      <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      <div className="h-64 animate-pulse rounded-xl bg-white/5" />
    </div>
  );

  const entries = Object.entries(config);
  const byKind = {
    statement: entries.filter(([, v]) => v.kind === "statement"),
    expression: entries.filter(([, v]) => v.kind === "expression"),
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        <strong>Read-only guard:</strong> only SELECT/WITH statements (or their inner CASE
        expressions) are accepted &mdash; no INSERT/UPDATE/DELETE/DROP. Test before saving where
        possible; Save applies instantly across the whole app.
      </div>

      {(["statement", "expression"] as const).map((kind) => (
        <div key={kind} className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            {KIND_LABELS[kind]}
          </h2>

          {byKind[kind].map(([name, entry]) => (
            <div key={name} className="glass-card rounded-xl p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">{entry.label}</h3>
                  <p className="mt-1 text-xs text-slate-500">{HINTS[name]}</p>
                </div>
                {!entry.is_default && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Customized
                  </span>
                )}
              </div>

              <textarea
                value={drafts[name] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
                spellCheck={false}
                rows={kind === "statement" ? 12 : 6}
                className="w-full rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-slate-200 outline-none focus:border-[#ff6fd8]/50"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {kind === "statement" && (
                  <button
                    onClick={() => handleTest(name)}
                    disabled={busy === name}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-50"
                  >
                    Test query
                  </button>
                )}
                <button
                  onClick={() => handleSave(name)}
                  disabled={busy === name}
                  className="rounded-lg bg-gradient-to-r from-[#D9009D] to-[#0839FB] px-3 py-1.5 text-xs font-semibold text-black hover:shadow-lg hover:shadow-[#D9009D]/25 disabled:opacity-50"
                >
                  Save &amp; apply live
                </button>
                <button
                  onClick={() => handleReset(name)}
                  disabled={busy === name}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/10 disabled:opacity-50"
                >
                  Reset to default
                </button>
                {status[name] && (
                  <span
                    className={`text-xs ${status[name].startsWith("✓") ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {status[name]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Page shell -- two tabs sharing one nav entry: Methodology (everyone)
// and Edit SQL (admin only, the raw editor that used to be the whole page).
// ---------------------------------------------------------------------
export default function SchemaConfigPage() {
  const [tab, setTab] = useState<"methodology" | "sql">("methodology");

  return (
    <div className="space-y-6 p-8">
      <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-[#ff6fd8]/10 to-transparent p-5">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#ff6fd8]">
          Backup &middot; Data Sources &amp; Methodology
        </div>
        <h1 className="brand-gradient-text text-2xl font-bold">Where Every Number On This App Comes From</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-slate-400">
          Read this before trusting a number blindly. Every page in this app is built on one shared
          pipeline &mdash; documented on the Methodology tab, editable live (admin only) on Edit SQL.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("methodology")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "methodology"
              ? "bg-gradient-to-r from-[#D9009D] to-[#0839FB] text-white"
              : "border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
          }`}
        >
          Methodology
        </button>
        <button
          onClick={() => setTab("sql")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "sql"
              ? "bg-gradient-to-r from-[#D9009D] to-[#0839FB] text-white"
              : "border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
          }`}
        >
          Edit SQL {!isAdmin() && <span className="opacity-60">(admin)</span>}
        </button>
      </div>

      {tab === "methodology" ? (
        <MethodologyTab onEditSql={() => setTab("sql")} />
      ) : (
        <EditSqlTab />
      )}
    </div>
  );
}
