-- =============================================================================
-- Growth Framework · esquema base
-- Tablas, tipos, índices y triggers genéricos. Las reglas de negocio viven en
-- 20260925000003_business_rules.sql y los permisos en 20260925000005_rls.sql.
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.program_role as enum ('owner', 'collaborator', 'agency', 'viewer');
create type public.metric_type as enum ('north_star', 'efficiency', 'input');
create type public.metric_branch as enum ('demand_volume', 'conversion', 'efficiency', 'recovery_recurrence');
create type public.metric_direction as enum ('up', 'down');
create type public.impact_level as enum ('high', 'medium', 'low');
create type public.control_level as enum ('ours', 'shared', 'external');
create type public.problem_status as enum ('to_validate', 'validated', 'discarded');
create type public.experiment_status as enum (
  'idea', 'prioritized', 'in_design', 'in_test', 'in_reading', 'decided', 'scaled', 'discarded'
);
create type public.owner_type as enum ('internal', 'agency', 'mixed');
create type public.test_type as enum ('ab', 'geo', 'before_after');
create type public.verdict as enum ('winner', 'loser', 'inconclusive');
create type public.decision as enum ('scale', 'adjust', 'kill');
create type public.calendar_event_type as enum ('peak', 'freeze', 'decision');
create type public.attachment_entity as enum ('problem', 'experiment');

-- -----------------------------------------------------------------------------
-- updated_at genérico
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- programs
-- -----------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  is_demo boolean not null default false,
  start_date date,
  end_date date,
  scoring_config jsonb not null default '{"calendar_bonus": 1, "shared_penalty": 1, "external_penalty": 3}'::jsonb,
  setup_step smallint not null default 0 check (setup_step between 0 and 5),
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  constraint programs_dates_chk check (end_date is null or start_date is null or end_date >= start_date)
);
-- Solo puede existir un programa de ejemplo.
create unique index programs_single_demo_idx on public.programs ((true)) where is_demo;

create table public.program_horizons (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_horizons_dates_chk check (end_date >= start_date)
);
create index program_horizons_program_idx on public.program_horizons (program_id);

create table public.program_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.program_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (program_id, user_id)
);
create index program_members_user_idx on public.program_members (user_id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  type public.calendar_event_type not null,
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  constraint calendar_events_dates_chk check (end_date >= start_date)
);
create index calendar_events_program_idx on public.calendar_events (program_id);

-- -----------------------------------------------------------------------------
-- Líneas, métricas, embudo
-- -----------------------------------------------------------------------------
create table public.business_lines (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid
);
create index business_lines_program_idx on public.business_lines (program_id);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  line_id uuid not null references public.business_lines (id) on delete cascade,
  parent_id uuid references public.metrics (id) on delete cascade,
  type public.metric_type not null,
  branch public.metric_branch,
  name text not null check (length(trim(name)) > 0),
  definition text,
  channel text,
  unit text,
  direction public.metric_direction not null default 'up',
  source text,
  baseline numeric,
  owner_id uuid references public.profiles (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  constraint metrics_input_branch_chk check (type <> 'input' or branch is not null),
  constraint metrics_not_self_parent_chk check (parent_id is null or parent_id <> id)
);
create index metrics_line_idx on public.metrics (line_id);
create index metrics_parent_idx on public.metrics (parent_id);
-- Una métrica norte activa por línea.
create unique index metrics_one_north_star_idx on public.metrics (line_id)
  where type = 'north_star' and deleted_at is null;

create table public.metric_targets (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  metric_id uuid not null references public.metrics (id) on delete cascade,
  horizon_id uuid not null references public.program_horizons (id) on delete cascade,
  target numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (metric_id, horizon_id)
);

create table public.metric_values (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  metric_id uuid not null references public.metrics (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  value numeric not null,
  note text,
  entered_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  unique (metric_id, week_start)
);
create index metric_values_program_week_idx on public.metric_values (program_id, week_start);

create table public.metric_value_history (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  metric_value_id uuid not null references public.metric_values (id) on delete cascade,
  old_value numeric,
  new_value numeric,
  old_note text,
  new_note text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index metric_value_history_value_idx on public.metric_value_history (metric_value_id);

create table public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  line_id uuid not null references public.business_lines (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order smallint not null default 0,
  description text,
  metric_id uuid references public.metrics (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid
);
create index funnel_stages_line_idx on public.funnel_stages (line_id);

-- -----------------------------------------------------------------------------
-- Problemas y ejercicios
-- -----------------------------------------------------------------------------
create table public.problems (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  line_id uuid not null references public.business_lines (id) on delete cascade,
  stage_id uuid not null references public.funnel_stages (id) on delete cascade,
  channel text,
  title text not null check (length(trim(title)) > 0),
  evidence text not null check (length(trim(evidence)) > 0),
  root_cause text,
  impact public.impact_level not null default 'medium',
  control public.control_level not null default 'ours',
  status public.problem_status not null default 'to_validate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid
);
create index problems_program_idx on public.problems (program_id);
create index problems_line_idx on public.problems (line_id);
create index problems_stage_idx on public.problems (stage_id);

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  line_id uuid not null references public.business_lines (id) on delete cascade,
  -- Regla 1: no hay ejercicios huérfanos.
  problem_id uuid not null references public.problems (id) on delete cascade,
  metric_id uuid not null references public.metrics (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  hypothesis_if text,
  hypothesis_then text,
  hypothesis_because text,
  impact smallint check (impact between 1 and 10),
  confidence smallint check (confidence between 1 and 10),
  ease smallint check (ease between 1 and 10),
  fits_calendar boolean not null default false,
  control public.control_level not null default 'ours',
  ice_score numeric(4, 1),
  final_score numeric(4, 1),
  owner_id uuid references public.profiles (id) on delete set null,
  owner_type public.owner_type,
  status public.experiment_status not null default 'idea',
  status_changed_at timestamptz not null default now(),
  test_type public.test_type,
  primary_metric text,
  control_metrics text[] not null default '{}',
  min_duration_days integer check (min_duration_days > 0),
  decision_rule text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  design_locked_at timestamptz,
  decided_at timestamptz,
  verdict public.verdict,
  decision public.decision,
  decision_rationale text,
  derived_from_learning_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  constraint experiments_planned_dates_chk check (planned_end is null or planned_start is null or planned_end >= planned_start),
  constraint experiments_actual_dates_chk check (actual_end is null or actual_start is null or actual_end >= actual_start)
);
create index experiments_program_idx on public.experiments (program_id);
create index experiments_line_idx on public.experiments (line_id);
create index experiments_problem_idx on public.experiments (problem_id);
create index experiments_metric_idx on public.experiments (metric_id);
create index experiments_owner_idx on public.experiments (owner_id);

create table public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_control boolean not null default false,
  description text,
  sample numeric check (sample >= 0),
  conversions numeric check (conversions >= 0),
  metric_value numeric,
  notes text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid
);
create index experiment_variants_experiment_idx on public.experiment_variants (experiment_id);
create unique index experiment_variants_one_control_idx on public.experiment_variants (experiment_id)
  where is_control and deleted_at is null;

create table public.learnings (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  applies_to_line_ids uuid[] not null default '{}',
  suggested_hypothesis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid
);
create unique index learnings_one_per_experiment_idx on public.learnings (experiment_id) where deleted_at is null;
create index learnings_program_idx on public.learnings (program_id);

alter table public.experiments
  add constraint experiments_derived_from_learning_fk
  foreign key (derived_from_learning_id) references public.learnings (id) on delete set null;

-- Adjuntos: entidad polimórfica (problema o ejercicio) con FK real para que
-- la eliminación definitiva en cascada alcance también a los archivos.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  entity_type public.attachment_entity not null,
  problem_id uuid references public.problems (id) on delete cascade,
  experiment_id uuid references public.experiments (id) on delete cascade,
  storage_path text not null unique,
  name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  deletion_batch uuid,
  constraint attachments_entity_chk check (
    (entity_type = 'problem' and problem_id is not null and experiment_id is null)
    or (entity_type = 'experiment' and experiment_id is not null and problem_id is null)
  ),
  constraint attachments_mime_chk check (
    mime_type in (
      'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  )
);
create index attachments_problem_idx on public.attachments (problem_id);
create index attachments_experiment_idx on public.attachments (experiment_id);

-- -----------------------------------------------------------------------------
-- Auditoría, papelera y cola de borrado de Storage
-- -----------------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_program_idx on public.activity_log (program_id, created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_id);

create table public.trash_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  label text not null,
  batch_id uuid not null unique,
  details jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now(),
  deleted_by uuid references public.profiles (id) on delete set null
);
create index trash_items_program_idx on public.trash_items (program_id, deleted_at desc);

-- Rutas de Storage pendientes de borrar tras una eliminación definitiva.
-- Solo la procesa el servidor con la secret key (la API de Storage es la única
-- vía permitida para borrar objetos).
create table public.storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'attachments',
  storage_path text not null,
  enqueued_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at en todas las tablas que lo tienen
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'program_horizons', 'program_members', 'calendar_events',
    'business_lines', 'metrics', 'metric_targets', 'metric_values', 'funnel_stages',
    'problems', 'experiments', 'experiment_variants', 'learnings', 'attachments'
  ] loop
    execute format(
      'create trigger z_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      t
    );
  end loop;
end;
$$;
