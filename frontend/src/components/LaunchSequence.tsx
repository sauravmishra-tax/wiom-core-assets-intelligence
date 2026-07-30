"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

const TOTAL_MS = 4000;
const IRIS_START_MS = 3500;
const IRIS_MS = TOTAL_MS - IRIS_START_MS;
const ORBIT_DOTS = 10;

const STAGES = [
  { at: 0, label: "Authenticating" },
  { at: 1000, label: "Connecting to the device fleet" },
  { at: 2100, label: "Assembling your dashboards" },
];

/**
 * Full-screen branded hand-off shown for exactly TOTAL_MS between a
 * successful login and landing on the dashboard.
 *
 * No live numbers here on purpose (an earlier version counted up the real
 * device total - dropped per feedback that it read as a gimmick, not a
 * polish). What's left is purely motion: a drifting particle network on
 * <canvas> for depth, a ring of orbiting dots around the logo for a focal
 * point, and a 3-step checklist that ticks off as each stage completes -
 * gives a sense of real progress without exposing any data.
 */
export function LaunchSequence({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
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

    const COUNT = 42;
    const LINK_DIST = 130;
    const nodes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.7,
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
            const alpha = (1 - dist / LINK_DIST) * 0.18;
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
        ctx!.fillStyle = "rgba(255, 111, 216, 0.65)";
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

  // ── Stage timers, progress bar, iris ────────────────────────────────
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

    const irisTimer = setTimeout(() => setIrisOpen(true), IRIS_START_MS);
    const doneTimer = setTimeout(onComplete, TOTAL_MS);

    return () => {
      stageTimers.forEach(clearTimeout);
      clearTimeout(irisTimer);
      clearTimeout(doneTimer);
      cancelAnimationFrame(progressRaf);
    };
  }, [onComplete]);

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
        <div className="relative flex h-40 w-40 items-center justify-center">
          {/* Orbiting ring of dots - the focal point the particle network
              drifts around, rotating slowly and pulsing individually so it
              never looks like a static spinner graphic. */}
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          >
            {Array.from({ length: ORBIT_DOTS }).map((_, i) => {
              const angle = (360 / ORBIT_DOTS) * i;
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#ff4fc4] to-[#0839FB]"
                  style={{ transform: `rotate(${angle}deg) translate(70px) rotate(${-angle}deg)` }}
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

          <motion.div
            className="absolute h-24 w-24 rounded-full bg-gradient-to-br from-[#D9009D] to-[#0839FB]"
            style={{ filter: "blur(30px)" }}
            animate={{ scale: [0.9, 1.2, 0.9], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
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

        {/* Checklist - each row ticks from a hollow ring to a filled check
            as its stage completes, giving a sense of real progress without
            showing any actual numbers. */}
        <div className="mt-6 space-y-2.5">
          {STAGES.map((s, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="relative flex h-4 w-4 items-center justify-center">
                  <AnimatePresence mode="wait">
                    {done ? (
                      <motion.svg
                        key="check"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        viewBox="0 0 16 16"
                        className="h-4 w-4"
                      >
                        <circle cx="8" cy="8" r="8" fill="#D9009D" />
                        <path
                          d="M4.5 8.2 L7 10.7 L11.5 5.5"
                          fill="none"
                          stroke="white"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </motion.svg>
                    ) : (
                      <motion.span
                        key="ring"
                        className={`h-3 w-3 rounded-full border ${active ? "border-[#ff6fd8]" : "border-white/20"}`}
                        animate={active ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                        transition={active ? { duration: 1, repeat: Infinity } : {}}
                      />
                    )}
                  </AnimatePresence>
                </span>
                <span className={`text-xs ${done || active ? "text-slate-300" : "text-slate-600"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
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
