"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

const SELECT_CLASS =
  "bg-slate-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-[#D9009D]/60";

export function useGlobalFilters() {
  const searchParams = useSearchParams();
  const device_type = searchParams.get("device_type") ?? "";
  const holder_bucket = searchParams.get("holder_bucket") ?? "";
  const status = searchParams.get("status") ?? "";

  const parts: string[] = [];
  if (device_type) parts.push(`device_type=${encodeURIComponent(device_type)}`);
  if (holder_bucket) parts.push(`holder_bucket=${encodeURIComponent(holder_bucket)}`);
  if (status) parts.push(`status=${encodeURIComponent(status)}`);
  const queryString = parts.length ? `?${parts.join("&")}` : "";

  return { device_type, holder_bucket, status, queryString };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RefreshDataButton() {
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .cacheStatus()
      .then((s) => setLastSynced(s.last_synced_at))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function handleRefresh() {
    setBusy(true);
    setError(null);
    try {
      const { refreshed_at } = await api.refreshCache();
      setLastSynced(refreshed_at);
      // Every page's data-fetching hook only runs on mount/query-change, so a
      // full reload is the simplest way to guarantee every number on screen
      // actually re-fetches from the now-cleared cache.
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="text-xs text-slate-500" title="Data also auto-syncs daily at 9:00 AM IST">
        Synced {timeAgo(lastSynced)}
      </span>
      <button
        onClick={handleRefresh}
        disabled={busy}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-[#D9009D]/40 hover:text-[#ff6fd8] disabled:opacity-50"
      >
        {busy ? "Refreshing..." : "⟳ Refresh data"}
      </button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}

export function GlobalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const device_type = searchParams.get("device_type") ?? "";
  const holder_bucket = searchParams.get("holder_bucket") ?? "";
  const status = searchParams.get("status") ?? "";

  const hasFilters = !!(device_type || holder_bucket || status);

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const clearAll = useCallback(() => {
    router.replace(pathname ?? "/");
  }, [router, pathname]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/5 bg-black/20 px-6 py-3 backdrop-blur-sm">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Filters</span>

      <select
        className={SELECT_CLASS}
        value={device_type}
        onChange={(e) => update("device_type", e.target.value)}
      >
        <option value="">All Device Types</option>
        <option value="Router">Router</option>
        <option value="ONT">ONT</option>
      </select>

      <select
        className={SELECT_CLASS}
        value={holder_bucket}
        onChange={(e) => update("holder_bucket", e.target.value)}
      >
        <option value="">All Holders</option>
        <option value="customer">Customer</option>
        <option value="partner">Partner</option>
        <option value="wiom_warehouse">Wiom Warehouse</option>
        <option value="returned_to_wiom">Returned to Wiom</option>
      </select>

      <select
        className={SELECT_CLASS}
        value={status}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="DEPLOYED">DEPLOYED</option>
        <option value="INSTALLED">INSTALLED</option>
        <option value="IDLE">IDLE</option>
        <option value="LOST">LOST</option>
        <option value="WRITTEN_OFF">WRITTEN_OFF</option>
        <option value="CUSTODIED">CUSTODIED</option>
      </select>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="rounded-lg border border-[#D9009D]/40 px-3 py-1.5 text-sm font-medium text-[#D9009D] transition-colors hover:bg-[#D9009D]/10"
        >
          Clear filters
        </button>
      )}

      <RefreshDataButton />
    </div>
  );
}
