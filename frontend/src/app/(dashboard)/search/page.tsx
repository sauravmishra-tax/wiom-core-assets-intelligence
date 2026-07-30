"use client";

import { useState } from "react";
import Link from "next/link";
import { api, DeviceSearchResult } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeviceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      setMessage("Enter at least 2 characters to search");
      return;
    }
    setMessage(null);
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchDevices(query.trim());
      setResults(res.results);
      setSearched(true);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Device Search</h1>
        <p className="mt-1 text-sm text-slate-500">
          Search by Device ID, MAC ID, Serial, Partner ID, or Customer ID
        </p>
      </div>

      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. GX137028, a MAC address, or account id"
          className="w-full max-w-lg rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#ff6fd8]/60"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gradient-to-r from-[#D9009D] to-[#0839FB] px-5 py-2 text-sm font-semibold text-black hover:shadow-lg hover:shadow-[#D9009D]/25 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {message && (
        <p className="text-sm text-amber-400/80">{message}</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="overflow-x-auto glass-card rounded-xl">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
                <th className="p-3">Device ID</th>
                <th className="p-3">Type</th>
                <th className="p-3">Location</th>
                <th className="p-3">Status</th>
                <th className="p-3">Ageing</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.DEVICE_ID} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3">
                    <Link
                      href={`/devices/${encodeURIComponent(r.DEVICE_ID)}`}
                      className="font-medium text-[#6f97ff] hover:underline"
                    >
                      {r.DEVICE_ID}
                    </Link>
                  </td>
                  <td className="p-3 text-slate-400">{r.DEVICE_TYPE ?? "-"}</td>
                  <td className="p-3 text-slate-400">{r.HOLDER_BUCKET}</td>
                  <td className="p-3 text-slate-400">{r.STATUS_NORMALIZED}</td>
                  <td className="p-3 text-slate-400">{r.AGING_BUCKET}</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-600">
                    No devices matched &quot;{query}&quot;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
