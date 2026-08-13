"use client";

import { useEffect } from "react";
import { logError } from "@/lib/errorLog";

export function ErrorMonitor() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      logError(event.message, event.error?.stack);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      logError(reason?.message || String(reason), reason?.stack);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
