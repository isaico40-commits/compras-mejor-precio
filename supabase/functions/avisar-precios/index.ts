// Manda las alertas de precio por notificación push.
// Lo llama pg_cron todos los días después de la importación de Precios Claros,
// y la app con {"prueba": true} para mandar una notificación de prueba al usuario logueado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP = "https://compras-mejor-precio.vercel.app";

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Alerta = { user_id: string; clave: string; tipo: string; titulo: string; texto: string; precio: number; url: string };

// La app llama a la función desde el navegador: hace falta CORS (si no, el celu solo manda el OPTIONS y la prueba falla)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

const miles = (s: string) => s.replace(/(\d),(?=\d{3}\b)/g, "$1.");

async function claves() {
  const { data } = await db.rpc("push_claves_leer");
  let k = (data as { publica: string; privada: string }[] | null)?.[0];
  if (!k) {
    // Primera vez: se generan acá y quedan guardadas en la base (la privada nunca sale de Supabase)
    const n = webpush.generateVAPIDKeys();
    await db.rpc("push_claves_guardar", { p_publica: n.publicKey, p_privada: n.privateKey });
    const { data: d2 } = await db.rpc("push_claves_leer");
    k = (d2 as { publica: string; privada: string }[])[0];
  }
  webpush.setVapidDetails("mailto:avisos@compras-mejor-precio.app", k.publica, k.privada);
  return k;
}

async function enviar(subs: Sub[], payload: Record<string, unknown>) {
  let ok = 0;
  const errores: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
      ok++;
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      const detalle = `${new URL(s.endpoint).host} ${err.statusCode ?? "-"} ${err.message ?? ""} ${err.body ?? ""}`.trim();
      console.error("push", detalle);
      errores.push(detalle);
      if (err.statusCode === 410) await db.from("push_suscripciones").delete().eq("id", s.id); // el celu la dio de baja
    }
  }
  return { ok, errores };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const body = await req.json().catch(() => ({}));
  const k = await claves();
  if (body.clave) return json({ publica: k.publica });

  // Prueba: al usuario que la pide (con su sesión)
  if (body.prueba) {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ error: "sin sesión" }, 401);
    const { data: subs } = await db.from("push_suscripciones").select("*").eq("user_id", u.user.id);
    const r = await enviar((subs as Sub[]) ?? [], { title: "Listo 🛒", body: "Así te van a llegar las alertas cuando algo baje de precio.", url: "/" });
    return json({ enviadas: r.ok, suscripciones: subs?.length ?? 0, errores: r.errores });
  }

  // Envío diario
  const [{ data: alertas, error }, { data: subs }] = await Promise.all([
    db.rpc("alertas_push"),
    db.from("push_suscripciones").select("*"),
  ]);
  if (error) return json({ error: error.message }, 500);
  const porUsuario = new Map<string, Alerta[]>();
  for (const a of (alertas as Alerta[]) ?? []) porUsuario.set(a.user_id, [...(porUsuario.get(a.user_id) ?? []), a]);

  let enviadas = 0;
  for (const [uid, lista] of porUsuario) {
    const susc = ((subs as Sub[]) ?? []).filter((s) => s.user_id === uid);
    if (!susc.length) continue;
    const payload = lista.length === 1
      ? { title: lista[0].titulo, body: miles(lista[0].texto), url: lista[0].url, tag: lista[0].clave }
      : {
          title: `📉 Bajaron de precio ${lista.length} cosas`,
          body: lista.slice(0, 4).map((a) => `${a.titulo.replace(/^\S+\s/, "")}: ${miles(a.texto)}`).join("\n") + (lista.length > 4 ? `\ny ${lista.length - 4} más` : ""),
          url: "/", tag: "alertas",
        };
    const n = (await enviar(susc, payload)).ok;
    if (n > 0) {
      enviadas += n;
      await db.from("push_enviados").upsert(lista.map((a) => ({ user_id: uid, clave: a.clave, precio: a.precio, enviado_at: new Date().toISOString() })));
    }
  }
  return json({ alertas: (alertas as Alerta[] | null)?.length ?? 0, enviadas, app: APP });
});
