// ============ Protocolo · Edge Function "avisos" ============
// Cada 10 minutos la llama pg_cron: revisa qué avisos tocan (hora de Chile), arma el texto
// con los datos de cada usuario y lo manda por web push. Cada aviso sale una vez al día.
// También atiende la prueba desde Ajustes (con la sesión del usuario).
//
// Secreto requerido en Supabase → Edge Functions → Secrets: VAPID_PRIVATE_KEY.
// Esta función no exige JWT: el modo cron solo manda los avisos que ya tocan y no se repiten.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { hoyLogico, minutosAhora, fechaChile, addDias, clave } from './logica.js';
import { AVISOS, avisosDelMomento, contenido } from './avisos.js';

const VAPID_PUBLIC = 'BCCGUn1WW78Xp-Y1_Sq2KCjovCPT85MQBdfR_AVORG-TlAlGpa7K0iEcxGxxMTqPZfEDDfO3M7cCDRKkDd4Sdrk';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': 'https://panchososososo.github.io',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let vapidListo = false;
function vapid() {
  if (vapidListo) return;
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!priv) throw new Error('Falta el secreto VAPID_PRIVATE_KEY');
  webpush.setVapidDetails('https://panchososososo.github.io/protocolo/', VAPID_PUBLIC, priv);
  vapidListo = true;
}

type Sub = { endpoint: string; user_id: string; suscripcion: any };

async function enviar(subs: Sub[], payload: Record<string, string>) {
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.suscripcion, JSON.stringify(payload), { TTL: 3 * 3600 });
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      console.error('push falló', code, new URL(s.endpoint).host, (e as { body?: string }).body);
      if (code === 404 || code === 410) await sb.from('p_push').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

async function datosDe(uid: string, hoy: string) {
  const desde = addDias(hoy, -70);
  const [h, r, i, rg, rr, ex] = await Promise.all([
    sb.from('p_habitos').select('*').eq('user_id', uid),
    sb.from('p_rutinas').select('*').eq('user_id', uid),
    sb.from('p_rutina_items').select('*').eq('user_id', uid),
    sb.from('p_registros').select('habito_id,fecha,valor').eq('user_id', uid).gte('fecha', desde),
    sb.from('p_registros_rutina').select('item_id,fecha,hecho').eq('user_id', uid).gte('fecha', addDias(hoy, -7)),
    sb.from('p_externos').select('fuente,fecha,detalle').eq('user_id', uid).gte('fecha', desde),
  ]);
  for (const x of [h, r, i, rg, rr, ex]) if (x.error) throw x.error;
  const D = { habitos: h.data!, rutinas: r.data!, items: i.data!, regs: {} as Record<string, number>, regsRut: {} as Record<string, boolean>, ext: {} as Record<string, unknown> };
  for (const x of rg.data!) D.regs[clave(x.habito_id, x.fecha)] = +x.valor;
  for (const x of rr.data!) D.regsRut[clave(x.item_id, x.fecha)] = !!x.hecho;
  for (const x of ex.data!) D.ext[clave(x.fuente, x.fecha)] = x.detalle || {};
  return D;
}

const payload = (id: string, c: { titulo: string; cuerpo: string }) =>
  ({ title: c.titulo, body: c.cuerpo, tag: 'protocolo-' + id, url: './' });

// ---------- modo cron ----------
async function ronda() {
  const ahora = Date.now(), f = hoyLogico(ahora), min = minutosAhora(ahora);
  const diaSemana = new Date(fechaChile(ahora) + 'T12:00:00Z').getUTCDay();   // 0 = domingo
  const { data: subs, error } = await sb.from('p_push').select('endpoint,user_id,suscripcion');
  if (error) throw error;
  const porUsuario = new Map<string, Sub[]>();
  for (const s of subs as Sub[]) porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) || []), s]);

  const hecho: string[] = [];
  for (const [uid, lista] of porUsuario) {
    const D = await datosDe(uid, f);
    for (const av of avisosDelMomento(min, diaSemana, D.rutinas)) {
      const { error: e } = await sb.from('p_avisos_log').insert({ user_id: uid, aviso: av.id, fecha: f });
      if (e) { if (e.code !== '23505') console.error('log', e); continue; }   // ya salió hoy
      const c = contenido(av, D, f);
      if (!c) { hecho.push(av.id + ':nada'); continue; }
      vapid();
      hecho.push(av.id + ':' + (await enviar(lista, payload(av.id, c))));
    }
  }
  return { fecha: f, hora: min, usuarios: porUsuario.size, hecho };
}

// ---------- modo prueba (desde Ajustes) ----------
async function prueba(req: Request, cuerpo: { aviso?: string }) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Sesión no válida' }, 401);
  const uid = data.user.id;
  const { data: subs } = await sb.from('p_push').select('endpoint,user_id,suscripcion').eq('user_id', uid);
  if (!subs || !subs.length) return json({ error: 'Este usuario no tiene dispositivos con avisos' }, 400);
  vapid();
  let c = { titulo: 'Avisos activados', cuerpo: 'Así se verán los avisos de Protocolo.' };
  if (cuerpo.aviso) {
    const av = AVISOS.find(a => a.id === cuerpo.aviso);
    if (!av) return json({ error: 'Aviso desconocido' }, 400);
    const f = hoyLogico();
    c = contenido(av, await datosDe(uid, f), f) || { titulo: 'Todo al día', cuerpo: `El aviso "${av.id}" no tendría nada que decir ahora.` };
  }
  return json({ enviados: await enviar(subs as Sub[], payload(cuerpo.aviso || 'prueba', c)) });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
  try {
    const cuerpo = await req.json().catch(() => ({}));
    if (cuerpo.prueba) return await prueba(req, cuerpo);
    return json(await ronda());
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
