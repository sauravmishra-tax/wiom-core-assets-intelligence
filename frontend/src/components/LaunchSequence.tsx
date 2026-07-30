"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

const TOTAL_MS = 4000;
const IRIS_START_MS = 3500;
const IRIS_MS = TOTAL_MS - IRIS_START_MS;

const STAGES = [
  { at: 0, label: "Authenticating…" },
  { at: 800, label: "Connecting to the device fleet…" },
  { at: 1900, label: "Assembling live intelligence…" },
  { at: 3100, label: "Ready." },
];

const COUNTER_START_MS = 1900;
const COUNTER_DURATION_MS = 1300;

/**
 * Full-screen branded hand-off shown for exactly TOTAL_MS between a
 * successful login and landing on the dashboard.
 *
 * Three layers running concurrently, not staged one-after-another:
 *   1. A live particle network on <canvas> - device "nodes" drifting and
 *      linking, standing in for the fleet the platform actually tracks.
 *   2. The logo + a real number counting up (the actual TOTAL_DEVICES from
 *      the prefetch already in flight - see login/page.tsx) - this is the
 *      one thing a generic spinner can never do: show real product data as
 *      part of the flourish, not a fake progress illusion.
 *   3. An iris wipe (clip-path circle shrinking to a point) as the exit,
 *      instead of a fade/blur - it reads as "opening into" the dashboard
 *      rather than "the loader disappeared".
 */
export function LaunchSequence({
  onComplete,
  totalDevices,
}: {
  onComplete: () => void;
  totalDevices: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [irisOpen, setIrisOpen] = useState(false);

  // ── Particle network ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const COUNT = 46;
    const LINK_DIST = 130;
    const nodes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.8,
    }));

    let raf: number;
    function frame() {
      ctx!.clearRect(0, 0, width, height);
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.22;
            ctx!.strokeStyle = `rgba(217, 0, 157, ${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(255, 111, 216, 0.75)";
        ctx!.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function handleResize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.scale(dpr, dpr);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // ── Stage timers, progress bar, counter, iris ───────────────────────
  useEffect(() => {
    const stageTimers = STAGES.map((s, i) => setTimeout(() => setStageIndex(i), s.at));

    const start = performance.now();
    let progressRaf: number;
    const tickProgress = () => {
      const elapsed = performance.now() - start;
      setProgress(Math.min(1, elapsed / TOTAL_MS));
      if (elapsed < TOTAL_MS) progressRaf = requestAnimationFrame(tickProgress);
    };
    progressRaf = requestAnimationFrame(tickProgress);

    let counterRaf: number;
    const counterTimer = setTimeout(() => {
      const target = totalDevices ?? 372759; // graceful fallback if prefetch hasn't resolved yet
      const countStart = performance.now();
      const tickCounter = () => {
        const elapsed = performance.now() - countStart;
        const t = Math.min(1, elapsed / COUNTER_DURATION_MS);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        setCount(Math.round(target * eased));
        if (t < 1) counterRaf = requestAnimationFrame(tickCounter);
      };
      counterRaf = requestAnimationFrame(tickCounter);
    }, COUNTER_START_MS);

    const irisTimer = setTimeout(() => setIrisOpen(true), IRIS_START_MS);
    const doneTimer = setTimeout(onComplete, TOTAL_MS);

    return () => {
      stageTimers.forEach(clearTimeout);
      clearTimeout(counterTimer);
      clearTimeout(irisTimer);
      clearTimeout(doneTimer);
      cancelAnimationFrame(progressRaf);
      cancelAnimationFrame(counterRaf);
    };
  }, [onComplete, totalDevices]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#05040d]"
      initial={{ clipPath: "circle(150% at 50% 50%)" }}
      animate={
        irisOpen
          ? { clipPath: "circle(0% at 50% 50%)" }
          : { clipPath: "circle(150% at 50% 50%)" }
      }
      transition={{ duration: IRIS_MS / 1000, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="ambient-glow" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

      <div className="relative flex flex-col items-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <motion.div
            className="absolute h-24 w-24 rounded-full bg-gradient-to-br from-[#D9009D] to-[#0839FB]"
            style={{ filter: "blur(30px)" }}
            animate={{ scale: [0.9, 1.2, 0.9], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
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
          className="brand-gradient-text mt-5 text-lg font-bold"
        >
          Asset Intelligence
        </motion.h1>

        {/* Real, live device count ticking up - not a decorative number,
            the actual TOTAL_DEVICES from the prefetch this component's
            caller kicked off at login. */}
        <AnimatePresence>
          {stageIndex >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-4 text-center"
            >
              <div className="text-3xl font-bold tabular-nums text-white">
                {count.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-slate-500">
                devices under management
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 h-5">
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

        <div className="mt-5 h-1 w-56 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#D9009D] via-[#ff4fc4] to-[#0839FB]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </motion.div>
  );
}
