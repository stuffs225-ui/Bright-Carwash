"use client";

import { useEffect, useState } from "react";
import { queueLength } from "@/lib/offlineQueue";
import { flushOfflineQueue } from "@/lib/offlineSync";

export function OfflineStatusBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPending(queueLength());

    const refresh = () => setPending(queueLength());
    const goOnline = () => {
      setOnline(true);
      flushOfflineQueue().then(refresh);
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("offline-queue-changed", refresh);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const interval = setInterval(() => {
      if (navigator.onLine) flushOfflineQueue().then(refresh);
    }, 15000);

    return () => {
      window.removeEventListener("offline-queue-changed", refresh);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(interval);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 z-[1500] rounded-xl px-4 py-2.5 font-bold text-sm shadow-lg"
      style={{ backgroundColor: online ? "#d97706" : "#dc2626", color: "white" }}
    >
      {online ? `⏳ ${pending} عملية بانتظار الرفع...` : "🔴 غير متصل بالإنترنت — التسجيل يحفظ محلياً"}
    </div>
  );
}
