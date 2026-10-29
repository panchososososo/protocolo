// ============ Protocolo · avisos: cuándo avisar y qué decir ============
// Lógica pura (sin red ni DOM). La usa la Edge Function "avisos" y las pruebas.
// Cada aviso se manda solo si hay algo pendiente; si todo está al día, no suena.

import {
  usarDatos, estado, total, racha, hechosSemana, lunes, dow, addDias, registrado, hhmm, clave,
} from './logica.js';

// Horarios. Los de rutina salen de la hora que elijas en Ajustes → Avisos.
export const AVISOS = [
  { id: 'manana',   rutina: 'manana',  hora: '07:30' },
  { id: 'mediodia',                    hora: '13:00' },
  { id: 'tarde',                       hora: '18:30' },
  { id: 'semanal',  rutina: 'semanal', hora: '19:00', domingo: true },
  { id: 'resumen',                     hora: '20:00' },
  { id: 'noche',    rutina: 'noche',   hora: '21:00' },
];
export const VENTANA_MIN = 90;   // si el cron se atrasa, el aviso igual sale dentro de este margen

const aMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

export function horaDe(av, rutinas) {
  const r = av.rutina && rutinas.find(x => x.clave === av.rutina);
  return aMin((r && r.hora_aviso) || av.hora);
}

// Avisos que tocan ahora. f = día lógico; diaSemana = 0 domingo … 6 sábado (fecha de calendario).
export function avisosDelMomento(ahoraMin, diaSemana, rutinas) {
  const semanal = rutinas.find(x => x.clave === 'semanal');
  const diaSem = semanal && semanal.dia_aviso != null ? semanal.dia_aviso : 0;
  return AVISOS.filter(av => {
    if (av.domingo && diaSemana !== diaSem) return false;
    const h = horaDe(av, rutinas);
    return ahoraMin >= h && ahoraMin < h + VENTANA_MIN;
  });
}

// ---------- piezas ----------
const activos = D => D.habitos.filter(h => !h.archivado);
const diarios = D => activos(D).filter(h => h.periodo === 'dia' && h.con_racha);
const semanales = D => activos(D).filter(h => h.periodo === 'semana' && h.con_racha);

// Racha diaria que se corta si hoy no se cumple: ya se usó el día de gracia de esta semana.
export function rachaEnRiesgo(h, f) {
  if (estado(h, f) === 'ok') return false;
  const r = racha(h, f);
  if (!r || r.unidad !== 'd' || r.n === 0) return false;
  const iniSem = lunes(f);
  return [...r.gracia].some(d => d >= iniSem && d < f);
}

function itemsPendientes(D, claveRut, f) {
  const r = D.rutinas.find(x => x.clave === claveRut);
  if (!r) return [];
  return D.items.filter(i => i.rutina_id === r.id && !i.archivado && !D.regsRut[clave(i.id, f)]);
}

function progreso(h, f) {
  const t = total(h, f);
  if (h.tipo === 'cantidad' && h.unidad === 'vasos') return `${(t * 0.25).toLocaleString('es-CL')} de ${(h.meta * 0.25).toLocaleString('es-CL')} L`;
  if (h.meta) return `${t} de ${h.meta}${h.unidad ? ' ' + h.unidad : ''}`;
  return 'pendiente';
}

function semanalesApretados(D, f, holgura) {
  const quedan = 7 - dow(f);                       // días que quedan incluyendo hoy
  return semanales(D).map(h => {
    const faltan = (h.meta_semanal || 1) - hechosSemana(h, lunes(f), f);
    return { h, faltan, quedan };
  }).filter(x => x.faltan > 0 && x.faltan >= x.quedan - holgura);
}

const linea = (txt, riesgo) => (riesgo ? '⚠ ' : '· ') + txt;

// ---------- contenido de cada aviso ----------
// Devuelve { titulo, cuerpo } o null si no hay nada que decir.
export function contenido(av, D, f) {
  usarDatos(D);
  const L = [];
  const riesgo = h => rachaEnRiesgo(h, f);

  if (av.id === 'manana') {
    const p = itemsPendientes(D, 'manana', f);
    if (p.length) L.push(linea(`Rutina de la mañana: ${p.length} pendientes`));
    const ayer = addDias(f, -1);
    const olvidados = diarios(D).filter(h => estado(h, ayer) !== 'ok' && !registrado(h, ayer) && total(h, ayer) === 0);
    if (olvidados.length) L.push(linea(`Ayer quedó sin anotar: ${olvidados.map(h => h.nombre).join(', ')}. Aún puedes anotarlo hoy.`));
    return L.length ? { titulo: 'Buenos días', cuerpo: L.join('\n') } : null;
  }

  if (av.id === 'mediodia') {
    for (const h of diarios(D)) {
      if (!['cantidad', 'minutos', 'conteo'].includes(h.tipo) || !h.meta) continue;
      if (total(h, f) < h.meta / 2) L.push(linea(`${h.nombre}: ${progreso(h, f)}`, riesgo(h)));
    }
    return L.length ? { titulo: 'Mitad del día', cuerpo: L.join('\n') } : null;
  }

  if (av.id === 'tarde') {
    for (const h of diarios(D)) if (riesgo(h)) L.push(linea(`${h.nombre}: si no lo cumples hoy, la racha de ${racha(h, f).n} días se corta`, true));
    for (const x of semanalesApretados(D, f, 1)) {
      const urgente = x.faltan >= x.quedan;
      L.push(linea(`${x.h.nombre}: faltan ${x.faltan} y quedan ${x.quedan} días${urgente ? ' — hoy sí o sí' : ''}`, urgente));
    }
    return L.length ? { titulo: 'Rachas en juego', cuerpo: L.join('\n') } : null;
  }

  if (av.id === 'semanal') {
    const p = itemsPendientes(D, 'semanal', f);
    if (p.length) L.push(linea(`Rutina semanal: ${p.map(i => i.nombre).join(', ')}`));
    for (const x of semanalesApretados(D, f, 7)) L.push(linea(`${x.h.nombre}: faltan ${x.faltan} esta semana`, x.faltan >= x.quedan));
    return L.length ? { titulo: 'Cierre de semana', cuerpo: L.join('\n') } : null;
  }

  if (av.id === 'resumen') {
    for (const h of diarios(D)) {
      if (estado(h, f) === 'ok') continue;
      if (h.tipo === 'hora' && h.cruza_noche) continue;          // acostarse: todavía no toca
      const txt = h.tipo === 'hora' ? `${h.nombre}: anota la hora (meta ${hhmm(h.meta)})` : `${h.nombre}: ${progreso(h, f)}`;
      L.push(linea(txt, riesgo(h)));
    }
    return L.length ? { titulo: 'Lo que falta hoy', cuerpo: L.join('\n') } : null;
  }

  if (av.id === 'noche') {
    const p = itemsPendientes(D, 'noche', f);
    if (p.length) L.push(linea(`Rutina de la noche: ${p.length} pendientes`));
    for (const h of diarios(D)) {
      if (estado(h, f) === 'ok') continue;
      if (h.tipo === 'hora' && h.cruza_noche) L.push(linea(`${h.nombre}: antes de las ${hhmm(h.meta)}`, riesgo(h)));
      else if (riesgo(h)) L.push(linea(`${h.nombre}: última oportunidad para la racha (${progreso(h, f)})`, true));
    }
    return L.length ? { titulo: 'Cierre del día', cuerpo: L.join('\n') } : null;
  }
  return null;
}
