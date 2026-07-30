"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/lib/api";
import { signIn } from "@/components/AuthGate";
import { LaunchSequence } from "@/components/LaunchSequence";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [launching, setLaunching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [expiredNotice, setExpiredNotice] = useState(false);

  useEffect(() => {
    // Read manually (not useSearchParams) to avoid needing a Suspense
    // boundary just for this one-time redirect-reason check.
    if (new URLSearchParams(window.location.search).get("reason") === "expired") {
      setExpiredNotice(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { email: signedInEmail, role, token } = await api.login(email, password);
      signIn(signedInEmail, role, token);
      setLaunching(true);
      // Fire-and-forget: warms the backend's server-side query cache so
      // the Executive page's own fetch (right after this animation ends)
      // is a cache hit instead of a fresh multi-second Snowflake round trip.
      api.executiveKpis("").catch(() => {});
    } catch (err) {
      setError(String((err as Error).message ?? err));
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="ambient-glow" />

      <AnimatePresence>
        {!launching && (
          <motion.div
            key="login-card"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 1.06, filter: "blur(8px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="glass-card w-full max-w-sm rounded-2xl p-8 shadow-2xl"
          >
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-32 items-center justify-center drop-shadow-[0_0_18px_rgba(217,0,157,0.35)]">
                <Image src="/wiom-logo.svg" alt="Wiom" width={112} height={57} priority />
              </div>
              <h1 className="brand-gradient-text text-xl font-bold">Asset Intelligence</h1>
              <p className="mt-1 text-xs text-slate-500">Sign in to continue</p>
            </div>

            {expiredNotice && (
              <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Your session expired (sessions last 12 hours) — sign in again to continue.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@wiom.in"
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
              />

              {error && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </p>
              )}

              <motion.button
                type="submit"
                disabled={submitting}
                whileTap={{ scale: 0.97 }}
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-[#D9009D] to-[#0839FB] py-2.5 text-sm font-semibold text-black transition-shadow hover:shadow-lg hover:shadow-[#D9009D]/25 disabled:opacity-60"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </motion.button>
            </form>

            <p className="mt-6 text-center text-[11px] text-slate-600">
              Ask an admin for access if you don&apos;t have a login
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {launching && <LaunchSequence onComplete={() => router.push("/executive")} />}
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-[#ff6fd8]/60 focus:bg-white/[0.07]"
      />
    </label>
  );
}
