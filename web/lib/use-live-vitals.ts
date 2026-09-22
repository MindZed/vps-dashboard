"use client";

import { useState, useEffect } from "react";
import { fetchSystemVitals, SystemVitals } from "./agent-client";

export function useLiveVitals(intervalMs = 4500) {
  const [vitals, setVitals] = useState<SystemVitals | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [isTabActive, setIsTabActive] = useState(true);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return; // Skip poll if tab is in background
      }
      try {
        const res = await fetchSystemVitals();
        setVitals(res.vitals);
        setIsMock(res.isMock);
      } catch (err) {
        console.error("Vitals polling error", err);
      }
    };

    const handleVisibilityChange = () => {
      const active = document.visibilityState === "visible";
      setIsTabActive(active);
      if (active) {
        poll(); // Immediate tick when tab is focused
        if (!timerId) {
          timerId = setInterval(poll, intervalMs);
        }
      } else {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
      }
    };

    // Initial poll
    poll();
    timerId = setInterval(poll, intervalMs);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerId) clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);

  const ramPct = vitals ? Math.round((vitals.ram_used_mb / vitals.ram_total_mb) * 100) : 0;

  return {
    vitals,
    cpuPct: vitals?.cpu_usage_pct ?? 0,
    ramPct,
    ramUsedMB: vitals?.ram_used_mb ?? 0,
    ramTotalMB: vitals?.ram_total_mb ?? 24150,
    isMock,
    isTabActive,
  };
}
