"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, DeviceProfile, DeviceHistory, DeviceHistoryEvent } from "@/lib/api";

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const SECTIONS: Array<{ title: string; fields: Array<[string, string]> }> = [
  {
    title: "Identity",
    fields: [
      ["DEVICE_ID", "Device ID"],
      ["MAC_ID", "MAC ID"],
      ["SERIAL", "Serial"],
      ["MODEL", "Model"],
      ["VERSION", "Version"],
      ["DEVICE_TYPE", "Device Type"],
    ],
  },
  {
    title: "Lifecycle",
    fields: [
      ["DATA_SOURCE", "Data Source"],
      ["GRN_SOURCE_BUCKET", "GRN Bucket"],
      ["FIRST_GRN_DATE", "First GRN Date"],
      ["FIRST_DISPATCHED_DATE", "First Dispatched"],
      ["LAST_DISPATCHED_DATE", "Last Dispatched"],
      ["TOTAL_DISPATCHES", "Total Dispatches"],
      ["FIRST_INSTALLED_DATE", "First Installed"],
      ["LAST_INSTALLED_DATE", "Last Installed"],
      ["DISPATCH_BUCKET", "Dispatch Bucket"],
    ],
  },
  {
    title: "Current location & status",
    fields: [
      ["CURRENT_LOCATION_RESOLVED", "Current Location"],
      ["HOLDER_BUCKET", "Holder Bucket"],
      ["PREVIOUS_LOCATION", "Previous Location"],
      ["LOCATION_UPDATED_DATE", "Location Updated"],
      ["STATUS_NORMALIZED", "Status"],
      ["STATUS_UPDATED_AT", "Status Updated"],
      ["PYROPS_STATE", "Pyrops State"],
      ["PYROPS_LOCATION", "Pyrops Location"],
    ],
  },
  {
    title: "Ownership",
    fields: [
      ["PARTNER_ACCOUNT_ID", "Partner Account ID"],
      ["CUSTOMER_ACCOUNT_ID", "Customer Account ID"],
      ["LAST_PARTNER_RECEIVED_FROM", "Last Received From"],
      ["LAST_PARTNER_RECEIVED_AT", "Last Received At"],
      ["LAST_WAREHOUSE_RECEIVED_AT", "Last Warehouse Received"],
    ],
  },
  {
    title: "Recharge & ageing",
    fields: [
      ["LAST_RECHARGE_EXPIRY", "Last Recharge Expiry"],
      ["AGING_BUCKET", "Ageing Bucket"],
    ],
  },
  {
    title: "Write-off / loss flags",
    fields: [
      ["OPS_WRITTEN_OFF", "Ops Written Off"],
      ["FINANCIAL_WRITE_OFF", "Financial Write Off"],
      ["IS_LOST", "Lost"],
      ["RETIRED", "Retired"],
      ["TRADED", "Traded"],
      ["E_WASTE", "E-Waste"],
      ["OBD", "OBD"],
    ],
  },
  {
    title: "Tickets & snapshot",
    fields: [
      ["LAST_PICKUP_TICKET_ID", "Last Pickup Ticket"],
      ["SNAPSHOT_DATE", "Snapshot Date"],
    ],
  },
];

const STATE_COLORS: Record<string, string> = {
  DEPLOYED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  INSTALLED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  IDLE: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  IN_TRANSIT: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WRITTEN_OFF: "bg-red-500/20 text-red-300 border-red-500/30",
  LOST: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  RETRIEVAL_PENDING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  CUSTOMER_RECOVERY_PENDING: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

function StateBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-slate-500">-</span>;
  const cls = STATE_COLORS[state] ?? "bg-slate-700/40 text-slate-300 border-slate-600/30";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  custody: "Custody",
  inventory: "Inventory",
};

const EVENT_ICONS: Record<string, string> = {
  CUSTODY_STATE_CHANGED: "⇄",
  INSERT: "＋",
  UPDATE: "✎",
};

function HistoryTimeline({ events }: { events: DeviceHistoryEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No history events found.</p>;
  }

  return (
    <div className="relative space-y-0">
      {/* vertical line */}
      <div className="absolute left-[19px] top-0 h-full w-px bg-white/10" />
      {events.map((ev, i) => (
        <div key={i} className="relative flex gap-4 pb-5">
          {/* dot */}
          <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-sm">
            {EVENT_ICONS[ev.EVENT_TYPE ?? ""] ?? "●"}
          </div>
          <div className="flex-1 rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {ev.EVENT_TYPE?.replace(/_/g, " ") ?? "-"}
                </span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-500">
                  {SOURCE_LABELS[ev.SOURCE] ?? ev.SOURCE}
                </span>
              </div>
              <span className="text-[11px] text-slate-500">{fmtDate(ev.EVENT_AT)}</span>
            </div>

            {/* state transition */}
            {(ev.FROM_STATE || ev.TO_STATE) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ev.FROM_STATE && <StateBadge state={ev.FROM_STATE} />}
                {ev.FROM_STATE && ev.TO_STATE && (
                  <span className="text-slate-600">→</span>
                )}
                {ev.TO_STATE && <StateBadge state={ev.TO_STATE} />}
              </div>
            )}

            {/* reason / note */}
            {ev.REASON && (
              <p className="mt-1.5 text-xs text-slate-400">
                <span className="text-slate-500">Reason: </span>{ev.REASON.replace(/_/g, " ")}
              </p>
            )}
            {ev.NOTE && (
              <p className="mt-1 text-xs text-slate-500 italic">{ev.NOTE}</p>
            )}
            {ev.TRIGGERED_BY && (
              <p className="mt-1 text-xs text-slate-500">
                <span>By: </span>{ev.TRIGGERED_BY}
              </p>
            )}
            {ev.CSP_ID && (
              <p className="mt-1 text-xs text-slate-500">CSP: {ev.CSP_ID}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DeviceProfilePage() {
  const params = useParams<{ id: string }>();
  const deviceId = decodeURIComponent(params.id);
  const [data, setData] = useState<DeviceProfile | null>(null);
  const [history, setHistory] = useState<DeviceHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    setHistory(null);
    setHistoryError(null);
    setHistoryLoading(true);

    api.deviceProfile(deviceId)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));

    api.deviceHistory(deviceId)
      .then(setHistory)
      .catch((e) => setHistoryError(String(e.message ?? e)))
      .finally(() => setHistoryLoading(false));
  }, [deviceId]);

  return (
    <div className="space-y-6 p-8">
      <div>
        <Link href="/search" className="text-xs text-slate-500 hover:text-slate-300">
          &larr; Back to search
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-white">{deviceId}</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!data && !error && <div className="text-slate-500">Loading...</div>}

      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="glass-card rounded-xl p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{section.title}</h2>
              <dl className="space-y-2">
                {section.fields.map(([key, label]) => (
                  <div key={key} className="flex justify-between gap-4 text-sm">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right text-slate-200">{fmt(data[key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      {/* Device History Timeline */}
      <div className="glass-card rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-300">Device History</h2>
        {historyLoading && <p className="text-sm text-slate-500">Loading history...</p>}
        {historyError && (
          <p className="text-sm text-rose-400">Failed to load history: {historyError}</p>
        )}
        {history && <HistoryTimeline events={history.events} />}
      </div>
    </div>
  );
}
