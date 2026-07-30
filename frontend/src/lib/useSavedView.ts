"use client";

import { useEffect, useState } from "react";

/** Generic "which rows/columns do I want visible" view, saved per-browser under a
 * page-scoped localStorage key. Reusable on any table page: pass a unique
 * `storageKey` per page and the full set of toggleable item ids. */
export function useSavedView(storageKey: string, allIds: string[]) {
  const fullKey = `saved-view:${storageKey}`;
  const [views, setViews] = useState<Record<string, string[]>>({});
  const [activeView, setActiveView] = useState<string>("__all__");
  const [visible, setVisible] = useState<Set<string>>(new Set(allIds));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      if (raw) setViews(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Record<string, string[]>) {
    setViews(next);
    localStorage.setItem(fullKey, JSON.stringify(next));
  }

  function toggle(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActiveView("__custom__");
  }

  function selectAll() {
    setVisible(new Set(allIds));
    setActiveView("__all__");
  }

  function clearAll() {
    setVisible(new Set());
    setActiveView("__custom__");
  }

  /** Bulk add/remove a specific set of ids (e.g. "select all in this segment"). */
  function setGroup(ids: string[], checked: boolean) {
    setVisible((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setActiveView("__custom__");
  }

  function saveCurrentAs(name: string) {
    if (!name.trim()) return;
    persist({ ...views, [name]: Array.from(visible) });
    setActiveView(name);
  }

  function loadView(name: string) {
    if (name === "__all__") return selectAll();
    const ids = views[name];
    if (!ids) return;
    setVisible(new Set(ids));
    setActiveView(name);
  }

  function deleteView(name: string) {
    const next = { ...views };
    delete next[name];
    persist(next);
    if (activeView === name) selectAll();
  }

  return {
    visible,
    toggle,
    selectAll,
    clearAll,
    setGroup,
    saveCurrentAs,
    loadView,
    deleteView,
    savedViewNames: Object.keys(views),
    activeView,
  };
}
