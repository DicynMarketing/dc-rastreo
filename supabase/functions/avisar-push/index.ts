// Manda una notificación al teléfono del cliente cuando su pedido cambia de etapa.
// La llama el trigger push_al_cambiar (tabla pedidos). Solo recibe el id del pedido y arma el aviso
// con lo que hay en la base de datos; push_log evita avisar dos veces la misma etapa o hacia atrás.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUB = "BHgbtVy3w1lqsV1hRfP1vuVNGaSLqxsehoG4UD4tAo_b91iHfwEwKLrhGuaYFiJUgJqD6xCJOI9GRJILwU6eKQc";
const T: Record<string, string[]> = {
  es: ["🛍️ ¡Compramos tu pedido!", "📦 Tu pedido se está preparando", "🏭 Tu pedido salió del almacén", "✈️ Tu pedido va en vuelo hacia Panamá", "🇵🇦 Tu pedido llegó a Panamá", "🛃 Tu pedido está en aduana", "📦 Tu pedido llegó a Dicyn Marketing", "🚚 Estamos preparando tu entrega", "✅ ¡Tu pedido fue entregado!"],
  en: ["🛍️ We bought your order!", "📦 Your order is being prepared", "🏭 Your order left the warehouse", "✈️ Your order is flying to Panama", "🇵🇦 Your order arrived in Panama", "🛃 Your order is in customs", "📦 Your order reached Dicyn Marketing", "🚚 We're preparing your delivery", "✅ Your order was delivered!"],
  pt: ["🛍️ Compramos seu pedido!", "📦 Seu pedido está sendo preparado", "🏭 Seu pedido saiu do armazém", "✈️ Seu pedido está voando para o Panamá", "🇵🇦 Seu pedido chegou ao Panamá", "🛃 Seu pedido está na alfândega", "📦 Seu pedido chegou à Dicyn Marketing", "🚚 Estamos preparando sua entrega", "✅ Seu pedido foi entregue!"],
  fr: ["🛍️ Nous avons acheté ta commande !", "📦 Ta commande est en préparation", "🏭 Ta commande a quitté l'entrepôt", "✈️ Ta commande vole vers le Panama", "🇵🇦 Ta commande est arrivée au Panama", "🛃 Ta commande est en douane", "📦 Ta commande est chez Dicyn Marketing", "🚚 Nous préparons ta livraison", "✅ Ta commande a été livrée !"],
};
const B: Record<string, string> = { es: "Toca para ver tu seguimiento", en: "Tap to see your tracking", pt: "Toque para ver o rastreamento", fr: "Touche pour voir ton suivi" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string" || id.length > 40) return json({ ok: false }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: p } = await sb.from("pedidos").select("id,cliente,vista").eq("id", id).maybeSingle();
  const i = Number(p?.vista?.i);
  if (!p?.cliente || !(i >= 0 && i <= 8)) return json({ ok: true, envio: 0 });
  const { data: log } = await sb.from("push_log").select("i").eq("pedido", id).maybeSingle();
  if (log && log.i >= i) return json({ ok: true, envio: 0 });
  await sb.from("push_log").upsert({ pedido: id, i, f: new Date().toISOString() });
  const { data: regs } = await sb.from("registros").select("id").eq("cliente", p.cliente);
  if (!regs?.length) return json({ ok: true, envio: 0 });
  const { data: subs } = await sb.from("push_subs").select("*").in("registro", regs.map((r) => r.id));
  if (!subs?.length) return json({ ok: true, envio: 0 });
  const { data: priv } = await sb.rpc("push_vapid");
  webpush.setVapidDetails("https://dicynmarketing.github.io/dc-rastreo/", PUB, priv as string);
  let envio = 0;
  for (const s of subs) {
    const l = T[s.lang] ? s.lang : "es";
    const carga = JSON.stringify({ title: T[l][i], body: `${p.vista.code || id} · ${B[l]}`, url: `./#${p.vista.code || id}`, tag: id });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 86400 });
      envio++;
    } catch (e) {
      const c = (e as { statusCode?: number }).statusCode;
      if (c === 404 || c === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); // el teléfono ya no la usa
    }
  }
  return json({ ok: true, envio });
});
