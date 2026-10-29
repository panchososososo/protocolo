// ============ Protocolo · app ============
import {
  SEMANAS, fechaChile, hoyLogico, minutosAhora, addDias, dow, lunes, fechaLarga, hhmm, normalizarHora,
  usarDatos, reindexar, clave, total, manual, registrado, estado, extCumple, extDe, racha, hechosSemana,
  pctDia, nivel, diariosDel, semanasCalendario, inicioHabito, LECTORES, MESES,
} from './logica.js';
import { AVISOS, horaDe } from './avisos.js';

// Mismo proyecto de Supabase que Base Lunar. La publishable key es pública por diseño:
// lo que protege los datos son las políticas RLS de esquema.sql.
const SUPABASE_URL = 'https://nkdaxyghjbnpyyykvaiw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FecmQheHtiTHEX_KVe5ueg_xSfPIGr_';
const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm';
const VERSION = '1.1.0';
// Clave pública de los avisos (web push). La privada vive solo en Supabase.
const VAPID_PUBLIC = 'BCCGUn1WW78Xp-Y1_Sq2KCjovCPT85MQBdfR_AVORG-TlAlGpa7K0iEcxGxxMTqPZfEDDfO3M7cCDRKkDd4Sdrk';
const AVISOS_URL = SUPABASE_URL + '/functions/v1/avisos';
const VENTANA = SEMANAS * 7 + 14;          // días de historia que se cargan
const GH_CADA = 10 * 60e3;                 // leer las otras apps como máximo cada 10 min

// ---------- almacenamiento local ----------
const LS = 'protocolo.v1.';
const leer = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const escribir = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch {} };
const borrarLocal = () => { try { Object.keys(localStorage).filter(k => k.startsWith(LS)).forEach(k => localStorage.removeItem(k)); } catch {} };

const D = {
  habitos: leer('habitos', []), rutinas: leer('rutinas', []), items: leer('items', []),
  regs: leer('regs', {}), regsRut: leer('regsRut', {}), ext: leer('ext', {}),
  cola: leer('cola', []),
};
usarDatos(D);
function persistir() {
  for (const k of ['habitos', 'rutinas', 'items', 'regs', 'regsRut', 'ext', 'cola']) escribir(k, D[k]);
}

const S = {
  sb: null, user: leer('usuario', null), listo: false, sinEsquema: false, errorInicio: null,
  vista: leer('vista', 'hoy'), dia: 'hoy', sel: null, abiertas: new Set(), editando: null,
  verArchivados: false, estado: 'ok', gh: leer('gh', {}), bl: leer('bl', null),
  crono: leer('crono', null), push: 'cargando',
};

// ---------- utilidades ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => crypto.randomUUID();
const ahoraISO = () => new Date().toISOString();
const $ = s => document.querySelector(s);
let toastTimer;
function toast(txt) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = txt; t.className = 'show';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}
const fechaVista = () => S.dia === 'ayer' ? addDias(hoyLogico(), -1) : hoyLogico();
const editable = f => f >= addDias(hoyLogico(), -1) && f <= hoyLogico();

// ---------- íconos ----------
const P = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  droplet: '<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  tooth: '<path d="M8 3.5c-2.7 0-4.5 2-4.5 4.6 0 2.6 1.4 3.6 1.9 6.4.5 3 1 6 2.5 6s1.6-3.8 4.1-3.8 2.6 3.8 4.1 3.8 2-3 2.5-6c.5-2.8 1.9-3.8 1.9-6.4 0-2.6-1.8-4.6-4.5-4.6-1.8 0-2.6.9-4 .9s-2.2-.9-4-.9z"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z"/>',
  flask: '<path d="M9 3h6M10 3v6.5l-5 8.3A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.2L14 9.5V3M7.6 15h8.8"/>',
  wallet: '<path d="M4 7.5h15a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11"/><path d="M16 13.5h.01"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  phone: '<path d="M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 4.8a3.2 3.2 0 0 1 0 6.4M21 20c0-2.6-1.6-4.9-4-5.7"/>',
  manga: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  hoy: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.3 9"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  lista: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10M5 6.5h.01M5 12h.01M5 17.5h.01"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  play: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  up: '<path d="M6.5 14.5l5.5-5.5 5.5 5.5"/>',
  down: '<path d="M6.5 9.5l5.5 5.5 5.5-5.5"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const ICONOS_HABITO = ['moon', 'sun', 'droplet', 'book', 'tooth', 'dumbbell', 'ball', 'flask', 'wallet', 'heart', 'phone', 'users', 'manga', 'circle'];
const I = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.circle}</svg>`;

const ORIGENES = {
  manual: 'Manual', fierro: 'Fierro', bitacora: 'Bitácora PDT', baselunar: 'Base Lunar',
  appbb: 'Nosotros', futsal: 'Bitácora del Arquero',
};
const TIPOS = { si_no: 'Sí / no', cantidad: 'Cantidad', minutos: 'Minutos', hora: 'Hora', conteo: 'Conteo' };

// ============================================================
// Cola de cambios: se guarda al tiro en el teléfono y se sube cuando hay red
// ============================================================
const PRIORIDAD = { p_habitos: 0, p_rutinas: 1, p_rutina_items: 2, p_registros: 3, p_registros_rutina: 3, p_externos: 4 };
const CONFLICTO = {
  p_habitos: 'id', p_rutinas: 'id', p_rutina_items: 'id',
  p_registros: 'habito_id,fecha', p_registros_rutina: 'item_id,fecha', p_externos: 'user_id,fuente,fecha',
};
function encolar(op) {
  D.cola = D.cola.filter(o => o.clave !== op.clave);
  D.cola.push(op);
  escribir('cola', D.cola);
  programarEnvio();
}
let enviando = false, timerEnvio = null;
function programarEnvio(ms = 500) { clearTimeout(timerEnvio); timerEnvio = setTimeout(enviar, ms); }
function mensajeError(e) {
  if (e.code === '42501') return 'Solo se puede registrar hoy o ayer.';
  if (e.code === '23503') return 'Ese hábito ya no existe.';
  return e.message || '';
}
async function enviar() {
  if (enviando || !S.sb || !S.user || !D.cola.length) { pintarSync(); return; }
  if (!navigator.onLine) { pintarSync(); return; }
  enviando = true; S.estado = 'enviando'; pintarSync();
  try {
    const ops = [...D.cola].sort((a, b) => PRIORIDAD[a.tabla] - PRIORIDAD[b.tabla]);
    for (const op of ops) {
      const q = S.sb.from(op.tabla);
      const r = op.borrar ? await q.delete().match(op.match) : await q.upsert(op.fila, { onConflict: CONFLICTO[op.tabla] });
      if (r.error) {
        if (r.error.code) { quitar(op); toast('No se guardó un cambio. ' + mensajeError(r.error)); continue; }
        throw r.error;                     // sin código = sin red: se reintenta después
      }
      quitar(op);
    }
    S.estado = 'ok';
  } catch {
    S.estado = 'offline';
    programarEnvio(30e3);
  } finally {
    enviando = false; pintarSync();
  }
}
function quitar(op) { D.cola = D.cola.filter(o => o !== op); escribir('cola', D.cola); }

// Aplica lo pendiente sobre lo que llegó del servidor, para no perder cambios hechos sin red.
function aplicarCola() {
  for (const op of D.cola) {
    const f = op.fila || op.match;
    if (op.tabla === 'p_registros') {
      if (op.borrar) delete D.regs[clave(f.habito_id, f.fecha)];
      else D.regs[clave(f.habito_id, f.fecha)] = +f.valor;
    } else if (op.tabla === 'p_registros_rutina') {
      D.regsRut[clave(f.item_id, f.fecha)] = !!f.hecho;
    } else if (op.tabla === 'p_externos') {
      if (op.borrar) delete D.ext[clave(f.fuente, f.fecha)];
      else D.ext[clave(f.fuente, f.fecha)] = f.detalle;
    } else {
      const lista = { p_habitos: D.habitos, p_rutinas: D.rutinas, p_rutina_items: D.items }[op.tabla];
      const i = lista.findIndex(x => x.id === f.id);
      if (i >= 0) lista[i] = { ...lista[i], ...f }; else lista.push(f);
    }
  }
}

// ---------- escrituras ----------
function setValor(h, f, valor) {
  if (!editable(f)) { toast('Solo se puede registrar hoy o ayer.'); return; }
  D.regs[clave(h.id, f)] = valor;
  encolar({ tabla: 'p_registros', clave: 'r|' + h.id + '|' + f, fila: { habito_id: h.id, fecha: f, valor, actualizado: ahoraISO() } });
  escribir('regs', D.regs); render();
}
function borrarValor(h, f) {
  if (!editable(f)) return;
  delete D.regs[clave(h.id, f)];
  encolar({ tabla: 'p_registros', clave: 'r|' + h.id + '|' + f, borrar: true, match: { habito_id: h.id, fecha: f } });
  escribir('regs', D.regs); render();
}
function setItem(it, f, hecho) {
  if (!editable(f)) { toast('Solo se puede registrar hoy o ayer.'); return; }
  D.regsRut[clave(it.id, f)] = hecho;
  encolar({ tabla: 'p_registros_rutina', clave: 'ri|' + it.id + '|' + f, fila: { item_id: it.id, fecha: f, hecho, actualizado: ahoraISO() } });
  escribir('regsRut', D.regsRut); render();
}
function guardarDef(tabla, fila) {
  const lista = { p_habitos: D.habitos, p_rutinas: D.rutinas, p_rutina_items: D.items }[tabla];
  fila = { ...fila, actualizado: ahoraISO() };
  const i = lista.findIndex(x => x.id === fila.id);
  if (i >= 0) lista[i] = fila; else lista.push(fila);
  encolar({ tabla, clave: tabla + '|' + fila.id, fila });
  reindexar(); persistir();
}

// ============================================================
// Lectura desde Supabase
// ============================================================
async function todo(tabla, filtro, columnas = '*') {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    let q = S.sb.from(tabla).select(columnas);
    if (filtro) q = filtro(q);
    const r = await q.range(desde, desde + 999);
    if (r.error) throw r.error;
    out.push(...r.data);
    if (r.data.length < 1000) return out;
  }
}
async function traer() {
  if (!S.sb || !S.user || !navigator.onLine) return false;
  const desde = addDias(hoyLogico(), -VENTANA);
  const conFecha = q => q.gte('fecha', desde);
  try {
    const [h, r, i, rg, rr, ex] = await Promise.all([
      todo('p_habitos'), todo('p_rutinas'), todo('p_rutina_items'),
      todo('p_registros', conFecha), todo('p_registros_rutina', conFecha), todo('p_externos', conFecha),
    ]);
    S.sinEsquema = false;
    D.habitos = h; D.rutinas = r; D.items = i;
    D.regs = {}; for (const x of rg) D.regs[clave(x.habito_id, x.fecha)] = +x.valor;
    D.regsRut = {}; for (const x of rr) D.regsRut[clave(x.item_id, x.fecha)] = !!x.hecho;
    const bl = Object.fromEntries(Object.entries(D.ext).filter(([k]) => k.startsWith('baselunar|')));
    D.ext = bl; for (const x of ex) D.ext[clave(x.fuente, x.fecha)] = x.detalle || {};
    aplicarCola(); reindexar(); persistir();
    return true;
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))) S.sinEsquema = true;
    return false;
  }
}

// Base Lunar: mismo proyecto, así que se lee directo y desde cualquier dispositivo.
async function leerBaseLunar() {
  if (!S.sb || !S.user || !navigator.onLine) return;
  try {
    const filas = await todo('movimientos', q => q.gte('fecha', addDias(hoyLogico(), -VENTANA)), 'fecha');
    for (const k of Object.keys(D.ext)) if (k.startsWith('baselunar|')) delete D.ext[k];
    for (const { fecha } of filas) {
      const k = clave('baselunar', String(fecha).slice(0, 10));
      D.ext[k] = { movimientos: ((D.ext[k] && D.ext[k].movimientos) || 0) + 1 };
    }
    S.bl = { ok: true, dias: new Set(filas.map(f => f.fecha)).size, cuando: Date.now() };
  } catch (e) {
    S.bl = { ok: false, error: e.message || 'No pude leer Base Lunar', cuando: Date.now() };
  }
  escribir('bl', S.bl); escribir('ext', D.ext);
}

// ============================================================
// Otras apps vía Gist (Fierro, Bitácora PDT, app-bb, Bitácora del Arquero)
// ============================================================
const GISTS = { fierro: 'fierro.json', bitacora: 'bitacora_pdt.json', appbb: 'nosotros.json', futsal: 'futsal.json' };
const tokenGH = () => leer('ghToken', '');
async function gh(path) {
  const r = await fetch('https://api.github.com' + path, {
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tokenGH() },
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'Token inválido o vencido' : r.status === 403 ? 'El token no tiene permiso de Gists' : 'GitHub respondió ' + r.status);
  return r.json();
}
async function leerGists(forzar = false) {
  if (!tokenGH() || !S.user || !navigator.onLine) return;
  if (!forzar && Date.now() - (S.gh.cuando || 0) < GH_CADA) return;
  const estadoGH = { cuando: Date.now(), fuentes: {} };
  let lista;
  try {
    lista = [];
    for (let p = 1; p <= 5; p++) {
      const pag = await gh(`/gists?per_page=100&page=${p}`);
      lista.push(...pag);
      if (pag.length < 100) break;
    }
  } catch (e) {
    estadoGH.error = e.message; S.gh = estadoGH; escribir('gh', S.gh); render(); return;
  }
  const desde = addDias(hoyLogico(), -VENTANA);
  for (const [fuente, archivo] of Object.entries(GISTS)) {
    try {
      const g = lista.filter(x => x.files && x.files[archivo]).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0];
      if (!g) { estadoGH.fuentes[fuente] = { ok: false, error: `No encontré ${archivo}` }; continue; }
      const full = await gh('/gists/' + g.id);
      const f = full.files[archivo];
      let txt = f.content;
      if (f.truncated) txt = await (await fetch(f.raw_url)).text();
      const dias = LECTORES[fuente](JSON.parse(txt));
      sincronizarExterno(fuente, dias, desde);
      const fechas = Object.keys(dias).sort();
      estadoGH.fuentes[fuente] = { ok: true, dias: fechas.length, ultimo: fechas.at(-1) || null };
    } catch (e) {
      estadoGH.fuentes[fuente] = { ok: false, error: e.message || 'No pude leerlo' };
    }
  }
  S.gh = estadoGH; escribir('gh', S.gh); escribir('ext', D.ext); render();
}
// Sube a p_externos solo lo que cambió, para que el notebook y la tablet lo vean sin token.
function sincronizarExterno(fuente, dias, desde) {
  const prefijo = fuente + '|';
  for (const k of Object.keys(D.ext)) {
    if (!k.startsWith(prefijo)) continue;
    const f = k.slice(prefijo.length);
    if (f >= desde && !dias[f]) {
      delete D.ext[k];
      encolar({ tabla: 'p_externos', clave: 'e|' + k, borrar: true, match: { user_id: S.user.id, fuente, fecha: f } });
    }
  }
  for (const [f, det] of Object.entries(dias)) {
    if (f < desde) continue;
    const k = clave(fuente, f);
    if (JSON.stringify(D.ext[k]) === JSON.stringify(det)) continue;
    D.ext[k] = det;
    encolar({ tabla: 'p_externos', clave: 'e|' + k, fila: { user_id: S.user.id, fuente, fecha: f, detalle: det, actualizado: ahoraISO() } });
  }
}

// ============================================================
// Primer uso: hábitos y rutinas de la especificación
// ============================================================
function sembrar() {
  const ahora = ahoraISO();
  let orden = 0;
  const H = o => ({
    id: uuid(), icono: 'circle', tipo: 'si_no', meta: null, unidad: null, paso: 1, cruza_noche: false,
    periodo: 'dia', meta_semanal: null, con_racha: true, origen: 'manual', orden: orden++, archivado: false,
    creado_en: ahora, ...o,
  });
  const h = {
    acostarse: H({ nombre: 'Acostarse', icono: 'moon', tipo: 'hora', meta: 1440, cruza_noche: true }),
    levantarse: H({ nombre: 'Levantarse', icono: 'sun', tipo: 'hora', meta: 465 }),
    agua: H({ nombre: 'Agua', icono: 'droplet', tipo: 'cantidad', meta: 8, unidad: 'vasos' }),
    tesis: H({ nombre: 'Tesis', icono: 'book', tipo: 'minutos', meta: 30, unidad: 'min', paso: 10 }),
    dientes: H({ nombre: 'Lavarse los dientes', icono: 'tooth', tipo: 'conteo', meta: 2 }),
    entreno: H({ nombre: 'Entrenamiento', icono: 'dumbbell', periodo: 'semana', meta_semanal: 3, origen: 'fierro' }),
    futsal: H({ nombre: 'Futsal', icono: 'ball', periodo: 'semana', meta_semanal: 1, origen: 'futsal' }),
    papa: H({ nombre: 'Llamar a papá', icono: 'phone', periodo: 'semana', meta_semanal: 1 }),
    mama: H({ nombre: 'Llamar a mamá', icono: 'phone', periodo: 'semana', meta_semanal: 1 }),
    amigos: H({ nombre: 'Amigos', icono: 'users', periodo: 'semana', meta_semanal: 1 }),
    lab: H({ nombre: 'Lab', icono: 'flask', con_racha: false, origen: 'bitacora' }),
    gastos: H({ nombre: 'Gastos al día', icono: 'wallet', con_racha: false, origen: 'baselunar' }),
    pareja: H({ nombre: 'Pareja', icono: 'heart', con_racha: false, origen: 'appbb' }),
    manga: H({ nombre: 'Manga', icono: 'manga', tipo: 'cantidad', unidad: 'cap.', con_racha: false }),
  };
  for (const x of Object.values(h)) guardarDef('p_habitos', x);

  const R = (clave_, nombre, hora_aviso, orden_, items, dia_aviso = null) => {
    const r = { id: uuid(), clave: clave_, nombre, hora_aviso, dia_aviso, orden: orden_ };
    guardarDef('p_rutinas', r);
    items.forEach(([nom, hab], i) => guardarDef('p_rutina_items', {
      id: uuid(), rutina_id: r.id, nombre: nom, habito_id: hab ? hab.id : null, orden: i, archivado: false,
    }));
  };
  R('manana', 'Mañana', '07:30', 0, [
    ['Vaso de agua', h.agua], ['Lavarse los dientes', h.dientes], ['Ducha y desodorante'],
    ['Desayuno'], ['Mirar el plan del día'],
  ]);
  R('noche', 'Noche', '21:00', 1, [
    ['Lavarse los dientes', h.dientes], ['Lavarse la cara'], ['Preparar mochila y ropa'],
    ['Cargar celular, tablet y reloj'], ['Orden de 10 minutos'],
  ]);
  R('semanal', 'Semanal', '19:00', 2, [
    ['Cortarse las uñas'], ['Afeitarse o recortar barba'], ['Cambiar sábanas y toallas'], ['Lavar ropa del gym'],
    ['Limpiar celular y audífonos'], ['Planificar la semana'],
  ], 0);
  escribir('sembrado.' + S.user.id, true);
}

// ============================================================
// Pantallas
// ============================================================
const habitosActivos = () => D.habitos.filter(h => !h.archivado).sort((a, b) => a.orden - b.orden);
const rutinasOrden = () => [...D.rutinas].sort((a, b) => a.orden - b.orden);
const itemsDe = r => D.items.filter(i => i.rutina_id === r.id && !i.archivado).sort((a, b) => a.orden - b.orden);
const hab = id => D.habitos.find(h => h.id === id);

function render() {
  reindexar();
  const app = $('#app');
  if (!S.user) { app.innerHTML = pantallaLogin(); return; }
  let cuerpo;
  if (S.sinEsquema) cuerpo = pantallaSinEsquema();
  else if (!S.listo && !D.habitos.length) cuerpo = `<p class="vacio">Cargando…</p>`;
  else cuerpo = { hoy: pantallaHoy, cal: pantallaCal, habitos: pantallaHabitos, ajustes: pantallaAjustes }[S.vista]();
  app.innerHTML = `
    <header class="top"><div class="logo">PROTO<b>COLO</b></div><div class="sync" id="sync"></div></header>
    <main>${cuerpo}</main>
    <nav class="bottom"><div class="in">
      ${[['hoy', 'Hoy', 'hoy'], ['cal', 'Calendario', 'cal'], ['habitos', 'Hábitos', 'lista'], ['ajustes', 'Ajustes', 'ajustes']]
        .map(([v, t, ic]) => `<button data-a="vista" data-v="${v}" class="${S.vista === v ? 'on' : ''}">${I(ic)}<span>${t}</span></button>`).join('')}
    </div></nav>`;
  pintarSync();
}
function pintarSync() {
  const el = $('#sync'); if (!el) return;
  const n = D.cola.length;
  let cls = 'ok', txt = 'Al día';
  if (!navigator.onLine) { cls = 'bad'; txt = n ? `Sin red · ${n} pendiente${n > 1 ? 's' : ''}` : 'Sin red'; }
  else if (S.estado === 'enviando') { cls = 'warn'; txt = 'Guardando…'; }
  else if (n) { cls = 'warn'; txt = `${n} pendiente${n > 1 ? 's' : ''}`; }
  el.innerHTML = `<i class="dot ${cls}"></i><span>${txt}</span>`;
}

// ---------- login ----------
function pantallaLogin() {
  return `<div class="login">
    <div class="logo grande">PROTO<b>COLO</b></div>
    <p class="muted">Entra con la misma cuenta de Base Lunar.</p>
    <form data-form="login" class="card pad">
      <label>Correo<input name="email" type="email" autocomplete="email" required></label>
      <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>
      <p class="err" id="login-err">${esc(S.errorInicio || '')}</p>
      <button class="btn pri" type="submit">Entrar</button>
    </form>
  </div>`;
}
function pantallaSinEsquema() {
  return `<div class="card pad aviso">
    <h3>Falta preparar Supabase</h3>
    <p>Las tablas de Protocolo todavía no existen. En Supabase, abre el proyecto de Base Lunar → SQL Editor → New query, pega el contenido de <code>esquema.sql</code> y presiona Run.</p>
    <button class="btn pri" data-a="reintentar">Ya lo corrí, reintentar</button>
  </div>`;
}

// ---------- hoy ----------
function pantallaHoy() {
  const f = fechaVista(), hoy = hoyLogico();
  const hs = habitosActivos();
  const diarios = diariosDel(f);
  const ok = diarios.filter(h => estado(h, f) === 'ok').length;
  const pct = diarios.length ? Math.round(100 * ok / diarios.length) : 0;
  const mins = minutosAhora();
  const auto = r => (r.clave === 'manana' && mins >= 240 && mins < 720) || (r.clave === 'noche' && (mins >= 1140 || mins < 240))
    || (r.clave === 'semanal' && (dow(f) >= 5));
  const grupos = [
    ['Diarios', hs.filter(h => h.con_racha && h.periodo === 'dia')],
    ['Semanales', hs.filter(h => h.con_racha && h.periodo === 'semana')],
    ['Contexto', hs.filter(h => !h.con_racha)],
  ].filter(([, l]) => l.length);
  return `
    <div class="seg" role="tablist">
      <button data-a="dia" data-v="hoy" class="${S.dia === 'hoy' ? 'on' : ''}">Hoy</button>
      <button data-a="dia" data-v="ayer" class="${S.dia === 'ayer' ? 'on' : ''}">Ayer</button>
    </div>
    <p class="fecha">${fechaLarga(f)}${f === hoy ? '' : ' · editable hasta las 04:00'}</p>
    <section class="card pad resumen">
      <div class="big">${pct}<small>%</small></div>
      <div class="res-txt"><b>${ok} de ${diarios.length}</b> hábitos diarios cumplidos
        <div class="barra"><i style="width:${pct}%"></i></div></div>
    </section>
    <h2>Rutinas</h2>
    ${rutinasOrden().map(r => tarjetaRutina(r, f, S.abiertas.has(r.id) || (!S.abiertas.has('x' + r.id) && auto(r)))).join('')}
    ${grupos.map(([t, l]) => `<h2>${t}</h2><section class="card lista">${l.map(h => filaHabito(h, f)).join('')}</section>`).join('')}
  `;
}
function tarjetaRutina(r, f, abierta) {
  const its = itemsDe(r), n = its.filter(i => D.regsRut[clave(i.id, f)]).length;
  const pct = its.length ? Math.round(100 * n / its.length) : 0;
  return `<section class="card rutina ${n === its.length && its.length ? 'completa' : ''}">
    <button class="rut-cab" data-a="rutina" data-id="${r.id}" aria-expanded="${abierta}">
      <span class="rut-nom">${esc(r.nombre)}</span>
      <span class="rut-n">${n}/${its.length}</span>
      ${I('chev', 'i chev' + (abierta ? ' abierta' : ''))}
    </button>
    <div class="barra fina"><i style="width:${pct}%"></i></div>
    ${abierta ? `<ul class="items">${its.map(i => {
      const hecho = !!D.regsRut[clave(i.id, f)], h = i.habito_id && hab(i.habito_id);
      return `<li><button class="item ${hecho ? 'on' : ''}" data-a="item" data-id="${i.id}">
        <span class="caja">${hecho ? I('check') : ''}</span><span>${esc(i.nombre)}</span>
        ${h ? `<span class="tag">${I('link', 'i mini')} ${esc(h.nombre)}</span>` : ''}</button></li>`;
    }).join('')}</ul>` : ''}
  </section>`;
}
function subtitulo(h, f) {
  const hoy = hoyLogico(), r = racha(h, hoy), partes = [];
  const t = total(h, f);
  if (h.periodo === 'semana') partes.push(`${hechosSemana(h, lunes(f), f)}/${h.meta_semanal || 1} esta semana`);
  else if (h.tipo === 'hora') partes.push(`antes de las ${hhmm(h.meta)}`);
  else if (h.tipo === 'cantidad' && h.unidad === 'vasos') partes.push(`${(t * 0.25).toLocaleString('es-CL')} de ${(h.meta * 0.25).toLocaleString('es-CL')} L`);
  else if (h.meta) partes.push(`meta ${h.meta}${h.unidad ? ' ' + h.unidad : ''}`);
  else if (h.unidad) partes.push(h.unidad);
  if (r) partes.push(`racha ${r.n}${r.unidad === 'sem' ? ' sem' : ''}`);
  if (h.origen !== 'manual') {
    const conectada = h.origen === 'baselunar' ? !!(S.bl && S.bl.ok) : !!(S.gh.fuentes && S.gh.fuentes[h.origen] && S.gh.fuentes[h.origen].ok);
    partes.push(extDe(h, f) ? `desde ${ORIGENES[h.origen]}` : conectada ? `nada en ${ORIGENES[h.origen]} este día` : `${ORIGENES[h.origen]} sin conectar`);
  }
  if (S.crono && S.crono.id === h.id) partes.push(`cronómetro ${Math.floor((Date.now() - S.crono.inicio) / 60e3)} min`);
  return partes.join(' · ');
}
function filaHabito(h, f) {
  const st = estado(h, f);
  return `<div class="fila ${st}">
    <div class="ico">${I(h.icono)}</div>
    <div class="txt"><div class="nm">${esc(h.nombre)}</div><div class="sb">${esc(subtitulo(h, f))}</div></div>
    <div class="ctl">${control(h, f, st)}</div>
  </div>`;
}
function control(h, f, st) {
  if (extCumple(h, f)) return `<span class="tog on fijo" title="Registrado en ${ORIGENES[h.origen]}">${I('check')}</span>`;
  const id = h.id;
  if (h.tipo === 'si_no') return `<button class="tog ${st === 'ok' ? 'on' : ''}" data-a="tog" data-id="${id}" aria-pressed="${st === 'ok'}" aria-label="Marcar ${esc(h.nombre)}">${I('check')}</button>`;
  if (h.tipo === 'hora') {
    const tiene = registrado(h, f);
    return `<div class="hora">
      ${!tiene && f === hoyLogico() ? `<button class="btn sm" data-a="ahora" data-id="${id}">Ahora</button>` : ''}
      <input type="time" data-a="hora" data-id="${id}" value="${tiene ? hhmm(manual(h, f)) : ''}" class="${tiene ? (st === 'ok' ? 'ok' : 'tarde') : 'vacia'}" aria-label="Hora de ${esc(h.nombre)}">
      ${tiene ? `<button class="x" data-a="borrar" data-id="${id}" aria-label="Borrar">${I('x')}</button>` : ''}
    </div>`;
  }
  const t = total(h, f);
  const crono = h.tipo === 'minutos'
    ? `<button class="tog crono ${S.crono && S.crono.id === id ? 'on' : ''}" data-a="crono" data-id="${id}" aria-label="Cronómetro">${I(S.crono && S.crono.id === id ? 'stop' : 'play')}</button>` : '';
  return `<div class="step">
    <button data-a="menos" data-id="${id}" aria-label="Menos">−</button>
    <span class="v">${t}${h.meta ? `<small>/${h.meta}</small>` : ''}</span>
    <button data-a="mas" data-id="${id}" aria-label="Más">+</button>
  </div>${crono}`;
}

// ---------- calendario ----------
function celdas(semanas, hoy, clase) {
  let out = '';
  for (const s of semanas) for (let i = 0; i < 7; i++) {
    const f = addDias(s, i);
    if (f > hoy) { out += `<i class="fut"></i>`; continue; }
    out += `<i class="${clase(f)}${f === S.sel ? ' sel' : ''}" data-a="sel" data-f="${f}"></i>`;
  }
  return out;
}
function etiquetasMes(semanas) {
  let prev = '';
  return semanas.map(s => {
    const fin = addDias(s, 6), m = fin.slice(5, 7);
    const txt = m !== prev ? MESES[+m - 1] : '';
    prev = m;
    return `<span>${txt}</span>`;
  }).join('');
}
function pantallaCal() {
  const hoy = hoyLogico(), sem = semanasCalendario(hoy);
  S.sel ||= hoy;
  const hs = habitosActivos();
  const sel = S.sel, pSel = pctDia(sel);
  return `
    <h2>Últimas ${SEMANAS} semanas</h2>
    <section class="card pad">
      <div class="meses" style="--n:${sem.length}">${etiquetasMes(sem)}</div>
      <div class="hm" style="--n:${sem.length}">${celdas(sem, hoy, f => 'l' + nivel(pctDia(f)))}</div>
      <div class="leyenda"><span>menos</span>${[0, 1, 2, 3, 4].map(n => `<i class="l${n}"></i>`).join('')}<span>más</span>
        <span class="sep">% de hábitos diarios cumplidos</span></div>
    </section>
    <section class="card pad detalle">
      <div class="det-cab"><b>${fechaLarga(sel)}</b><span>${pSel == null ? '—' : Math.round(pSel * 100) + '%'}</span></div>
      <ul>${hs.map(h => {
        const st = estado(h, sel), t = total(h, sel);
        const val = h.tipo === 'hora' ? (registrado(h, sel) ? hhmm(manual(h, sel)) : '—')
          : h.tipo === 'si_no' ? '' : `${t}${h.meta ? '/' + h.meta : ''}`;
        return `<li class="${st}"><span class="punto"></span>${esc(h.nombre)}<span class="val">${val}</span></li>`;
      }).join('')}</ul>
      ${editable(sel) ? `<button class="btn sm" data-a="ir-dia" data-f="${sel}">Editar este día</button>` : ''}
    </section>
    <h2>Por hábito</h2>
    ${hs.map(h => {
      const r = racha(h, hoy);
      const cls = f => { const st = estado(h, f); return st === 'ok' ? 'l4' : st === 'parcial' ? 'l2' : (r && r.gracia.has(f) ? 'l0 g' : 'l0'); };
      return `<section class="card pad hab-cal">
        <div class="hc-cab">${I(h.icono)}<b>${esc(h.nombre)}</b>
          <span>${r ? `racha <b>${r.n}</b> · mejor ${r.mejor}${r.unidad === 'sem' ? ' sem' : ''}` : 'sin racha'}</span></div>
        <div class="hm chico" style="--n:${sem.length}">${celdas(sem, hoy, cls)}</div>
      </section>`;
    }).join('')}
    <p class="nota">Recuadro con borde = día de gracia: un fallo por semana no corta la racha diaria.</p>
  `;
}

// ---------- hábitos ----------
function pantallaHabitos() {
  const hs = D.habitos.filter(h => S.verArchivados || !h.archivado).sort((a, b) => a.orden - b.orden);
  return `
    <h2>Hábitos</h2>
    <section class="card lista">
      ${hs.map(h => S.editando === h.id ? formHabito(h) : `
        <div class="fila ${h.archivado ? 'archivado' : ''}">
          <div class="ico">${I(h.icono)}</div>
          <div class="txt"><div class="nm">${esc(h.nombre)}</div><div class="sb">${esc(resumenDef(h))}</div></div>
          <div class="ctl orden">
            <button class="x" data-a="subir" data-id="${h.id}" aria-label="Subir">${I('up')}</button>
            <button class="x" data-a="bajar" data-id="${h.id}" aria-label="Bajar">${I('down')}</button>
            <button class="btn sm" data-a="editar" data-id="${h.id}">Editar</button>
          </div>
        </div>`).join('')}
      ${S.editando === 'nuevo' ? formHabito(null) : ''}
    </section>
    <div class="acciones">
      <button class="btn" data-a="nuevo">Nuevo hábito</button>
      <label class="check"><input type="checkbox" data-a="ver-arch" ${S.verArchivados ? 'checked' : ''}> Mostrar archivados</label>
    </div>
    <h2>Rutinas</h2>
    ${rutinasOrden().map(r => `
      <section class="card pad rut-edit">
        <b>${esc(r.nombre)}</b>
        <ul>${itemsDe(r).map(i => `<li>
          <input value="${esc(i.nombre)}" data-a="item-nombre" data-id="${i.id}" aria-label="Nombre del ítem">
          <select data-a="item-hab" data-id="${i.id}" aria-label="Suma a un hábito">
            <option value="">—</option>
            ${habitosActivos().filter(h => h.tipo !== 'hora').map(h =>
              `<option value="${h.id}" ${i.habito_id === h.id ? 'selected' : ''}>${esc(h.nombre)}</option>`).join('')}
          </select>
          <button class="x" data-a="item-quitar" data-id="${i.id}" aria-label="Quitar">${I('x')}</button>
        </li>`).join('')}</ul>
        <form data-form="item-nuevo" data-id="${r.id}" class="nuevo-item">
          <input name="nombre" placeholder="Agregar ítem" aria-label="Nuevo ítem"><button class="btn sm" type="submit">Agregar</button>
        </form>
      </section>`).join('')}
    <p class="nota">Un ítem ligado a un hábito le suma 1 al marcarlo (por ejemplo, los dientes de la mañana y la noche).</p>
  `;
}
function resumenDef(h) {
  const p = [TIPOS[h.tipo]];
  if (h.periodo === 'semana') p.push(`${h.meta_semanal || 1} por semana`);
  else if (h.tipo === 'hora') p.push('antes de las ' + hhmm(h.meta));
  else if (h.meta) p.push(`meta ${h.meta}${h.unidad ? ' ' + h.unidad : ''}`);
  p.push(h.con_racha ? 'con racha' : 'sin racha');
  if (h.origen !== 'manual') p.push(ORIGENES[h.origen]);
  if (h.archivado) p.push('archivado');
  return p.join(' · ');
}
function formHabito(h) {
  const nuevo = !h;
  h ||= { id: 'nuevo', nombre: '', icono: 'circle', tipo: 'si_no', meta: null, unidad: '', periodo: 'dia', meta_semanal: 1, con_racha: true, origen: 'manual' };
  const opt = (obj, v) => Object.entries(obj).map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');
  return `<form class="form-hab" data-form="habito" data-id="${h.id}">
    <label>Nombre<input name="nombre" value="${esc(h.nombre)}" required></label>
    <div class="dos">
      <label>Tipo<select name="tipo" ${nuevo ? '' : 'disabled'}>${opt(TIPOS, h.tipo)}</select></label>
      <label>Ícono<select name="icono">${ICONOS_HABITO.map(i => `<option ${i === h.icono ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
    </div>
    <div class="dos">
      <label>Meta <small>(cantidad, minutos o conteo)</small><input name="meta" type="number" min="0" step="any" value="${h.tipo !== 'hora' && h.meta != null ? h.meta : ''}"></label>
      <label>Límite <small>(tipo hora)</small><input name="limite" type="time" value="${h.tipo === 'hora' && h.meta != null ? hhmm(h.meta) : ''}"></label>
    </div>
    <div class="dos">
      <label>Unidad<input name="unidad" value="${esc(h.unidad || '')}" placeholder="vasos, min, cap."></label>
      <label>Origen<select name="origen">${opt(ORIGENES, h.origen)}</select></label>
    </div>
    <div class="dos">
      <label>Período<select name="periodo">${opt({ dia: 'Día', semana: 'Semana' }, h.periodo)}</select></label>
      <label>Días por semana<input name="meta_semanal" type="number" min="1" max="7" value="${h.meta_semanal || 1}"></label>
    </div>
    <label class="check"><input type="checkbox" name="con_racha" ${h.con_racha ? 'checked' : ''}> Tiene racha</label>
    <p class="err"></p>
    <div class="acciones">
      <button class="btn pri" type="submit">Guardar</button>
      <button class="btn" type="button" data-a="cancelar">Cancelar</button>
      ${nuevo ? '' : `<button class="btn peligro" type="button" data-a="archivar" data-id="${h.id}">${h.archivado ? 'Desarchivar' : 'Archivar'}</button>`}
    </div>
  </form>`;
}

// ---------- ajustes ----------
function pantallaAjustes() {
  const g = S.gh || {}, tok = tokenGH();
  const linea = (nombre, e) => `<li><span>${nombre}</span><span class="${e ? (e.ok ? 'ok' : 'malo') : 'muted'}">${
    !e ? 'sin leer' : e.ok ? `${e.dias} día${e.dias === 1 ? '' : 's'}${e.ultimo ? ' · último ' + e.ultimo : ''}` : esc(e.error)}</span></li>`;
  return `
    <h2>Cuenta</h2>
    <section class="card pad">
      <p>${esc(S.user.email || '')}</p>
      <button class="btn" data-a="salir">Cerrar sesión</button>
      <p class="nota">Es la misma sesión de Base Lunar en este navegador: cerrarla aquí la cierra allá también.</p>
    </section>
    <h2>Otras apps</h2>
    <section class="card pad">
      <ul class="fuentes">
        ${linea('Base Lunar', S.bl)}
        ${Object.keys(GISTS).map(k => linea(ORIGENES[k], g.fuentes && g.fuentes[k])).join('')}
      </ul>
      ${g.error ? `<p class="err">${esc(g.error)}</p>` : ''}
      <form data-form="token">
        <label>Token de GitHub <small>(permiso de Gists; queda solo en este dispositivo)</small>
          <input name="token" type="password" autocomplete="off" placeholder="${tok ? 'guardado · pega otro para cambiarlo' : 'github_pat_…'}"></label>
        <div class="acciones"><button class="btn pri" type="submit">Guardar y leer</button>
          ${tok ? `<button class="btn" type="button" data-a="leer-ahora">Leer ahora</button><button class="btn peligro" type="button" data-a="quitar-token">Quitar token</button>` : ''}</div>
      </form>
      <p class="nota">Basta con ponerlo en el celular: lo que lee se sube a Supabase y el notebook y la tablet lo ven sin token.</p>
    </section>
    <h2>Avisos</h2>
    <section class="card pad">
      ${rutinasOrden().map(r => `<label class="linea">${esc(r.nombre)}${r.clave === 'semanal' ? ' <small>(domingo)</small>' : ''}
        <input type="time" data-a="hora-aviso" data-id="${r.id}" value="${esc(r.hora_aviso || '')}"></label>`).join('')}
      ${bloqueAvisos()}
    </section>
    <h2>Datos</h2>
    <section class="card pad acciones">
      <button class="btn" data-a="exportar">Exportar todo (JSON)</button>
      <button class="btn" data-a="sincronizar">Sincronizar ahora</button>
    </section>
    <p class="nota">Protocolo ${VERSION}</p>
  `;
}

// ---------- avisos (web push) ----------
const NOMBRES_AVISO = {
  manana: 'Mañana: rutina y lo que quedó sin anotar ayer', mediodia: 'Mediodía: agua y tesis si van bajo la mitad',
  tarde: 'Tarde: rachas en riesgo y semanales apretados', semanal: 'Domingo: rutina semanal y semanales pendientes',
  resumen: 'Resumen: lo que falta del día', noche: 'Noche: rutina de la noche y hora de acostarse',
};
function bloqueAvisos() {
  const lista = [...AVISOS].sort((a, b) => horaDe(a, D.rutinas) - horaDe(b, D.rutinas))
    .map(a => `<li><span>${esc(NOMBRES_AVISO[a.id])}</span><span>${hhmm(horaDe(a, D.rutinas))}</span></li>`).join('');
  const st = S.push;
  const estado_ = { activo: 'Activos en este dispositivo', inactivo: 'Apagados en este dispositivo', bloqueado: 'Bloqueados por el navegador',
    no: 'Este navegador no admite avisos', cargando: 'Revisando…' }[st] || st;
  const botones = st === 'activo'
    ? `<button class="btn" data-a="avisos-probar">Probar</button><button class="btn" data-a="avisos-resumen">Ver el resumen de ahora</button><button class="btn peligro" data-a="avisos-apagar">Apagar aquí</button>`
    : st === 'inactivo' ? `<button class="btn pri" data-a="avisos-activar">Activar avisos aquí</button>` : '';
  return `<p class="nota">Las horas de arriba mueven los avisos de cada rutina. Cada aviso suena solo si hay algo pendiente.</p>
    <ul class="fuentes">${lista}</ul>
    <p><strong>${esc(estado_)}</strong></p>
    ${st === 'bloqueado' || st === 'no' ? `<p class="nota">En Brave: Ajustes → Privacidad y seguridad → activa “Usar servicios de Google para mensajería push”. Luego, en la info del sitio, permite las notificaciones.</p>` : ''}
    <div class="acciones">${botones}</div>`;
}
function claveVapid() {
  const b = atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - VAPID_PUBLIC.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function refrescarPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) S.push = 'no';
    else if (Notification.permission === 'denied') S.push = 'bloqueado';
    else {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      S.push = sub ? 'activo' : 'inactivo';
      if (sub && S.user && S.sb) await S.sb.from('p_push').upsert({ endpoint: sub.endpoint, suscripcion: sub.toJSON() });
    }
  } catch { S.push = 'no'; }
  if (S.vista === 'ajustes') render();
}
async function activarAvisos() {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { toast('Sin permiso para notificaciones'); await refrescarPush(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveVapid() });
    const { error } = await S.sb.from('p_push').upsert({ endpoint: sub.endpoint, suscripcion: sub.toJSON() });
    if (error) throw error;
    S.push = 'activo'; render();
    await probarAvisos();
  } catch (e) {
    toast(/push service|AbortError|registration/i.test(String(e && (e.message || e.name)))
      ? 'El navegador no dejó suscribirse. En Brave activa la mensajería push de Google (Ajustes → Privacidad).'
      : 'No pude activar los avisos: ' + (e.message || e));
    await refrescarPush();
  }
}
async function probarAvisos(aviso) {
  try {
    const { data } = await S.sb.auth.getSession();
    const r = await fetch(AVISOS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify(aviso ? { prueba: true, aviso } : { prueba: true }),
    });
    const j = await r.json();
    toast(r.ok ? 'Aviso enviado' : 'No se envió: ' + (j.error || r.status));
  } catch (e) { toast('No se envió: ' + (e.message || e)); }
}
async function apagarAvisos() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await S.sb.from('p_push').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch {}
  await refrescarPush(); toast('Avisos apagados en este dispositivo');
}

// ============================================================
// Eventos
// ============================================================
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]');
  if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  const a = b.dataset.a, id = b.dataset.id, f = fechaVista(), h = id && hab(id);
  switch (a) {
    case 'vista': S.vista = b.dataset.v; S.editando = null; escribir('vista', S.vista); render(); window.scrollTo(0, 0); break;
    case 'dia': S.dia = b.dataset.v; render(); break;
    case 'rutina': {
      const abierta = b.getAttribute('aria-expanded') === 'true';
      S.abiertas.delete(id); S.abiertas.delete('x' + id);
      S.abiertas.add(abierta ? 'x' + id : id);
      render(); break;
    }
    case 'item': { const it = D.items.find(i => i.id === id); setItem(it, f, !D.regsRut[clave(id, f)]); break; }
    case 'tog': setValor(h, f, manual(h, f) >= 1 ? 0 : 1); break;
    case 'mas': setValor(h, f, manual(h, f) + (h.paso || 1)); break;
    case 'menos': {
      const m = manual(h, f);
      if (m <= 0) { if (total(h, f) > 0) toast('Ese valor viene de una rutina: desmárcala ahí.'); break; }
      setValor(h, f, Math.max(0, m - (h.paso || 1))); break;
    }
    case 'ahora': setValor(h, f, normalizarHora(hhmm(minutosAhora()), h.cruza_noche)); break;
    case 'borrar': borrarValor(h, f); break;
    case 'crono': {
      if (S.crono && S.crono.id === id) {
        const min = Math.round((Date.now() - S.crono.inicio) / 60e3), dia = S.crono.fecha;
        S.crono = null; escribir('crono', null);
        if (min >= 1 && editable(dia)) setValor(h, dia, manual(h, dia) + min);
        else render();
        if (min >= 1) toast(`+${min} min de ${h.nombre}`);
      } else {
        S.crono = { id, inicio: Date.now(), fecha: hoyLogico() }; escribir('crono', S.crono); render();
      }
      break;
    }
    case 'sel': S.sel = b.dataset.f; render(); break;
    case 'ir-dia': S.dia = b.dataset.f === hoyLogico() ? 'hoy' : 'ayer'; S.vista = 'hoy'; render(); window.scrollTo(0, 0); break;
    case 'nuevo': S.editando = 'nuevo'; render(); break;
    case 'editar': S.editando = id; render(); break;
    case 'cancelar': S.editando = null; render(); break;
    case 'archivar': guardarDef('p_habitos', { ...h, archivado: !h.archivado }); S.editando = null; render(); break;
    case 'subir': case 'bajar': {
      const l = D.habitos.filter(x => S.verArchivados || !x.archivado).sort((x, y) => x.orden - y.orden);
      const i = l.findIndex(x => x.id === id), j = a === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= l.length) break;
      [l[i], l[j]] = [l[j], l[i]];
      l.forEach((x, n) => { if (x.orden !== n) guardarDef('p_habitos', { ...x, orden: n }); });
      render(); break;
    }
    case 'item-quitar': { const it = D.items.find(i => i.id === id); guardarDef('p_rutina_items', { ...it, archivado: true }); render(); break; }
    case 'salir':
      if (D.cola.length && !confirmarSalida()) break;
      await S.sb?.auth.signOut(); S.user = null; borrarLocal(); location.reload(); break;
    case 'leer-ahora': toast('Leyendo las otras apps…'); await Promise.all([leerGists(true), leerBaseLunar()]); render(); break;
    case 'quitar-token': escribir('ghToken', ''); S.gh = {}; escribir('gh', {}); render(); break;
    case 'exportar': exportar(); break;
    case 'avisos-activar': await activarAvisos(); break;
    case 'avisos-probar': await probarAvisos(); break;
    case 'avisos-resumen': await probarAvisos('resumen'); break;
    case 'avisos-apagar': await apagarAvisos(); break;
    case 'sincronizar': await sincronizar(true); toast('Sincronizado'); break;
    case 'reintentar': await sincronizar(true); break;
  }
});
function confirmarSalida() {
  toast(`Hay ${D.cola.length} cambios sin subir. Conéctate y espera a que diga “Al día”.`);
  return false;
}

document.addEventListener('change', ev => {
  const el = ev.target, a = el.dataset.a, id = el.dataset.id;
  if (!a) return;
  const f = fechaVista();
  if (a === 'hora') {
    const h = hab(id);
    if (el.value) setValor(h, f, normalizarHora(el.value, h.cruza_noche)); else borrarValor(h, f);
  } else if (a === 'ver-arch') { S.verArchivados = el.checked; render(); }
  else if (a === 'item-nombre') {
    const it = D.items.find(i => i.id === id), v = el.value.trim();
    if (v && v !== it.nombre) guardarDef('p_rutina_items', { ...it, nombre: v });
  } else if (a === 'item-hab') {
    const it = D.items.find(i => i.id === id);
    guardarDef('p_rutina_items', { ...it, habito_id: el.value || null }); render();
  } else if (a === 'hora-aviso') {
    const r = D.rutinas.find(x => x.id === id);
    guardarDef('p_rutinas', { ...r, hora_aviso: el.value || null });
  }
});

document.addEventListener('submit', async ev => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form), tipo = form.dataset.form;
  if (tipo === 'login') {
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      if (!S.sb) throw new Error('Sin conexión con Supabase. Revisa tu internet.');
      const { data, error } = await S.sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('clave') });
      if (error) throw error;
      entrarCon(data.user);
      await sincronizar(true);
    } catch (e) {
      S.errorInicio = /invalid/i.test(e.message || '') ? 'Correo o contraseña incorrectos.' : (e.message || 'No pude entrar.');
      render();
    }
  } else if (tipo === 'habito') guardarFormHabito(form, fd);
  else if (tipo === 'item-nuevo') {
    const nombre = (fd.get('nombre') || '').trim();
    if (!nombre) return;
    const r = D.rutinas.find(x => x.id === form.dataset.id);
    guardarDef('p_rutina_items', { id: uuid(), rutina_id: r.id, nombre, habito_id: null, orden: itemsDe(r).length, archivado: false });
    render();
  } else if (tipo === 'token') {
    const t = (fd.get('token') || '').trim();
    if (t) escribir('ghToken', t);
    if (!tokenGH()) return;
    toast('Leyendo las otras apps…');
    await leerGists(true);
  }
});

function guardarFormHabito(form, fd) {
  const id = form.dataset.id, nuevo = id === 'nuevo';
  const base = nuevo ? {
    id: uuid(), paso: 1, cruza_noche: false, orden: D.habitos.length, archivado: false, creado_en: ahoraISO(),
  } : hab(id);
  const tipo = nuevo ? fd.get('tipo') : base.tipo;
  const err = form.querySelector('.err');
  const nombre = (fd.get('nombre') || '').trim();
  if (!nombre) { err.textContent = 'Ponle un nombre.'; return; }
  let meta = null, cruza = !!base.cruza_noche;
  if (tipo === 'hora') {
    const l = fd.get('limite');
    if (!l) { err.textContent = 'Un hábito de hora necesita un límite.'; return; }
    const hh = +l.slice(0, 2);
    if (nuevo) cruza = hh >= 18 || hh < 6;     // un límite nocturno (acostarse) cruza la medianoche
    meta = normalizarHora(l, cruza);
  } else if (fd.get('meta') !== '') meta = +fd.get('meta');
  const periodo = tipo === 'si_no' ? fd.get('periodo') : 'dia';
  const fila = {
    ...base, nombre, tipo, meta, icono: fd.get('icono'), unidad: (fd.get('unidad') || '').trim() || null,
    origen: fd.get('origen'), periodo, meta_semanal: periodo === 'semana' ? Math.min(7, Math.max(1, +fd.get('meta_semanal') || 1)) : null,
    con_racha: fd.get('con_racha') === 'on', cruza_noche: cruza,
  };
  if (nuevo && tipo === 'minutos') fila.paso = 10;
  guardarDef('p_habitos', fila);
  S.editando = null; render();
}

function exportar() {
  const blob = new Blob([JSON.stringify({ app: 'protocolo', version: VERSION, exportado: ahoraISO(),
    habitos: D.habitos, rutinas: D.rutinas, items: D.items, regs: D.regs, regsRut: D.regsRut, ext: D.ext }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `protocolo_${hoyLogico()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ============================================================
// Arranque y ciclo de sincronización
// ============================================================
function entrarCon(user) {
  if (S.user && S.user.id !== user.id) borrarLocal();
  S.user = { id: user.id, email: user.email };
  S.errorInicio = null;
  escribir('usuario', S.user);
}
let sincronizando = false;
async function sincronizar(forzar = false) {
  if (sincronizando) return;
  sincronizando = true;
  try {
    await enviar();
    const ok = await traer();
    if (ok) {
      S.listo = true;
      if (!D.habitos.length && !leer('sembrado.' + S.user.id, false)) sembrar();
    }
    render();
    await leerBaseLunar();
    await leerGists(forzar);
    await enviar();
  } finally {
    sincronizando = false; render();
  }
}

async function arrancar() {
  render();
  try {
    const { createClient } = await import(SB_CDN);
    // Sin storageKey propio: así comparte la sesión con Base Lunar en el mismo navegador.
    S.sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch {
    S.listo = !!D.habitos.length; S.estado = 'offline'; render();   // sin red: se trabaja con lo guardado
    refrescarPush();
    return;
  }
  const { data } = await S.sb.auth.getSession();
  if (data && data.session) entrarCon(data.session.user);
  else { S.user = null; escribir('usuario', null); }
  S.sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT') { S.user = null; render(); }
    else if (sesion && sesion.user && (!S.user || S.user.id !== sesion.user.id)) { entrarCon(sesion.user); render(); }
  });
  S.listo = !!D.habitos.length;
  render();
  if (S.user) sincronizar();
  refrescarPush();
}

let ultimoDia = hoyLogico();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (hoyLogico() !== ultimoDia) { ultimoDia = hoyLogico(); S.dia = 'hoy'; }
  render();
  if (S.user && S.sb) sincronizar();
});
window.addEventListener('online', () => { S.estado = 'ok'; pintarSync(); if (S.user) sincronizar(); });
window.addEventListener('offline', pintarSync);
setInterval(() => {
  if (hoyLogico() !== ultimoDia) { ultimoDia = hoyLogico(); S.dia = 'hoy'; render(); }
  else if (S.crono && S.vista === 'hoy' && !document.activeElement?.matches('input,select')) render();
}, 60e3);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
arrancar();
