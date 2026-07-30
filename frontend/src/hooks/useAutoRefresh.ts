"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAutoRefresh(intervalMs: number, onRefresh: () => void) {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    callbackRef.current();
    setLastRefreshed(new Date());
    setSecondsAgo(0);
    setTimeout(() => setIsRefreshing(false), 800);
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    const id = setInterval(() => refresh(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, refresh]);

  // Seconds-ago counter
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastRefreshed]);

  return { refresh, isRefreshing, lastRefreshed, secondsAgo };
}
