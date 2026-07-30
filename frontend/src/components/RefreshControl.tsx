"use client";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface Props {
  onRefresh: () => void;
  intervalMs?: number;
}

export function RefreshControl({ onRefresh, intervalMs = 30_000 }: Props) {
  const { refresh, isRefreshing, secondsAgo } = useAutoRefresh(intervalMs, onRefresh);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">
        {isRefreshing ? "Refreshing…" : `Updated ${secondsAgo}s ago`}
      </span>
      <button
        onClick={refresh}
        disabled={isRefreshing}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-[#D9009D]/40 hover:text-white disabled:opacity-50"
        title="Refresh now"
      >
        <span
          className={`inline-block text-[#D9009D] transition-transform duration-700 ${isRefreshing ? "animate-spin" : ""}`}
        >
          ↻
        </span>
        Refresh
      </button>
    </div>
  );
}
