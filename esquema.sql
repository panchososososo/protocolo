-- ============================================================
-- Protocolo — esquema para Supabase (mismo proyecto que Base Lunar)
-- Pegar completo en: Supabase → SQL Editor → New query → Run
-- Se puede correr más de una vez sin romper nada.
-- Cada usuario ve y edita solo sus propios datos (RLS por user_id).
-- ============================================================

create extension if not exists pgcrypto;

-- Día lógico: cambia a las 04:00 hora de Chile, no a medianoche.
create or replace function public.p_hoy() returns date
language sql stable as $$
  select ((now() at time zone 'America/Santiago') - interval '4 hours')::date
$$;

-- ---------- definiciones ----------
create table if not exists public.p_habitos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null,
  icono         text not null default 'circle',
  tipo          text not null check (tipo in ('si_no','cantidad','minutos','hora','conteo')),
  meta          numeric,              -- cantidad/minutos/conteo: mínimo del día · hora: límite en minutos
  unidad        text,                 -- 'vasos', 'cap.', 'min'
  paso          numeric not null default 1,
  cruza_noche   boolean not null default false,  -- hora de acostarse: 00:30 cuenta como 24:30
  periodo       text not null default 'dia' check (periodo in ('dia','semana')),
  meta_semanal  int,                  -- periodo semana: días por semana
  con_racha     boolean not null default true,
  origen        text not null default 'manual'
                check (origen in ('manual','fierro','bitacora','baselunar','appbb','futsal')),
  orden         int not null default 0,
  archivado     boolean not null default false,
  creado_en     timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);

create table if not exists public.p_rutinas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave         text not null check (clave in ('manana','noche','semanal')),
  nombre        text not null,
  hora_aviso    text,                 -- 'HH:MM'
  dia_aviso     int,                  -- solo semanal: 0 = domingo
  orden         int not null default 0,
  actualizado   timestamptz not null default now(),
  unique (user_id, clave)
);

create table if not exists public.p_rutina_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rutina_id     uuid not null references public.p_rutinas(id) on delete cascade,
  nombre        text not null,
  habito_id     uuid references public.p_habitos(id) on delete set null,  -- suma 1 a ese hábito
  orden         int not null default 0,
  archivado     boolean not null default false,
  actualizado   timestamptz not null default now()
);

-- ---------- registros ----------
create table if not exists public.p_registros (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habito_id     uuid not null references public.p_habitos(id) on delete cascade,
  fecha         date not null,
  valor         numeric not null default 0,
  actualizado   timestamptz not null default now(),
  primary key (habito_id, fecha)
);

create table if not exists public.p_registros_rutina (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id       uuid not null references public.p_rutina_items(id) on delete cascade,
  fecha         date not null,
  hecho         boolean not null default true,
  actualizado   timestamptz not null default now(),
  primary key (item_id, fecha)
);

-- Resumen por día de lo leído en otras apps (Fierro, Bitácora, app-bb, futsal, Base Lunar).
create table if not exists public.p_externos (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fuente        text not null check (fuente in ('fierro','bitacora','baselunar','appbb','futsal')),
  fecha         date not null,
  detalle       jsonb not null default '{}'::jsonb,
  actualizado   timestamptz not null default now(),
  primary key (user_id, fuente, fecha)
);

-- Suscripciones de notificación (fase 3).
create table if not exists public.p_push (
  endpoint      text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  suscripcion   jsonb not null,
  creado_en     timestamptz not null default now()
);

create index if not exists p_registros_user_fecha on public.p_registros (user_id, fecha);
create index if not exists p_registros_rutina_user_fecha on public.p_registros_rutina (user_id, fecha);

-- ---------- seguridad ----------
alter table public.p_habitos          enable row level security;
alter table public.p_rutinas          enable row level security;
alter table public.p_rutina_items     enable row level security;
alter table public.p_registros        enable row level security;
alter table public.p_registros_rutina enable row level security;
alter table public.p_externos         enable row level security;
alter table public.p_push             enable row level security;

-- Tablas sin límite de fecha: solo el dueño.
do $$
declare t text;
begin
  foreach t in array array['p_habitos','p_rutinas','p_rutina_items','p_externos','p_push'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dueno', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_dueno', t);
  end loop;
end $$;

-- Registros: se leen siempre; se escriben solo para hoy o ayer.
do $$
declare t text;
begin
  foreach t in array array['p_registros','p_registros_rutina'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_crear', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);

    execute format('create policy %I on public.%I for select to authenticated
                      using (user_id = auth.uid())', t || '_leer', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check (user_id = auth.uid() and fecha between public.p_hoy() - 1 and public.p_hoy())',
                   t || '_crear', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using (user_id = auth.uid() and fecha >= public.p_hoy() - 1)
                      with check (user_id = auth.uid() and fecha between public.p_hoy() - 1 and public.p_hoy())',
                   t || '_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated
                      using (user_id = auth.uid() and fecha >= public.p_hoy() - 1)', t || '_borrar', t);
  end loop;
end $$;
