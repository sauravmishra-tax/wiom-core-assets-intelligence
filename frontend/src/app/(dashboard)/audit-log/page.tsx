"use client";

import { useEffect, useState } from "react";
import { api, AuditLogEntry } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonTable } from "@/components/KpiCard";

const ACTION_LABELS: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in attempt",
  user_added: "Added user",
  user_removed: "Removed user",
  schema_query_updated: "Edited Schema Config query",
  schema_query_reset: "Reset Schema Config query to default",
};

const ACTION_TONE: Record<string, string> = {
  login: "text-emerald-300",
  login_failed: "text-rose-400",
  user_added: "text-emerald-300",
  user_removed: "text-rose-400",
  schema_query_updated: "text-amber-300",
  schema_query_reset: "text-slate-300",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .auditLog(500)
      .then((res) => setEntries(res.entries))
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!entries) return (
    <div className="space-y-4 p-8">
      <SkeletonTable rows={10} />
    </div>
  );

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every sign-in, user add/remove, and Schema Config edit &mdash; who, what, and when.
          Admin-only. Newest first, last {entries.length} events.
        </p>
      </div>

      <div className="glass-card overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-3">When</th>
              <th className="p-3">Who</th>
              <th className="p-3">Action</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="p-3 whitespace-nowrap font-mono text-xs text-slate-400">
                  {new Date(e.timestamp).toLocaleString("en-IN")}
                </td>
                <td className="p-3 text-slate-200">{e.actor}</td>
                <td className={`p-3 font-medium ${ACTION_TONE[e.action] ?? "text-slate-300"}`}>
                  {ACTION_LABELS[e.action] ?? e.action}
                </td>
                <td className="p-3 text-slate-400">{e.details || "—"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-500">
                  No events recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
