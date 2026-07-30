"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, DeviceProfile } from "@/lib/api";

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
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

export default function DeviceProfilePage() {
  const params = useParams<{ id: string }>();
  const deviceId = decodeURIComponent(params.id);
  const [data, setData] = useState<DeviceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api
      .deviceProfile(deviceId)
      .then(setData)
      .catch((e) => setError(String(e.message ?? e)));
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
            <div
              key={section.title}
              className="glass-card rounded-xl p-5"
            >
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
    </div>
  );
}
