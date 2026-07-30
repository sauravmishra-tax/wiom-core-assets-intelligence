"use client";

import { useEffect, useState } from "react";
import { api, UserRecord } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SkeletonTable } from "@/components/KpiCard";
import { currentUserEmail } from "@/components/AuthGate";

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const me = currentUserEmail();

  function load() {
    api
      .listUsers()
      .then((res) => setUsers(res.users))
      .catch((e) => setError(String(e.message ?? e)));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const res = await api.addUser(newEmail, newPassword, newRole);
      setUsers(res.users);
      setNewEmail("");
      setNewPassword("");
      setNewRole("viewer");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(email: string) {
    const warning =
      email === me
        ? "This is YOUR OWN login. Remove it anyway? You'll be signed out immediately."
        : `Remove login access for ${email}?`;
    if (!confirm(warning)) return;
    try {
      const res = await api.deleteUser(email);
      setUsers(res.users);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error) return <ErrorBanner message={error} />;
  if (!users) return (
    <div className="space-y-4 p-8">
      <SkeletonTable rows={5} />
    </div>
  );

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          <strong>Admin</strong> can manage users and edit Schema Config; <strong>Viewer</strong>{" "}
          can see every dashboard but not change either. Every add/remove here is recorded in the{" "}
          <a href="/audit-log" className="text-[#ff6fd8] hover:underline">Audit Log</a>.
        </p>
      </div>

      <form onSubmit={handleAdd} className="glass-card flex flex-wrap items-end gap-3 rounded-xl p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Email</span>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="teammate@wiom.in"
            className="w-64 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#ff6fd8]/50"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="min 6 characters"
            className="w-56 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#ff6fd8]/50"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Role</span>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as "admin" | "viewer")}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#ff6fd8]/50"
          >
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-[#D9009D] to-[#0839FB] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
        >
          {busy ? "Adding..." : "Add user"}
        </button>
        {formError && <span className="text-xs text-rose-400">{formError}</span>}
      </form>

      <div className="glass-card overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase text-slate-500">
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-b border-white/5">
                <td className="p-3 text-slate-200">
                  {u.email}
                  {me === u.email && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                      you
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                      u.role === "admin" ? "bg-[#D9009D]/20 text-[#ff9ee8]" : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleDelete(u.email)}
                    disabled={users.length <= 1}
                    className="text-xs text-rose-400 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
