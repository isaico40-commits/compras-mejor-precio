"use client";

import { useEffect, useState } from "react";

/** Registra el service worker y avisa cuando no hay señal. */
export function RegistrarSW() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const upd = () => setOffline(!navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  if (!offline) return null;
  return (
    <div className="sticky top-0 z-30 bg-alerta px-4 py-1.5 text-center text-xs font-semibold text-white">
      Sin señal: estás viendo la última lista guardada
    </div>
  );
}
