-- =============================================================================
-- Módulo Pilotos de medios (fase 1)
-- Un piloto es una prueba controlada de un cambio en medios digitales antes de
-- escalarlo. Es un módulo global (no cuelga de un programa) con sus propios
-- roles: Aprobador, Creador y Lector. El admin global cuenta como Aprobador.
--
-- · Estados: Borrador → En revisión → Aprobado → En prueba → En lectura → Decidido
--   (+ Cancelado). Solo cambian por RPC.
-- · Al aprobar se fija design_locked_at: hipótesis, variable, tipo de prueba,
--   métricas, guardrails, reglas, potencia, grupos y medios quedan de solo lectura.
-- · Todo cambio queda en pilot_audit (quién, cuándo, valor anterior y nuevo).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.pilot_role as enum ('approver', 'creator', 'reader');
create type public.pilot_status as enum ('draft', 'in_review', 'approved', 'in_test', 'in_reading', 'decided', 'cancelled');
create type public.pilot_test_type as enum ('ab_creative', 'ab_platform', 'holdout', 'geo', 'pre_post');
create type public.media_data_mode as enum ('manual', 'mcp');
create type public.pilot_metric_calc as enum ('sum', 'rate', 'cost_per');
create type public.pilot_metric_scope as enum ('platform', 'business');
create type public.pilot_unit as enum ('count', 'cop', 'percent');
create type public.measurement_source as enum ('manual', 'csv', 'mcp');
create type public.pilot_granularity as enum ('day', 'week');
create type public.checklist_platform as enum ('ga4', 'gtm', 'pixel', 'capi', 'other');
create type public.checklist_status as enum ('pending', 'ok', 'failed');
create type public.variable_category as enum (
  'creative', 'audience', 'structure', 'placements', 'destination', 'channel', 'investment', 'signal', 'offer'
);

-- -----------------------------------------------------------------------------
-- Roles del módulo
-- -----------------------------------------------------------------------------
create table public.pilot_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.pilot_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create or replace function private.pilot_role()
returns public.pilot_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_admin() then 'approver'::public.pilot_role
    else (select r.role from public.pilot_roles r where r.user_id = auth.uid())
  end;
$$;

create or replace function private.pilot_can_read()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pilot_role() is not null;
$$;

create or replace function private.pilot_can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.pilot_role() in ('approver', 'creator'), false);
$$;

create or replace function private.pilot_is_approver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.pilot_role() = 'approver', false);
$$;

-- ¿La persona tiene rol en el módulo? (para ver nombres de compañeros)
create or replace function private.is_pilot_member(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pilot_roles r where r.user_id = p_user)
      or exists (select 1 from public.profiles p where p.id = p_user and p.is_admin);
$$;

-- -----------------------------------------------------------------------------
-- Catálogos
-- -----------------------------------------------------------------------------
create table public.media_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  kind text,
  provider text,
  data_mode public.media_data_mode not null default 'manual',
  -- Conector que lo alimenta cuando exista (fase de integraciones).
  integration text check (integration in ('meta', 'google_ads', 'ga4', 'tiktok')),
  archived_at timestamptz,
  merged_into_id uuid references public.media_channels (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create unique index media_channels_name_idx on public.media_channels (lower(trim(name))) where archived_at is null;

create table public.pilot_variables (
  id uuid primary key default gen_random_uuid(),
  category public.variable_category not null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  recommended_test_type public.pilot_test_type not null,
  alternative_test_type public.pilot_test_type,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create table public.pilot_metrics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  unit public.pilot_unit not null default 'count',
  direction public.metric_direction not null default 'up',
  scope public.pilot_metric_scope not null default 'business',
  calc public.pilot_metric_calc not null default 'sum',
  numerator_id uuid references public.pilot_metrics (id) on delete restrict,
  denominator_id uuid references public.pilot_metrics (id) on delete restrict,
  is_spend boolean not null default false,
  -- Métrica propia de un medio (p. ej. impresiones DOOH); null = catálogo general.
  media_id uuid references public.media_channels (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  constraint pilot_metrics_calc_chk check (
    (calc = 'sum' and numerator_id is null and denominator_id is null)
    or (calc <> 'sum' and numerator_id is not null and denominator_id is not null and numerator_id <> denominator_id)
  )
);

-- Las métricas derivadas se arman con métricas de suma (lo que se carga).
create or replace function private.pilot_metrics_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.calc <> 'sum' and exists (
    select 1 from public.pilot_metrics m
    where m.id in (new.numerator_id, new.denominator_id) and m.calc <> 'sum'
  ) then
    raise exception 'Una tasa o un costo por unidad se arma con dos métricas que se cargan (de suma).';
  end if;
  if new.calc <> 'sum' and tg_op = 'UPDATE' and old.calc = 'sum' and exists (
    select 1 from public.pilot_metrics m where m.numerator_id = new.id or m.denominator_id = new.id
  ) then
    raise exception 'Esta métrica se usa para calcular otras: no puede volverse derivada.';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pilotos
-- -----------------------------------------------------------------------------
create table public.pilots (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  problem text,
  problem_evidence text,
  -- Hipótesis: "Si hacemos [cambio] en [ámbito], esperamos mover [métrica] en [N %] porque [razón]".
  hypothesis_change text,
  hypothesis_scope text,
  hypothesis_metric text,
  hypothesis_expected_pct numeric check (hypothesis_expected_pct is null or hypothesis_expected_pct between -100 and 1000),
  hypothesis_reason text,
  variable_id uuid references public.pilot_variables (id) on delete set null,
  test_type public.pilot_test_type,
  design_justification text,
  design_config jsonb not null default '{}'::jsonb,
  primary_metric_id uuid references public.pilot_metrics (id) on delete restrict,
  power_inputs jsonb,
  power_result jsonb,
  decision_rules jsonb,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  planned_budget_cop numeric check (planned_budget_cop is null or planned_budget_cop >= 0),
  owner_id uuid references public.profiles (id) on delete set null,
  status public.pilot_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  submitted_at timestamptz,
  design_locked_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  verdict public.verdict,
  decision public.decision,
  decision_justification text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  cancel_reason text,
  -- Vínculos opcionales con el resto de Arriero.
  program_id uuid references public.programs (id) on delete set null,
  experiment_id uuid references public.experiments (id) on delete set null,
  tree_metric_id uuid references public.metrics (id) on delete set null,
  is_example boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  constraint pilots_planned_dates_chk check (planned_end is null or planned_start is null or planned_end >= planned_start),
  constraint pilots_actual_dates_chk check (actual_end is null or actual_start is null or actual_end >= actual_start)
);
create index pilots_status_idx on public.pilots (status) where deleted_at is null;

create table public.pilot_media (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  media_id uuid not null references public.media_channels (id) on delete restrict,
  account text,
  campaign text,
  audience text,
  destination text,
  cities text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create index pilot_media_pilot_idx on public.pilot_media (pilot_id);

create table public.pilot_arms (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  is_control boolean not null default false,
  split_pct numeric check (split_pct is null or split_pct between 0 and 100),
  cities text[] not null default '{}',
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);
create unique index pilot_arms_one_control_idx on public.pilot_arms (pilot_id) where is_control;
create index pilot_arms_pilot_idx on public.pilot_arms (pilot_id);

create table public.pilot_guardrails (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  metric_id uuid not null references public.pilot_metrics (id) on delete restrict,
  limit_pct numeric not null check (limit_pct > 0 and limit_pct <= 1000),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (pilot_id, metric_id)
);

create table public.pilot_checklist_items (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  platform public.checklist_platform not null,
  event_name text not null check (length(trim(event_name)) between 1 and 120),
  description text,
  status public.checklist_status not null default 'pending',
  evidence text,
  checked_by uuid references public.profiles (id) on delete set null,
  checked_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

create table public.pilot_measurements (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  arm_id uuid not null references public.pilot_arms (id) on delete cascade,
  metric_id uuid not null references public.pilot_metrics (id) on delete restrict,
  -- Ciudad en pruebas por geografía; '' = valor del grupo completo.
  unit_label text not null default '',
  period_start date not null,
  granularity public.pilot_granularity not null default 'day',
  value numeric not null check (value >= 0),
  source public.measurement_source not null default 'manual',
  -- Extracción que originó el dato (fase de integraciones).
  snapshot_id uuid,
  note text,
  original_value numeric,
  adjusted_at timestamptz,
  adjusted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (arm_id, metric_id, unit_label, period_start, granularity)
);
create index pilot_measurements_pilot_idx on public.pilot_measurements (pilot_id, period_start);

create table public.pilot_incidents (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  occurred_on date not null default current_date,
  description text not null check (length(trim(description)) between 5 and 2000),
  expected_impact public.impact_level not null default 'low',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Línea de tiempo del flujo (enviar, devolver, aprobar, lanzar, leer, decidir, cancelar).
create table public.pilot_reviews (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  action text not null check (action in ('submitted', 'returned', 'approved', 'started', 'to_reading', 'decided', 'cancelled', 'deleted', 'restored')),
  comment text,
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pilot_reviews_pilot_idx on public.pilot_reviews (pilot_id, created_at);

create table public.pilot_learnings (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null unique references public.pilots (id) on delete cascade,
  text text not null check (length(trim(text)) >= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Lo que redacta La Tía (diagnóstico, recomendación de diseño, conclusión). Es un
-- borrador hasta que una persona lo edita o lo aprueba. Los números no los calcula
-- la IA: recibe los resultados ya calculados por el motor del módulo.
create table public.pilot_ai_drafts (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.pilots (id) on delete cascade,
  kind text not null check (kind in ('diagnosis', 'design', 'conclusion')),
  content text not null check (length(trim(content)) between 1 and 20000),
  status text not null default 'draft' check (status in ('draft', 'edited', 'approved')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz
);
create index pilot_ai_drafts_pilot_idx on public.pilot_ai_drafts (pilot_id, kind, created_at desc);

create table public.pilot_audit (
  id bigint generated always as identity primary key,
  pilot_id uuid,
  table_name text not null,
  row_id uuid,
  op text not null check (op in ('insert', 'update', 'delete')),
  actor_id uuid references public.profiles (id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);
create index pilot_audit_pilot_idx on public.pilot_audit (pilot_id, changed_at desc);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pilot_roles', 'media_channels', 'pilot_variables', 'pilot_metrics', 'pilots', 'pilot_media',
    'pilot_arms', 'pilot_guardrails', 'pilot_checklist_items', 'pilot_measurements', 'pilot_learnings', 'pilot_ai_drafts'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

create trigger b_pilot_metrics_check before insert or update on public.pilot_metrics
  for each row execute function private.pilot_metrics_check();

-- -----------------------------------------------------------------------------
-- Auditoría: una fila por cambio, con solo los campos que cambiaron.
-- -----------------------------------------------------------------------------
create or replace function private.pilot_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  od jsonb := '{}'::jsonb;
  nd jsonb := '{}'::jsonb;
  k text;
  rid uuid;
  pid uuid;
begin
  if coalesce(current_setting('app.skip_pilot_audit', true), '') = 'on' then
    return null;
  end if;
  rid := nullif(coalesce(n ->> 'id', o ->> 'id', n ->> 'user_id', o ->> 'user_id'), '')::uuid;
  pid := case when tg_table_name = 'pilots' then rid else nullif(coalesce(n ->> 'pilot_id', o ->> 'pilot_id'), '')::uuid end;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'updated_by') and (n -> k) is distinct from (o -> k) then
        od := od || jsonb_build_object(k, o -> k);
        nd := nd || jsonb_build_object(k, n -> k);
      end if;
    end loop;
    if nd = '{}'::jsonb then
      return null;
    end if;
  else
    od := o;
    nd := n;
  end if;
  insert into public.pilot_audit (pilot_id, table_name, row_id, op, actor_id, old_data, new_data)
  values (pid, tg_table_name, rid, lower(tg_op), auth.uid(), od, nd);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pilot_roles', 'media_channels', 'pilot_variables', 'pilot_metrics', 'pilots', 'pilot_media', 'pilot_arms',
    'pilot_guardrails', 'pilot_checklist_items', 'pilot_measurements', 'pilot_incidents', 'pilot_learnings', 'pilot_ai_drafts'
  ] loop
    execute format('create trigger z_audit after insert or update or delete on public.%I for each row execute function private.pilot_audit_row()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Guardas de reglas
-- -----------------------------------------------------------------------------

-- Campos que se pueden cambiar directo después del borrador (vínculos y responsable).
create or replace function private.pilot_free_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['owner_id', 'program_id', 'experiment_id', 'tree_metric_id', 'updated_at'];
$$;

-- Campos que solo cambian las RPC del flujo.
create or replace function private.pilot_flow_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'status', 'status_changed_at', 'submitted_at', 'design_locked_at', 'approved_by', 'approved_at',
    'verdict', 'decision', 'decision_justification', 'decided_by', 'decided_at', 'cancel_reason',
    'actual_start', 'actual_end', 'is_example', 'deleted_at', 'deleted_by', 'created_by'
  ];
$$;

create or replace function private.pilots_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  n jsonb;
  o jsonb;
begin
  -- Los vínculos solo apuntan a lo que la persona puede ver.
  if new.program_id is not null and (tg_op = 'INSERT' or new.program_id is distinct from old.program_id)
     and not private.is_service() and not private.is_member(new.program_id) then
    raise exception 'No tiene acceso a ese programa.';
  end if;
  if new.experiment_id is not null and (tg_op = 'INSERT' or new.experiment_id is distinct from old.experiment_id)
     and not private.is_service()
     and not exists (select 1 from public.experiments e where e.id = new.experiment_id and e.deleted_at is null and private.is_member(e.program_id)) then
    raise exception 'No tiene acceso a ese ejercicio.';
  end if;
  if new.tree_metric_id is not null and (tg_op = 'INSERT' or new.tree_metric_id is distinct from old.tree_metric_id)
     and not private.is_service()
     and not exists (select 1 from public.metrics m where m.id = new.tree_metric_id and m.deleted_at is null and private.is_member(m.program_id)) then
    raise exception 'No tiene acceso a esa métrica del árbol.';
  end if;

  if private.guard_bypassed() or private.is_service() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.design_locked_at is not null or new.decision is not null
       or new.verdict is not null or new.is_example or new.deleted_at is not null
       or new.actual_start is not null or new.actual_end is not null then
      raise exception 'Un piloto nuevo empieza en Borrador; el estado cambia con los botones del flujo.';
    end if;
    new.created_by := auth.uid();
    return new;
  end if;

  n := to_jsonb(new);
  o := to_jsonb(old);
  foreach k in array private.pilot_flow_keys() loop
    if (n -> k) is distinct from (o -> k) then
      raise exception 'El estado del piloto cambia con los botones del flujo, no editando.';
    end if;
  end loop;

  if old.status <> 'draft' then
    for k in select jsonb_object_keys(n) loop
      if not (k = any (private.pilot_free_keys())) and (n -> k) is distinct from (o -> k) then
        if old.design_locked_at is not null then
          raise exception 'El diseño está bloqueado desde que se aprobó el piloto. Los cambios en la ejecución se registran como incidentes.';
        else
          raise exception 'El piloto está en revisión: pídale al aprobador que lo devuelva a borrador para editarlo.';
        end if;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create trigger b_pilots_guard before insert or update on public.pilots
  for each row execute function private.pilots_guard();

-- Grupos, guardrails y medios: solo en Borrador.
create or replace function private.pilot_design_child_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.pilot_status;
  locked timestamptz;
  pid uuid := case when tg_op = 'DELETE' then old.pilot_id else new.pilot_id end;
begin
  if tg_op = 'UPDATE' and new.pilot_id <> old.pilot_id then
    raise exception 'No se puede mover este dato a otro piloto.';
  end if;
  if private.guard_bypassed() or private.is_service() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select p.status, p.design_locked_at into st, locked from public.pilots p where p.id = pid;
  if st is null then
    raise exception 'El piloto no existe.';
  end if;
  if st <> 'draft' then
    if locked is not null then
      raise exception 'El diseño está bloqueado desde que se aprobó el piloto. Los cambios en la ejecución se registran como incidentes.';
    end if;
    raise exception 'El piloto está en revisión: pídale al aprobador que lo devuelva a borrador para editarlo.';
  end if;
  if tg_table_name = 'pilot_guardrails' and tg_op = 'INSERT'
     and (select count(*) from public.pilot_guardrails g where g.pilot_id = pid) >= 3 then
    raise exception 'Un piloto lleva máximo 3 guardrails.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger b_guard before insert or update or delete on public.pilot_arms
  for each row execute function private.pilot_design_child_guard();
create trigger b_guard before insert or update or delete on public.pilot_guardrails
  for each row execute function private.pilot_design_child_guard();
create trigger b_guard before insert or update or delete on public.pilot_media
  for each row execute function private.pilot_design_child_guard();

-- Lista de chequeo: se arma y se verifica antes de lanzar.
create or replace function private.pilot_checklist_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.pilot_status;
  pid uuid := case when tg_op = 'DELETE' then old.pilot_id else new.pilot_id end;
begin
  if private.guard_bypassed() or private.is_service() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select p.status into st from public.pilots p where p.id = pid;
  if st not in ('draft', 'in_review', 'approved') then
    raise exception 'La lista de chequeo se cierra cuando el piloto sale a prueba.';
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      new.checked_by := case when new.status = 'pending' then null else auth.uid() end;
      new.checked_at := case when new.status = 'pending' then null else now() end;
    end if;
    return new;
  end if;
  return old;
end;
$$;

create trigger b_guard before insert or update or delete on public.pilot_checklist_items
  for each row execute function private.pilot_checklist_guard();

-- Datos: se cargan hasta que el piloto se decide. Un dato traído por integración
-- que se corrige a mano queda marcado como ajustado, con su valor original.
create or replace function private.pilot_measurements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.pilot_status;
  arm_pilot uuid;
  m_calc public.pilot_metric_calc;
  pid uuid;
begin
  if tg_op = 'DELETE' then
    pid := old.pilot_id;
  else
    select a.pilot_id into arm_pilot from public.pilot_arms a where a.id = new.arm_id;
    if arm_pilot is null then
      raise exception 'El grupo no existe.';
    end if;
    new.pilot_id := arm_pilot;
    pid := arm_pilot;
    select m.calc into m_calc from public.pilot_metrics m where m.id = new.metric_id;
    if m_calc is distinct from 'sum' then
      raise exception 'Solo se cargan métricas de suma; las tasas y los costos por unidad se calculan solos.';
    end if;
    if new.granularity = 'week' and extract(isodow from new.period_start) <> 1 then
      raise exception 'Los datos semanales van con la fecha del lunes de esa semana.';
    end if;
    new.unit_label := trim(coalesce(new.unit_label, ''));
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  if not (private.guard_bypassed() or private.is_service()) then
    select p.status into st from public.pilots p where p.id = pid;
    if st in ('decided', 'cancelled') then
      raise exception 'El piloto ya se cerró: los datos quedan como se leyeron.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.source = 'mcp' and new.value is distinct from old.value then
      new.original_value := coalesce(old.original_value, old.value);
      new.adjusted_at := now();
      new.adjusted_by := auth.uid();
    end if;
    new.created_by := old.created_by;
  elsif tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger b_guard before insert or update or delete on public.pilot_measurements
  for each row execute function private.pilot_measurements_guard();

-- Incidentes: se registran desde que el piloto está aprobado y hasta que se decide.
create or replace function private.pilot_incidents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.pilot_status;
begin
  if private.guard_bypassed() or private.is_service() then
    return new;
  end if;
  select p.status into st from public.pilots p where p.id = new.pilot_id;
  if st not in ('approved', 'in_test', 'in_reading') then
    raise exception 'Los incidentes se registran con el piloto aprobado, en prueba o en lectura.';
  end if;
  new.created_by := auth.uid();
  return new;
end;
$$;

create trigger b_guard before insert on public.pilot_incidents
  for each row execute function private.pilot_incidents_guard();

-- -----------------------------------------------------------------------------
-- RPC del flujo
-- -----------------------------------------------------------------------------
create or replace function private.pilot_for_update(p_pilot uuid)
returns public.pilots
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots;
begin
  if not private.pilot_can_read() then
    raise exception 'No tiene acceso al módulo de pilotos.';
  end if;
  select * into p from public.pilots where id = p_pilot and deleted_at is null for update;
  if p.id is null then
    raise exception 'El piloto no existe o fue borrado.';
  end if;
  return p;
end;
$$;

-- Qué le falta a un piloto para pasar a revisión (lista vacía = listo).
create or replace function public.pilot_missing(p_pilot uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.pilots;
  v public.pilot_variables;
  missing text[] := '{}';
  arms_total int;
  arms_control int;
  arms_without_cities int;
  n_guardrails int;
  n_media int;
begin
  if not private.pilot_can_read() then
    raise exception 'No tiene acceso al módulo de pilotos.';
  end if;
  select * into p from public.pilots where id = p_pilot and deleted_at is null;
  if p.id is null then
    raise exception 'El piloto no existe o fue borrado.';
  end if;
  if coalesce(trim(p.problem), '') = '' then missing := array_append(missing, 'el problema'); end if;
  if coalesce(trim(p.hypothesis_change), '') = '' or coalesce(trim(p.hypothesis_scope), '') = ''
     or coalesce(trim(p.hypothesis_metric), '') = '' or p.hypothesis_expected_pct is null or coalesce(trim(p.hypothesis_reason), '') = '' then
    missing := array_append(missing, 'la hipótesis completa');
  end if;
  if p.variable_id is null then missing := array_append(missing, 'qué se prueba (variable)'); end if;
  if p.test_type is null then
    missing := array_append(missing, 'el tipo de prueba');
  elsif p.variable_id is not null then
    select * into v from public.pilot_variables where id = p.variable_id;
    if p.test_type <> v.recommended_test_type and p.test_type is distinct from v.alternative_test_type
       and length(coalesce(trim(p.design_justification), '')) < 10 then
      missing := array_append(missing, 'la justificación de por qué no usa el tipo de prueba recomendado');
    end if;
  end if;
  if p.primary_metric_id is null then missing := array_append(missing, 'la métrica principal'); end if;
  select count(*) into n_guardrails from public.pilot_guardrails where pilot_id = p.id;
  if n_guardrails < 1 then missing := array_append(missing, 'al menos un guardrail'); end if;
  if p.power_result is null or p.power_inputs is null then missing := array_append(missing, 'el cálculo de potencia'); end if;
  if p.decision_rules is null then missing := array_append(missing, 'las reglas de decisión'); end if;
  if p.planned_start is null or p.planned_end is null then missing := array_append(missing, 'las fechas planeadas'); end if;
  select count(*) into n_media from public.pilot_media where pilot_id = p.id;
  if n_media < 1 then missing := array_append(missing, 'al menos un medio'); end if;
  select count(*), count(*) filter (where is_control), count(*) filter (where cardinality(cities) = 0)
    into arms_total, arms_control, arms_without_cities
  from public.pilot_arms where pilot_id = p.id;
  if arms_control <> 1 or arms_total < 2 then
    missing := array_append(missing, 'los grupos (un control y al menos una variante)');
  elsif p.test_type = 'geo' and arms_without_cities > 0 then
    missing := array_append(missing, 'las ciudades de cada grupo');
  elsif p.test_type = 'holdout' and arms_total <> 2 then
    missing := array_append(missing, 'dos grupos: expuesto y holdout');
  end if;
  return missing;
end;
$$;

create or replace function public.pilot_submit(p_pilot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
  missing text[];
begin
  if not private.pilot_can_write() then
    raise exception 'Su rol no puede enviar pilotos a revisión.';
  end if;
  if p.status <> 'draft' then
    raise exception 'Solo un piloto en Borrador se envía a revisión.';
  end if;
  missing := public.pilot_missing(p_pilot);
  if cardinality(missing) > 0 then
    raise exception 'Para enviar a revisión falta: %.', array_to_string(missing, ', ');
  end if;
  perform private.bypass_guard();
  update public.pilots set status = 'in_review', status_changed_at = now(), submitted_at = now() where id = p.id;
  insert into public.pilot_reviews (pilot_id, action) values (p.id, 'submitted');
end;
$$;

create or replace function public.pilot_return(p_pilot uuid, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador devuelve pilotos.';
  end if;
  if p.status <> 'in_review' then
    raise exception 'Solo se devuelve un piloto que está en revisión.';
  end if;
  if length(coalesce(trim(p_comment), '')) < 5 then
    raise exception 'Cuéntele al equipo qué hay que ajustar (mínimo 5 caracteres).';
  end if;
  perform private.bypass_guard();
  update public.pilots set status = 'draft', status_changed_at = now() where id = p.id;
  insert into public.pilot_reviews (pilot_id, action, comment) values (p.id, 'returned', trim(p_comment));
end;
$$;

create or replace function public.pilot_approve(p_pilot uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador aprueba pilotos.';
  end if;
  if p.status <> 'in_review' then
    raise exception 'Solo se aprueba un piloto que está en revisión.';
  end if;
  if cardinality(public.pilot_missing(p_pilot)) > 0 then
    raise exception 'Al piloto todavía le falta: %.', array_to_string(public.pilot_missing(p_pilot), ', ');
  end if;
  perform private.bypass_guard();
  update public.pilots
  set status = 'approved', status_changed_at = now(), design_locked_at = now(), approved_by = auth.uid(), approved_at = now()
  where id = p.id;
  insert into public.pilot_reviews (pilot_id, action, comment) values (p.id, 'approved', nullif(trim(coalesce(p_comment, '')), ''));
end;
$$;

create or replace function public.pilot_start(p_pilot uuid, p_start date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
  total int;
  pending int;
begin
  if not private.pilot_can_write() then
    raise exception 'Su rol no puede lanzar pilotos.';
  end if;
  if p.status <> 'approved' then
    raise exception 'Solo se lanza un piloto aprobado.';
  end if;
  select count(*), count(*) filter (where status <> 'ok') into total, pending
  from public.pilot_checklist_items where pilot_id = p.id;
  if total = 0 then
    raise exception 'Antes de lanzar, arme la lista de chequeo de medición: ¿qué eventos tienen que disparar?';
  end if;
  if pending > 0 then
    raise exception 'Antes de lanzar, verifique la medición: faltan % evento(s) por confirmar en la lista de chequeo.', pending;
  end if;
  if p_start is null then
    raise exception 'Indique la fecha de inicio.';
  end if;
  perform private.bypass_guard();
  update public.pilots set status = 'in_test', status_changed_at = now(), actual_start = p_start where id = p.id;
  insert into public.pilot_reviews (pilot_id, action) values (p.id, 'started');
end;
$$;

create or replace function public.pilot_to_reading(p_pilot uuid, p_end date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if not private.pilot_can_write() then
    raise exception 'Su rol no puede cerrar la prueba.';
  end if;
  if p.status <> 'in_test' then
    raise exception 'Solo pasa a lectura un piloto que está en prueba.';
  end if;
  if p_end is null or p_end < p.actual_start then
    raise exception 'La fecha de cierre no puede ser anterior al inicio.';
  end if;
  perform private.bypass_guard();
  update public.pilots set status = 'in_reading', status_changed_at = now(), actual_end = p_end where id = p.id;
  insert into public.pilot_reviews (pilot_id, action) values (p.id, 'to_reading');
end;
$$;

create or replace function public.pilot_decide(
  p_pilot uuid,
  p_verdict public.verdict,
  p_decision public.decision,
  p_justification text,
  p_learning text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador firma la decisión.';
  end if;
  if p.status <> 'in_reading' then
    raise exception 'Solo se decide un piloto que está en lectura.';
  end if;
  if p_verdict is null or p_decision is null then
    raise exception 'Elija el veredicto y la decisión.';
  end if;
  if length(coalesce(trim(p_justification), '')) < 10 then
    raise exception 'Justifique la decisión (mínimo 10 caracteres).';
  end if;
  if length(coalesce(trim(p_learning), '')) < 10 then
    raise exception 'Sin aprendizaje no hay decisión: escriba qué aprendimos (mínimo 10 caracteres).';
  end if;
  perform private.bypass_guard();
  update public.pilots
  set status = 'decided', status_changed_at = now(), verdict = p_verdict, decision = p_decision,
      decision_justification = trim(p_justification), decided_by = auth.uid(), decided_at = now()
  where id = p.id;
  insert into public.pilot_learnings (pilot_id, text) values (p.id, trim(p_learning))
  on conflict (pilot_id) do update set text = excluded.text;
  insert into public.pilot_reviews (pilot_id, action, comment) values (p.id, 'decided', trim(p_justification));
end;
$$;

create or replace function public.pilot_cancel(p_pilot uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if p.status in ('decided', 'cancelled') then
    raise exception 'Este piloto ya está cerrado.';
  end if;
  if not (private.pilot_is_approver() or (private.pilot_can_write() and p.status = 'draft' and p.created_by = auth.uid())) then
    raise exception 'Solo un aprobador cancela pilotos (quien lo creó puede cancelar su borrador).';
  end if;
  if length(coalesce(trim(p_reason), '')) < 5 then
    raise exception 'Cuente por qué se cancela (mínimo 5 caracteres).';
  end if;
  perform private.bypass_guard();
  update public.pilots set status = 'cancelled', status_changed_at = now(), cancel_reason = trim(p_reason) where id = p.id;
  insert into public.pilot_reviews (pilot_id, action, comment) values (p.id, 'cancelled', trim(p_reason));
end;
$$;

create or replace function public.pilot_delete(p_pilot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.pilots := private.pilot_for_update(p_pilot);
begin
  if not (private.pilot_is_approver() or (private.pilot_can_write() and p.status = 'draft' and p.created_by = auth.uid())) then
    raise exception 'Solo un aprobador borra pilotos (quien lo creó puede borrar su borrador).';
  end if;
  perform private.bypass_guard();
  update public.pilots set deleted_at = now(), deleted_by = auth.uid() where id = p.id;
  insert into public.pilot_reviews (pilot_id, action) values (p.id, 'deleted');
end;
$$;

create or replace function public.pilot_restore(p_pilot uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador restaura pilotos.';
  end if;
  perform private.bypass_guard();
  update public.pilots set deleted_at = null, deleted_by = null where id = p_pilot and deleted_at is not null;
  if not found then
    raise exception 'El piloto no está borrado.';
  end if;
  insert into public.pilot_reviews (pilot_id, action) values (p_pilot, 'restored');
end;
$$;

-- Fusiona un medio duplicado en otro: los pilotos y las métricas propias pasan al destino.
create or replace function public.merge_media(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador fusiona medios.';
  end if;
  if p_from = p_into then
    raise exception 'Elija dos medios distintos.';
  end if;
  if not exists (select 1 from public.media_channels where id = p_into and archived_at is null) then
    raise exception 'El medio de destino no existe o está archivado.';
  end if;
  perform private.bypass_guard();
  update public.pilot_media set media_id = p_into where media_id = p_from;
  update public.pilot_metrics set media_id = p_into where media_id = p_from;
  update public.media_channels set merged_into_id = p_into, archived_at = now() where id = p_from;
end;
$$;

-- Borra de verdad los pilotos de ejemplo (sin papelera ni auditoría).
create or replace function public.delete_example_pilots()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not private.pilot_is_approver() then
    raise exception 'Solo un aprobador borra los ejemplos.';
  end if;
  perform private.bypass_guard();
  perform set_config('app.skip_pilot_audit', 'on', true);
  delete from public.pilots where is_example;
  get diagnostics n = row_count;
  delete from public.pilot_audit a where a.pilot_id is not null and not exists (select 1 from public.pilots p where p.id = a.pilot_id);
  return n;
end;
$$;

revoke execute on function public.pilot_missing(uuid), public.pilot_submit(uuid), public.pilot_return(uuid, text),
  public.pilot_approve(uuid, text), public.pilot_start(uuid, date), public.pilot_to_reading(uuid, date),
  public.pilot_decide(uuid, public.verdict, public.decision, text, text), public.pilot_cancel(uuid, text),
  public.pilot_delete(uuid), public.pilot_restore(uuid), public.merge_media(uuid, uuid), public.delete_example_pilots()
  from anon, public;
grant execute on function public.pilot_missing(uuid), public.pilot_submit(uuid), public.pilot_return(uuid, text),
  public.pilot_approve(uuid, text), public.pilot_start(uuid, date), public.pilot_to_reading(uuid, date),
  public.pilot_decide(uuid, public.verdict, public.decision, text, text), public.pilot_cancel(uuid, text),
  public.pilot_delete(uuid), public.pilot_restore(uuid), public.merge_media(uuid, uuid), public.delete_example_pilots()
  to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pilot_roles', 'media_channels', 'pilot_variables', 'pilot_metrics', 'pilots', 'pilot_media', 'pilot_arms',
    'pilot_guardrails', 'pilot_checklist_items', 'pilot_measurements', 'pilot_incidents', 'pilot_reviews',
    'pilot_learnings', 'pilot_ai_drafts', 'pilot_audit'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Lo que solo escriben las RPC y los triggers.
revoke insert, update, delete on public.pilot_reviews, public.pilot_learnings, public.pilot_audit from authenticated;
revoke update, delete on public.pilot_incidents from authenticated;

-- Compañeros del módulo: se ven entre sí; el aprobador ve a todos (para asignar roles).
create policy profiles_select_pilots on public.profiles for select to authenticated
  using (private.pilot_is_approver() or (private.pilot_can_read() and private.is_pilot_member(id)));

create policy pilot_roles_select on public.pilot_roles for select to authenticated
  using (user_id = auth.uid() or private.pilot_can_read());
create policy pilot_roles_insert on public.pilot_roles for insert to authenticated
  with check (private.pilot_is_approver());
create policy pilot_roles_update on public.pilot_roles for update to authenticated
  using (private.pilot_is_approver()) with check (private.pilot_is_approver());
create policy pilot_roles_delete on public.pilot_roles for delete to authenticated
  using (private.pilot_is_approver());

-- Catálogos: todos leen; creadores agregan medios y métricas propias; el aprobador edita.
create policy media_select on public.media_channels for select to authenticated using (private.pilot_can_read());
create policy media_insert on public.media_channels for insert to authenticated
  with check (private.pilot_can_write() and archived_at is null and merged_into_id is null);
create policy media_update on public.media_channels for update to authenticated
  using (private.pilot_is_approver()) with check (private.pilot_is_approver());

create policy variables_select on public.pilot_variables for select to authenticated using (private.pilot_can_read());
create policy variables_insert on public.pilot_variables for insert to authenticated with check (private.pilot_is_approver());
create policy variables_update on public.pilot_variables for update to authenticated
  using (private.pilot_is_approver()) with check (private.pilot_is_approver());

create policy pmetrics_select on public.pilot_metrics for select to authenticated using (private.pilot_can_read());
create policy pmetrics_insert on public.pilot_metrics for insert to authenticated
  with check (private.pilot_is_approver() or (private.pilot_can_write() and archived_at is null));
create policy pmetrics_update on public.pilot_metrics for update to authenticated
  using (private.pilot_is_approver()) with check (private.pilot_is_approver());

-- Pilotos
create policy pilots_select on public.pilots for select to authenticated
  using (private.pilot_can_read() and (deleted_at is null or private.pilot_is_approver()));
create policy pilots_insert on public.pilots for insert to authenticated
  with check (private.pilot_can_write());
create policy pilots_update on public.pilots for update to authenticated
  using (deleted_at is null and private.pilot_can_write())
  with check (deleted_at is null and private.pilot_can_write());

-- Hijos de diseño y datos: leen todos; escriben creadores y aprobadores (las guardas deciden según el estado).
do $$
declare
  t text;
begin
  foreach t in array array['pilot_media', 'pilot_arms', 'pilot_guardrails', 'pilot_checklist_items', 'pilot_measurements'] loop
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (private.pilot_can_read())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (private.pilot_can_write())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (private.pilot_can_write()) with check (private.pilot_can_write())', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (private.pilot_can_write())', t);
  end loop;
end;
$$;

create policy pilot_incidents_select on public.pilot_incidents for select to authenticated using (private.pilot_can_read());
create policy pilot_incidents_insert on public.pilot_incidents for insert to authenticated with check (private.pilot_can_write());
create policy pilot_reviews_select on public.pilot_reviews for select to authenticated using (private.pilot_can_read());
create policy pilot_learnings_select on public.pilot_learnings for select to authenticated using (private.pilot_can_read());
create policy pilot_ai_drafts_select on public.pilot_ai_drafts for select to authenticated using (private.pilot_can_read());
create policy pilot_ai_drafts_insert on public.pilot_ai_drafts for insert to authenticated
  with check (private.pilot_can_write() and status = 'draft' and created_by = auth.uid());
create policy pilot_ai_drafts_update on public.pilot_ai_drafts for update to authenticated
  using (private.pilot_can_write()) with check (private.pilot_can_write());
create policy pilot_audit_select on public.pilot_audit for select to authenticated using (private.pilot_can_read());

-- -----------------------------------------------------------------------------
-- Catálogos iniciales (editables por el aprobador)
-- -----------------------------------------------------------------------------
insert into public.media_channels (name, kind, provider, data_mode, integration, created_by) values
  ('Meta Ads', 'Redes sociales', 'Meta', 'manual', 'meta', null),
  ('Google Ads', 'Búsqueda y display', 'Google', 'manual', 'google_ads', null),
  ('TikTok Ads', 'Redes sociales', 'TikTok', 'manual', 'tiktok', null),
  ('Programática', 'Display programático', null, 'manual', null, null),
  ('DOOH', 'Exterior digital', null, 'manual', null, null),
  ('Radio digital', 'Audio', null, 'manual', null, null),
  ('Influenciadores', 'Creadores de contenido', null, 'manual', null, null),
  ('SMS', 'Mensajería', null, 'manual', null, null),
  ('Email', 'Mensajería', null, 'manual', null, null),
  ('Retail media', 'Comercio', null, 'manual', null, null);

insert into public.pilot_metrics (name, description, unit, direction, scope, calc, is_spend, created_by) values
  ('Inversión', 'Plata invertida en el periodo (COP).', 'cop', 'down', 'platform', 'sum', true, null),
  ('Impresiones', 'Veces que se mostró el anuncio.', 'count', 'up', 'platform', 'sum', false, null),
  ('Clics', 'Clics en el anuncio.', 'count', 'up', 'platform', 'sum', false, null),
  ('Conversaciones iniciadas', 'Chats de WhatsApp que se abrieron desde el anuncio (CTWA).', 'count', 'up', 'platform', 'sum', false, null),
  ('Visitas a la landing', 'Sesiones que llegaron a la página.', 'count', 'up', 'platform', 'sum', false, null),
  ('Personas en el grupo', 'Personas alcanzadas o asignadas al grupo (base de la tasa en holdout).', 'count', 'up', 'business', 'sum', false, null),
  ('Ventas', 'Líneas activadas o pedidos confirmados (dato del negocio, no de la plataforma).', 'count', 'up', 'business', 'sum', false, null),
  ('Ingresos', 'Ingresos de las ventas del periodo (COP).', 'cop', 'up', 'business', 'sum', false, null);

insert into public.pilot_metrics (name, description, unit, direction, scope, calc, numerator_id, denominator_id, created_by)
select x.name, x.description, x.unit::public.pilot_unit, x.direction::public.metric_direction, x.scope::public.pilot_metric_scope,
       x.calc::public.pilot_metric_calc, n.id, d.id, null
from (values
  ('CTR', 'Clics sobre impresiones.', 'percent', 'up', 'platform', 'rate', 'Clics', 'Impresiones'),
  ('Tasa de venta por conversación', 'Ventas sobre conversaciones iniciadas.', 'percent', 'up', 'business', 'rate', 'Ventas', 'Conversaciones iniciadas'),
  ('Tasa de venta por visita', 'Ventas sobre visitas a la landing.', 'percent', 'up', 'business', 'rate', 'Ventas', 'Visitas a la landing'),
  ('Tasa de conversión del grupo', 'Ventas sobre personas del grupo (para holdout).', 'percent', 'up', 'business', 'rate', 'Ventas', 'Personas en el grupo'),
  ('CPC', 'Costo por clic.', 'cop', 'down', 'platform', 'cost_per', 'Inversión', 'Clics'),
  ('Costo por conversación', 'Costo por conversación iniciada.', 'cop', 'down', 'platform', 'cost_per', 'Inversión', 'Conversaciones iniciadas'),
  ('Costo por venta (CPA)', 'Inversión sobre ventas.', 'cop', 'down', 'business', 'cost_per', 'Inversión', 'Ventas')
) as x (name, description, unit, direction, scope, calc, num, den)
join public.pilot_metrics n on n.name = x.num and n.calc = 'sum'
join public.pilot_metrics d on d.name = x.den and d.calc = 'sum';

insert into public.pilot_variables (category, name, description, recommended_test_type, alternative_test_type, sort_order, created_by) values
  ('creative', 'Formato (video, estático, carrusel, UGC)', null, 'ab_creative', null, 10, null),
  ('creative', 'Gancho de los primeros 3 segundos', null, 'ab_creative', null, 11, null),
  ('creative', 'Mensaje u oferta en la pieza', null, 'ab_creative', null, 12, null),
  ('creative', 'CTA', null, 'ab_creative', null, 13, null),
  ('creative', 'Copy', null, 'ab_creative', null, 14, null),
  ('audience', 'Amplia (Advantage+) vs. segmentada', null, 'ab_platform', null, 20, null),
  ('audience', 'Lookalike vs. intereses', null, 'ab_platform', null, 21, null),
  ('audience', 'Exclusión de clientes', null, 'ab_platform', null, 22, null),
  ('audience', 'Retargeting vs. prospección', null, 'ab_platform', null, 23, null),
  ('structure', 'Consolidación vs. fragmentación', null, 'ab_platform', null, 30, null),
  ('structure', 'CBO vs. ABO', null, 'ab_platform', null, 31, null),
  ('structure', 'Estrategia de puja', null, 'ab_platform', null, 32, null),
  ('structure', 'Objetivo de optimización (conversación vs. venta)', null, 'ab_platform', null, 33, null),
  ('placements', 'Automáticos vs. manuales', null, 'ab_platform', null, 40, null),
  ('placements', 'Reels/Stories vs. feed', null, 'ab_platform', null, 41, null),
  ('destination', 'CTWA directo vs. landing hacia WhatsApp vs. eCommerce', null, 'ab_platform', 'geo', 50, null),
  ('destination', 'Variantes de landing', null, 'ab_platform', 'geo', 51, null),
  ('destination', 'Primer mensaje o flujo del bot', null, 'ab_platform', 'geo', 52, null),
  ('destination', 'Checkout', null, 'ab_platform', 'geo', 53, null),
  ('channel', 'Canal nuevo vs. ninguno', null, 'holdout', 'geo', 60, null),
  ('channel', 'Incrementalidad de una campaña', null, 'holdout', 'geo', 61, null),
  ('channel', 'Meta vs. Google vs. TikTok vs. otros', null, 'geo', 'holdout', 62, null),
  ('investment', 'Niveles de presupuesto (saturación)', null, 'geo', null, 70, null),
  ('investment', 'Distribución geográfica', null, 'geo', null, 71, null),
  ('investment', 'Dayparting', null, 'geo', 'ab_platform', 72, null),
  ('signal', 'CAPI', null, 'ab_platform', 'geo', 80, null),
  ('signal', 'Eventos offline de venta', null, 'ab_platform', 'geo', 81, null),
  ('signal', 'Calidad de señal', null, 'ab_platform', 'geo', 82, null),
  ('offer', 'Promociones', null, 'geo', 'ab_platform', 90, null),
  ('offer', 'Bonos de portabilidad', null, 'geo', 'ab_platform', 91, null),
  ('offer', 'Precio visible vs. oculto', null, 'geo', 'ab_platform', 92, null);

-- Los catálogos iniciales no ensucian la auditoría.
delete from public.pilot_audit;

-- Realtime: el detalle del piloto se refresca cuando otro cambia datos.
alter publication supabase_realtime add table public.pilots, public.pilot_measurements;
