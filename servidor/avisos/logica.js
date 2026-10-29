// ============ Protocolo · lógica pura: fechas, estados y rachas ============
// No toca la red ni el DOM, así se puede probar aparte.

export const TZ = 'America/Santiago';
export const CORTE_HORAS = 4;          // el día cambia a las 04:00
export const SEMANAS = 26;             // semanas que muestra el calendario

// ---------- fechas (siempre 'YYYY-MM-DD', hora de Chile) ----------
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function partes(ms) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}
export function fechaChile(ms) { const p = partes(ms); return `${p.year}-${p.month}-${p.day}`; }
export function hoyLogico(ms = Date.now()) { return fechaChile(ms - CORTE_HORAS * 3600e3); }
export function minutosAhora(ms = Date.now()) { const p = partes(ms); return (+p.hour) * 60 + (+p.minute); }
export function addDias(f, n) {
  const d = new Date(f + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dow(f) { return (new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7; } // 0 = lunes
export function lunes(f) { return addDias(f, -dow(f)); }

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fechaLarga(f) { return `${DIAS[dow(f)]} ${+f.slice(8)} ${MESES[+f.slice(5, 7) - 1]}`; }
export function hhmm(m) {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}
// '00:30' en un hábito que cruza la noche = 24:30 (1470), para comparar con un límite de 00:00 (1440)
export function normalizarHora(txt, cruzaNoche) {
  const [h, mi] = txt.split(':').map(Number);
  let m = h * 60 + mi;
  if (cruzaNoche && m < 12 * 60) m += 1440;
  return m;
}

// ---------- datos ----------
// D = { habitos, items, regs: {'hab|fecha': valor}, regsRut: {'item|fecha': bool}, ext: {'fuente|fecha': {...}} }
let D = { habitos: [], items: [], regs: {}, regsRut: {}, ext: {} };
let vinc = new Map();
export function usarDatos(d) { D = d; reindexar(); }
export function reindexar() {
  vinc = new Map();
  for (const i of D.items) {
    if (i.archivado || !i.habito_id) continue;
    if (!vinc.has(i.habito_id)) vinc.set(i.habito_id, []);
    vinc.get(i.habito_id).push(i);
  }
}
export const clave = (a, b) => a + '|' + b;

export function vinculados(h) { return vinc.get(h.id) || []; }
export function manual(h, f) { return D.regs[clave(h.id, f)] || 0; }
export function registrado(h, f) { return clave(h.id, f) in D.regs; }

export function extDe(h, f) { return h.origen === 'manual' ? null : (D.ext[clave(h.origen, f)] || null); }
export function extCumple(h, f) {
  const d = extDe(h, f);
  if (!d) return false;
  if (h.origen === 'futsal') return !!(d.partido || d.sesion_arquero);
  return true;
}

export function total(h, f) {
  let t = manual(h, f);
  if (h.tipo !== 'hora') for (const i of vinculados(h)) if (D.regsRut[clave(i.id, f)]) t += 1;
  return t;
}

// 'ok' | 'parcial' | ''
export function estado(h, f) {
  if (extCumple(h, f)) return 'ok';
  if (h.tipo === 'hora') {
    if (!registrado(h, f)) return '';
    return h.meta == null || manual(h, f) <= h.meta ? 'ok' : 'parcial';
  }
  const t = total(h, f);
  if (h.tipo === 'si_no') return t >= 1 ? 'ok' : '';
  if (h.meta) return t >= h.meta ? 'ok' : (t > 0 ? 'parcial' : '');
  return t > 0 ? 'ok' : '';
}

// Primer día que cuenta: el de creación, o el anterior si ese día ya tiene algo anotado.
export function inicioHabito(h) {
  const c = h.creado_en ? fechaChile(Date.parse(h.creado_en)) : hoyLogico();
  const antes = addDias(c, -1);
  return estado(h, antes) ? antes : c;
}

// ---------- rachas diarias: 1 día de gracia por semana (lunes a domingo) ----------
export function rachaDia(h, hoy) {
  const ini = inicioHabito(h);
  let f = estado(h, hoy) === 'ok' ? hoy : addDias(hoy, -1);   // hoy en curso no corta
  let n = 0, semana = null, usada = false;
  const gracia = new Set();
  while (f >= ini) {
    const s = lunes(f);
    if (s !== semana) { semana = s; usada = false; }
    if (estado(h, f) === 'ok') n++;
    else if (!usada) { usada = true; gracia.add(f); }
    else break;
    f = addDias(f, -1);
  }
  return { n, gracia: n ? gracia : new Set() };
}

export function mejorDia(h, hoy) {
  const ini = inicioHabito(h);
  let best = 0, cur = 0, semana = null, fallos = 0;
  for (let f = ini; f <= hoy; f = addDias(f, 1)) {
    const s = lunes(f);
    if (s !== semana) { semana = s; fallos = 0; }
    if (estado(h, f) === 'ok') { cur++; best = Math.max(best, cur); }
    else if (f === hoy) { /* en curso */ }
    else if (fallos === 0) fallos = 1;
    else { fallos++; cur = 0; }
  }
  return Math.max(best, rachaDia(h, hoy).n);
}

// ---------- rachas semanales: semanas seguidas que alcanzan la meta ----------
export function hechosSemana(h, s, hoy) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const f = addDias(s, i);
    if (f > hoy) break;
    if (estado(h, f) === 'ok') n++;
  }
  return n;
}
export function rachaSemana(h, hoy) {
  const meta = h.meta_semanal || 1, iniS = lunes(inicioHabito(h));
  let s = lunes(hoy), n = 0;
  if (hechosSemana(h, s, hoy) >= meta) n++;          // la semana en curso suma si ya cumplió
  s = addDias(s, -7);
  while (s >= iniS && hechosSemana(h, s, hoy) >= meta) { n++; s = addDias(s, -7); }
  return n;
}
export function mejorSemana(h, hoy) {
  const meta = h.meta_semanal || 1, actual = lunes(hoy);
  let best = 0, cur = 0;
  for (let s = lunes(inicioHabito(h)); s <= actual; s = addDias(s, 7)) {
    if (hechosSemana(h, s, hoy) >= meta) { cur++; best = Math.max(best, cur); }
    else if (s !== actual) cur = 0;
  }
  return best;
}

export function racha(h, hoy) {
  if (!h.con_racha) return null;
  if (h.periodo === 'semana') return { n: rachaSemana(h, hoy), mejor: mejorSemana(h, hoy), unidad: 'sem', gracia: new Set() };
  const r = rachaDia(h, hoy);
  return { n: r.n, mejor: mejorDia(h, hoy), unidad: 'd', gracia: r.gracia };
}

// ---------- calendario global ----------
export function diariosDel(f) {
  return D.habitos.filter(h => !h.archivado && h.con_racha && h.periodo === 'dia' && inicioHabito(h) <= f);
}
export function pctDia(f) {
  const hs = diariosDel(f);
  if (!hs.length) return null;
  return hs.filter(h => estado(h, f) === 'ok').length / hs.length;
}
export function nivel(p) {
  if (p == null || p === 0) return 0;
  if (p <= 0.25) return 1;
  if (p <= 0.5) return 2;
  if (p <= 0.75) return 3;
  return 4;
}
// columnas = semanas (lunes), de la más antigua a la actual
export function semanasCalendario(hoy, n = SEMANAS) {
  const fin = lunes(hoy), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDias(fin, -7 * i));
  return out;
}

// ---------- lectores de las otras apps (contenido de su Gist → días) ----------
const ISO = /^\d{4}-\d\d-\d\d$/;
const diaDe = v => typeof v === 'number' ? fechaChile(v)
  : (typeof v === 'string' && ISO.test(v.slice(0, 10)) ? v.slice(0, 10) : null);

export const LECTORES = {
  fierro(j) {
    const o = {};
    for (const s of j.sessions || []) {
      const f = s && diaDe(s.t);
      if (f) (o[f] ??= { sesiones: 0 }).sesiones++;
    }
    return o;
  },
  bitacora(j) {
    const o = {};
    for (const [f, d] of Object.entries(j.dias || {})) if (ISO.test(f) && d && d.updatedAt) o[f] = { entrada: true };
    return o;
  },
  appbb(j) {
    const it = j.items || {}, val = k => (it[k] && Array.isArray(it[k].valor)) ? it[k].valor : [];
    const o = {}, sumar = (f, k) => { if (f) { (o[f] ??= {}); o[f][k] = (o[f][k] || 0) + 1; } };
    for (const a of val('appreciations')) sumar(diaDe(a?.date), 'agradecimientos');
    for (const l of val('letters')) sumar(diaDe(l?.createdAt ?? l?.updatedAt), 'cartas');
    for (const c of val('dates')) if (c?.done) sumar(diaDe(c.when) || diaDe(c.doneAt), 'citas');
    return o;
  },
  futsal(j) {
    const o = {};
    for (const [f, r] of Object.entries(j.resumen_dias || {}))
      if (ISO.test(f) && r && (r.partido || r.sesion_arquero || r.gym))
        o[f] = { partido: !!r.partido, sesion_arquero: !!r.sesion_arquero, gym: !!r.gym };
    return o;
  },
};
