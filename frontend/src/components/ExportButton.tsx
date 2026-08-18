"use client";

import { useState } from "react";
import { authHeaders, BACKEND_ORIGIN } from "@/lib/api";

function filenameFrom(contentDisposition: string | null, fallbackUrl: string): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/);
  if (match) return match[1];
  const last = fallbackUrl.split("/").pop() || "export.csv";
  return last.split("?")[0];
}

export function ExportButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      // A plain <a href download> can't attach the Authorization header the
      // backend now requires on every route, so every export silently 401'd.
      // Fetching with the header and downloading the blob client-side fixes it.
      // Also hits the backend directly (BACKEND_ORIGIN), not the same-origin
      // /api/* path Next.js rewrites - that proxy times out around 30s, well
      // under how long a full/bulk CSV export can take.
      const res = await fetch(href, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Export failed (${res.status}): ${body.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res.headers.get("Content-Disposition"), href);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-[#ff6fd8]/40 hover:bg-white/10 hover:text-[#ff6fd8] disabled:opacity-50"
      >
        <span aria-hidden>⇩</span> {busy ? "Exporting..." : label}
      </button>
      {error && <span className="text-[10px] text-rose-400">{error}</span>}
    </div>
  );
}
