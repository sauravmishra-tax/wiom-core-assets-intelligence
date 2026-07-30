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

export default function SchemaConfigPage() {
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
      <div className="p-8">
        <ErrorBanner message="Schema Config is admin-only. Ask an admin to make changes here, or to grant you the admin role on the Users page." />
      </div>
    );
  }

  if (error) return <ErrorBanner message={error} />;
  if (!config) return (
    <div className="space-y-6 p-8">
      <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
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
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Schema Config</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every SQL fragment that drives a number in this app, in one place &mdash; nothing is
          hardcoded outside this list. Changes apply live, no restart or redeploy.
        </p>
      </div>

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
