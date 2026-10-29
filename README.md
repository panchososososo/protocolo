# Protocolo

Hábitos, rutinas y rachas con calendario tipo GitHub. Instalable en Android, funciona sin señal y se sincroniza con Supabase (el mismo proyecto de Base Lunar).

## Archivos
- `index.html` + `app.js` + `logica.js`: la app. `logica.js` tiene las fechas y las rachas, sin red ni DOM.
- `esquema.sql`: tablas `p_*` y seguridad. Se pega en Supabase → SQL Editor → Run. Se puede correr de nuevo sin romper nada.
- `sw.js`, `manifest.webmanifest`, íconos: para instalarla y abrirla sin señal.

## Reglas
- El día cambia a las 04:00 (hora de Chile).
- Se puede registrar hoy y ayer; lo anterior queda cerrado (lo impone la base de datos).
- Rachas diarias: un día de gracia por semana (lunes a domingo). Rachas semanales: semanas seguidas que llegan a la meta.

## Otras apps
- Base Lunar: se lee directo de Supabase.
- Fierro, Bitácora PDT, app-bb y Bitácora del Arquero: se leen de sus Gists con un token de GitHub de solo lectura (Ajustes). El celular los resume en `p_externos` y los demás dispositivos lo ven sin token.

## Avisos (fase 3)
- `avisos.js`: cuándo suena cada aviso y qué dice (solo si hay algo pendiente).
- `servidor/avisos/`: la Edge Function `avisos` de Supabase. pg_cron la llama cada 10 minutos.
- Requiere el secreto `VAPID_PRIVATE_KEY` en Supabase → Edge Functions → Secrets.
- En Brave hay que activar "Usar servicios de Google para mensajería push".
