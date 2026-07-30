"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "waip_theme";

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem(STORAGE_KEY, next ? "light" : "dark");
  }

  return (
    <button
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
    >
      <span aria-hidden="true">{isLight ? "☀️" : "🌙"}</span>
      {isLight ? "Light" : "Dark"}
    </button>
  );
}
