// Rastreo automático de guías con PRS Delivery para DC Rastreo.
// Corre cada hora (pg_cron). Toma las guías de los pedidos que aún no se marcan "Recibido",
// pregunta a PRS dónde va cada una (la misma consulta pública de prsdelivery.com, sin clave)
// y avanza las etapas 2 a 6 sin retroceder. "Recibido" (7), "Preparando despacho" (8) y
// "Entregado" (9) los marcan Diego o Cinthya a mano.
// En cada guía guarda el último movimiento de PRS (q.prs) y si PRS ya la entregó (q.prs.ent).
// También recalcula la "vista" que ve el cliente (sin artículos ni precios).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PRS = "https://sealcargotrack.cloud/api/v2/prod/tracking";
// CORS: el panel (GitHub Pages) llama a esta función al registrar una guía
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...CORS } });

// deno-lint-ignore no-explicit-any
type Any = any;

// Etapas: 1 Realizado · 2 Temu lo prepara · 3 Salió del almacén · 4 En vuelo · 5 Llegó a Panamá · 6 En aduana / en reparto
function etapaMov(m: Any): number {
  const c = String(m?.code || "").toUpperCase(), d = String(m?.description || "").toLowerCase();
  if (/^PTY0*1$/.test(c) || /arriv|llegada/.test(d) && /pty|panam/.test(d + String(m?.location || "").toLowerCase())) return 5;
  if (/^PTY/.test(c) || /custom|aduan/.test(d)) return 6;
  if (/^LM/.test(c)) return 6;
  if (/depart|flight|airline|vuelo|take ?off/.test(d)) return 4;
  if (/^CNUS0[12]$/.test(c) || /order placed|label/.test(d)) return 2;
  if (/^CN/.test(c)) return 3;
  return 0;
}
const textoMov = (m: Any) => {
  const d = String(m?.description || "").replace(/^\([^)]*\)\s*/, "").trim();
  const i = d.lastIndexOf(" - ");
  return (i > 0 ? d.slice(i + 3) : d).slice(0, 120);
};

function leerPRS(r: Any) {
  // Formato normal: {isSuccess, movements:[...]}. Otro formato posible: {is_guia:true, "(COD) texto": "fecha", ...}
  let movs: Any[] = [];
  if (r?.is_guia === true) {
    movs = Object.entries(r).filter(([k, v]) => k !== "is_guia" && typeof v === "string")
      .map(([k, v]) => ({ code: (k.match(/^\(([^)]+)\)/) || [])[1] || "", description: k, timestamp: v }));
  } else if (r?.isSuccess) movs = r.movements || [];
  movs = movs.filter((m) => m?.timestamp && !isNaN(+new Date(m.timestamp)))
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  let et = 1;
  const fechas: Record<number, string> = {};
  for (const m of movs) {
    const k = etapaMov(m);
    if (!k) continue;
    if (k > et) et = k;
    if (!fechas[k]) fechas[k] = new Date(m.timestamp).toISOString();
  }
  const ult = movs[movs.length - 1];
  const ent = r?.was_delivered === true || movs.some((m) => /^LM360$/i.test(m.code || "") || /entregado a cliente|delivered to/i.test(m.description || ""));
  return { et, fechas, ult: ult ? { t: textoMov(ult), f: new Date(ult.timestamp).toISOString(), c: ult.code || "", lugar: ult.location || "" } : null, ent };
}

async function consultar(g: string) {
  const r = await fetch(PRS, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ tracking: g }) });
  if (r.status === 404) return null; // PRS aún no la conoce
  if (!r.ok) throw new Error(`PRS ${r.status}`);
  return leerPRS(await r.json());
}

function etapaPedido(o: Any) {
  const paq = o?.paq || [];
  if (!paq.length) return o?.rec ? 7 + (o.local || []).length : o?.tpo || o?.comprado ? 1 : 0;
  const m = Math.min(...paq.map((p: Any) => (p.h || []).length));
  return m < 7 ? m : 7 + (o.local || []).length;
}

// Igual que vistaCli() del panel: lo único que ve el cliente
function vista(o: Any, c: Any) {
  const e = etapaPedido(o);
  if (e < 1) return null;
  const paq = o.paq || [];
  const lenta = paq.length ? paq.reduce((a: Any, p: Any) => (p.h.length < a.h.length ? p : a)) : null;
  const h = (lenta ? lenta.h.slice(0, 7) : o.rec ? [o.creado, null, null, null, null, null, o.rec] : [o.creado]).concat(e >= 7 ? (o.local || []).slice(0, 2) : []);
  // Pago (lo que paga el cliente; nunca costos)
  const num = (x: Any) => +x || 0;
  const T = num(o.precio) + (o.envio ? num(o.envio.tarifa) : 0);
  const pagos = Array.isArray(o.pagos) ? o.pagos : num(o.abonado) > 0 ? [{ m: num(o.abonado), f: o.creado }] : [];
  const pago = T ? { t: +T.toFixed(2), p: +num(o.abonado).toFixed(2), ab: pagos.map((x: Any) => ({ m: +num(x.m).toFixed(2), f: x.f })) } : null;
  return { code: o.id, nombre: (c?.nombre || "").split(" ")[0], quien: o.quien, h, i: Math.min(e, 9) - 1, ent: c?.ent || "local", prov: c?.prov || "",
    envio: o.envio ? { t: o.envio.t } : null, paq: paq.map((p: Any) => p.h.length), pago };
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const forzar = new URL(req.url).searchParams.get("forzar") === "1";

  // No más de una corrida cada 20 minutos (la URL es pública con la clave anónima)
  const { data: est } = await sb.from("rastreo_estado").select("ultimo").eq("id", 1).maybeSingle();
  if (!forzar && est?.ultimo && Date.now() - new Date(est.ultimo).getTime() < 20 * 60e3) return json({ ok: true, omitido: "corrió hace menos de 20 minutos" });
  const ahora = new Date().toISOString();
  await sb.from("rastreo_estado").upsert({ id: 1, ultimo: ahora });

  try {
    const [{ data: peds, error: e1 }, { data: clis, error: e2 }] = await Promise.all([
      sb.from("pedidos").select("id,data"), sb.from("clientes").select("id,data")]);
    if (e1 || e2) throw e1 || e2;
    const pedidos = (peds || []) as Any[];
    const cli = new Map((clis || []).map((c: Any) => [c.id, c.data]));

    // Guías que todavía no se marcan "Recibido", en pedidos realizados
    const guias = [...new Set(pedidos.filter((p) => { const e = etapaPedido(p.data); return e >= 1 && e < 7; })
      .flatMap((p) => (p.data.paq || []).filter((q: Any) => q?.g && (q.h || []).length < 7).map((q: Any) => String(q.g).trim().toUpperCase())))];

    // Consultar a PRS de 4 en 4, con una pausa corta para no cargar su servidor
    const info: Record<string, Any> = {};
    let errores = 0, sinDatos = 0;
    for (let i = 0; i < guias.length; i += 4) {
      await Promise.all(guias.slice(i, i + 4).map(async (g) => {
        try { const r = await consultar(g); if (r) info[g] = r; else sinDatos++; } catch { errores++; }
      }));
      if (i + 4 < guias.length) await new Promise((r) => setTimeout(r, 400));
    }
    const filas = Object.entries(info).map(([numero, r]) => ({ numero, ultimo_estado: r.ult?.c || null,
      ultimo_evento: r.ult ? { fecha: r.ult.f, texto: r.ult.t, lugar: r.ult.lugar, entregado: r.ent } : null, actualizado: ahora }));
    if (filas.length) await sb.from("guias_rastreo").upsert(filas);

    // Avanzar etapas (nunca retroceder, nunca pasar de 6). Si la guía la comparten varios clientes, se actualizan todos.
    let actualizados = 0;
    for (const p of pedidos) {
      let cambio = false;
      for (const q of p.data.paq || []) {
        const r = info[String(q?.g || "").toUpperCase()];
        if (!r || (q.h || []).length >= 7) continue;
        q.h = q.h || [];
        const et = Math.min(6, r.et);
        while (q.h.length < et) {
          const k = q.h.length + 1;
          // Si PRS no tiene fecha para una etapa intermedia, usa la de la siguiente que sí tenga
          let f = r.fechas[k];
          for (let j = k + 1; !f && j <= 6; j++) f = r.fechas[j];
          q.h.push(f || ahora); cambio = true;
        }
        const prs = r.ult ? { t: r.ult.t, f: r.ult.f, ent: r.ent } : null;
        if (prs && !igual(q.prs, prs)) { q.prs = prs; cambio = true; }
      }
      if (cambio) {
        const { error } = await sb.from("pedidos").update({ data: p.data, vista: vista(p.data, cli.get(p.data.cli)), actualizado: ahora }).eq("id", p.id);
        if (error) throw error;
        actualizados++;
      }
    }
    const resumen = { fuente: "PRS Delivery", guias: guias.length, con_datos: Object.keys(info).length, sin_datos: sinDatos, errores, actualizados, fecha: ahora };
    await sb.from("rastreo_estado").upsert({ id: 1, ultimo: ahora, resumen });
    return json({ ok: true, ...resumen });
  } catch (e) {
    const resumen = { error: String((e as Error)?.message || e), fecha: ahora };
    await sb.from("rastreo_estado").upsert({ id: 1, ultimo: ahora, resumen });
    return json({ ok: false, ...resumen }, 500);
  }
});
