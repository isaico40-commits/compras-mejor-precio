"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Estado = "cargando" | "sin-soporte" | "iphone" | "bloqueado" | "apagado" | "activo";

const b64 = (s: string) => {
  const p = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

/** Activa las notificaciones push de bajas de precio en este celu. */
export function ActivarAvisos() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setEstado(ios && !instalada ? "iphone" : "sin-soporte");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activo" : "apagado");
    })().catch(() => setEstado("sin-soporte"));
  }, []);

  async function activar() {
    setOcupado(true); setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setEstado(permiso === "denied" ? "bloqueado" : "apagado"); return; }
      const supabase = createClient();
      const { data: clave, error: e1 } = await supabase.rpc("vapid_publica");
      if (e1 || !clave) throw new Error("no pude leer la clave");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(String(clave)) }));
      const j = sub.toJSON();
      const { error } = await supabase.from("push_suscripciones").upsert({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: "endpoint" });
      if (error) throw new Error(error.message);
      setEstado("activo");
      await probar();
    } catch (e) {
      setMsg(`No se pudo activar: ${(e as Error).message}`);
    } finally { setOcupado(false); }
  }

  async function probar() {
    setOcupado(true); setMsg(null);
    const { data, error } = await createClient().functions.invoke("avisar-precios", { body: { prueba: true } });
    setOcupado(false);
    if (error) setMsg("No pude mandar la de prueba.");
    else setMsg((data as { enviadas?: number })?.enviadas ? "Te mandé una de prueba. Si no la ves, revisá que el celu no tenga las notificaciones silenciadas." : "No encontré este celu registrado. Tocá Activar de nuevo.");
  }

  if (estado === "cargando" || estado === "sin-soporte") return null;

  return (
    <section className="mt-4 rounded-2xl bg-cielo p-4">
      <p className="text-[15px] font-bold text-cielo-tinta">🔔 Avisos de precio</p>
      {estado === "activo" ? (
        <>
          <p className="text-sm text-suave">Activados en este celu. Todos los días a las 11:30 te aviso si algo de tu lista o de lo que comprás seguido bajó 5% o más, tocó tu tope o está en el mínimo del mes.</p>
          <button onClick={probar} disabled={ocupado} className="mt-2 text-sm font-semibold text-cielo-tinta disabled:opacity-50">Mandarme una de prueba</button>
        </>
      ) : estado === "iphone" ? (
        <p className="text-sm text-suave">En iPhone primero agregá la app a la pantalla de inicio (Compartir → Agregar a inicio), abrila desde ahí y vas a ver el botón para activar los avisos.</p>
      ) : estado === "bloqueado" ? (
        <p className="text-sm text-suave">Las notificaciones están bloqueadas para esta app. Habilitalas en los ajustes del navegador (candado al lado de la dirección → Notificaciones) y volvé a abrir.</p>
      ) : (
        <>
          <p className="text-sm text-suave">Te aviso al celu cuando algo de tu lista o de lo que comprás seguido baja 5% o más.</p>
          <button onClick={activar} disabled={ocupado} className="mt-2 rounded-xl bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{ocupado ? "Activando…" : "Activar notificaciones"}</button>
        </>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
