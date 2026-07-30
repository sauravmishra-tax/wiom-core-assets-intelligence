"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

const TOTAL_MS = 4000;

const STAGES = [
  { at: 0, label: "Authenticating…" },
  { at: 900, label: "Syncing device fleet from Snowflake…" },
  { at: 2000, label: "Building your dashboards…" },
  { at: 3200, label: "Ready." },
];

const ORBIT_DOTS = 8;

/**
 * Full-screen branded hand-off shown for exactly TOTAL_MS between a
 * successful login and landing on the dashboard - masks real data
 * prefetching happening underneath (see login/page.tsx) so the dashboard
 * feels instant the moment this finishes, instead of showing its own
 * spinner right after this one.
 */
export function LaunchSequence({ onComplete }: { onComplete: () => void }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const stageTimers = STAGES.map((s, i) =>
      setTimeout(() => setStageIndex(i), s.at)
    );

    const start = performance.now();
    let raf: number;
    const tick = () => {
      const elapsed = performance.now() - start;
      setProgress(Math.min(1, elapsed / TOTAL_MS));
      if (elapsed < TOTAL_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const exitTimer = setTimeout(() => setExiting(true), TOTAL_MS - 500);
    const doneTimer = setTimeout(onComplete, TOTAL_MS);

    return () => {
      stageTimers.forEach(clearTimeout);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
      cancelAnimationFrame(raf);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          key="launch-sequence"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#05040d]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(12px)" }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <div className="ambient-glow" />

          {/* Orbiting dots around the logo - a slow rotating ring of brand-
              colored particles, purely decorative motion to make the wait
              feel alive instead of a static spinner. */}
          <div className="relative flex h-40 w-40 items-center justify-center">
            <motion.div
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            >
              {Array.from({ length: ORBIT_DOTS }).map((_, i) => {
                const angle = (360 / ORBIT_DOTS) * i;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#ff4fc4] to-[#0839FB]"
                    style={{
                      transform: `rotate(${angle}deg) translate(70px) rotate(${-angle}deg)`,
                    }}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: (i / ORBIT_DOTS) * 2,
                      ease: "easeInOut",
                    }}
                  />
                );
              })}
            </motion.div>

            {/* Pulsing glow ring behind the logo */}
            <motion.div
              className="absolute h-24 w-24 rounded-full bg-gradient-to-br from-[#D9009D] to-[#0839FB]"
              style={{ filter: "blur(28px)" }}
              animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.5, 0.85, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative flex h-16 w-16 items-center justify-center"
            >
              <Image src="/wiom-logo.svg" alt="Wiom" width={64} height={64} priority />
            </motion.div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="brand-gradient-text mt-6 text-lg font-bold"
          >
            Asset Intelligence
          </motion.h1>

          {/* Staged status line - a new message crossfades in as each
              milestone timer fires, giving the wait a sense of real
              progress rather than an indeterminate spinner. */}
          <div className="mt-3 h-5">
            <AnimatePresence mode="wait">
              <motion.p
                key={stageIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="text-xs text-slate-500"
              >
                {STAGES[stageIndex].label}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress bar - real elapsed-time-driven, not a fake CSS
              animation, so it always lands at 100% exactly when this
              component unmounts. */}
          <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#D9009D] via-[#ff4fc4] to-[#0839FB]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
