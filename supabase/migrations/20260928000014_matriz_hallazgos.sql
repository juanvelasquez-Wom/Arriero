-- =============================================================================
-- Matriz de hallazgos de la auditoría integral (28 sep 2026)
-- · X1  Guardrails y potencia en los ejercicios (el rigor de Pilotos, en todo).
-- · M1  Métricas del árbol con alcance (plataforma / negocio) y fórmula.
-- · K1  Taxonomía común en los aprendizajes y una biblioteca unificada.
-- · H1  Preferencia del resumen semanal por correo.
-- · B3  Registro de errores del servidor.
-- · U1  Días de uso por persona (adopción) para la North Star.
-- · S8  Tope atómico de La Tía (reserva antes de llamar).
-- · S5  En Pilotos, el creador edita solo lo suyo.
-- · B1  Guardado atómico del diseño de un piloto con bloqueo optimista.
-- · G1  Hechos diarios de campañas (Meta primero) · G2 Ventas del negocio.
-- · D3  Índices que faltaban.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- D3 · Índices
-- -----------------------------------------------------------------------------
create index if not exists pilot_checklist_items_pilot_idx on public.pilot_checklist_items (pilot_id);
create index if not exists pilot_incidents_pilot_idx on public.pilot_incidents (pilot_id);
create index if not exists pilot_guardrails_pilot_idx on public.pilot_guardrails (pilot_id);
create index if not exists experiment_comments_program_idx on public.experiment_comments (program_id);
create index if not exists metric_targets_horizon_idx on public.metric_targets (horizon_id);
create index if not exists attachments_program_idx on public.attachments (program_id);

-- -----------------------------------------------------------------------------
-- X1 · Guardrails y potencia en los ejercicios
-- -----------------------------------------------------------------------------
alter table public.experiments
  add column if not exists expected_effect_pct numeric check (expected_effect_pct is null or expected_effect_pct between -100 and 1000),
  add column if not exists power_inputs jsonb,
  add column if not exists power_result jsonb;

-- Valor de cada guardrail por variante (en la misma unidad de la métrica): { "<guardrail_id>": 123.4 }.
alter table public.experiment_variants
  add column if not exists guardrail_values jsonb not null default '{}'::jsonb;

create table if not exists public.experiment_guardrails (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  metric_id uuid not null references public.metrics (id) on delete cascade,
  -- Cuánto se permite empeorar, en % relativo (15 = "no empeora más de 15 %").
  limit_pct numeric not null check (limit_pct > 0 and limit_pct <= 1000),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (experiment_id, metric_id)
);
create index if not exists experiment_guardrails_experiment_idx on public.experiment_guardrails (experiment_id);

create or replace function private.experiment_guardrails_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_line uuid;
  v_locked timestamptz;
  exp_id uuid := case when tg_op = 'DELETE' then old.experiment_id else new.experiment_id end;
begin
  select e.program_id, e.line_id, e.design_locked_at into v_program, v_line, v_locked
  from public.experiments e where e.id = exp_id and e.deleted_at is null;
  if v_program is null then
    raise exception 'El ejercicio no existe o fue borrado.';
  end if;
  if tg_op <> 'DELETE' then
    new.program_id := v_program;
    if tg_op = 'UPDATE' and new.experiment_id <> old.experiment_id then
      raise exception 'Un guardrail no puede cambiar de ejercicio.';
    end if;
    if not exists (select 1 from public.metrics m where m.id = new.metric_id and m.line_id = v_line and m.deleted_at is null) then
      raise exception 'El guardrail debe ser una métrica de la misma línea del ejercicio.';
    end if;
  end if;
  if private.is_service() or private.guard_bypassed() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_locked is not null then
    raise exception 'El diseño está bloqueado desde que el ejercicio entró en prueba: los guardrails no se cambian.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if (select count(*) from public.experiment_guardrails g where g.experiment_id = exp_id) >= 3 then
      raise exception 'Un ejercicio lleva máximo 3 guardrails.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists a_guard on public.experiment_guardrails;
create trigger a_guard before insert or update or delete on public.experiment_guardrails
  for each row execute function private.experiment_guardrails_guard();
drop trigger if exists set_updated_at on public.experiment_guardrails;
create trigger set_updated_at before update on public.experiment_guardrails
  for each row execute function private.set_updated_at();

alter table public.experiment_guardrails enable row level security;
revoke all on public.experiment_guardrails from anon;
grant select, insert, update, delete on public.experiment_guardrails to authenticated;
drop policy if exists exp_guardrails_select on public.experiment_guardrails;
create policy exp_guardrails_select on public.experiment_guardrails for select to authenticated using (private.is_member(program_id));
drop policy if exists exp_guardrails_insert on public.experiment_guardrails;
create policy exp_guardrails_insert on public.experiment_guardrails for insert to authenticated
  with check (private.can_edit_experiment(experiment_id));
drop policy if exists exp_guardrails_update on public.experiment_guardrails;
create policy exp_guardrails_update on public.experiment_guardrails for update to authenticated
  using (private.can_edit_experiment(experiment_id)) with check (private.can_edit_experiment(experiment_id));
drop policy if exists exp_guardrails_delete on public.experiment_guardrails;
create policy exp_guardrails_delete on public.experiment_guardrails for delete to authenticated
  using (private.can_edit_experiment(experiment_id));

-- -----------------------------------------------------------------------------
-- M1 · Métricas del árbol: alcance y fórmula (tasa = numerador / denominador)
-- -----------------------------------------------------------------------------
alter table public.metrics
  add column if not exists scope text check (scope is null or scope in ('platform', 'business')),
  add column if not exists numerator_id uuid references public.metrics (id) on delete set null,
  add column if not exists denominator_id uuid references public.metrics (id) on delete set null;
alter table public.metrics drop constraint if exists metrics_formula_chk;
alter table public.metrics add constraint metrics_formula_chk check (
  numerator_id is null or denominator_id is null
  or (numerator_id <> denominator_id and numerator_id <> id and denominator_id <> id)
);

-- -----------------------------------------------------------------------------
-- K1 · Aprendizajes con taxonomía común y biblioteca unificada
-- -----------------------------------------------------------------------------
alter table public.learnings
  add column if not exists lever text,
  add column if not exists channel text;

-- Vista de todos los aprendizajes (ejercicios + pilotos). security_invoker: aplica
-- el RLS de cada tabla de origen a quien consulta.
create or replace view public.all_learnings with (security_invoker = true) as
  select
    'experiment'::text as source,
    l.id,
    l.text,
    l.created_at,
    e.id as item_id,
    e.title as item_title,
    l.program_id,
    p.name as program_name,
    bl.name as line_name,
    e.verdict::text as verdict,
    e.decision::text as decision,
    e.test_type::text as test_type,
    l.lever,
    coalesce(l.channel, pr.channel) as channel,
    e.decided_at
  from public.learnings l
  join public.experiments e on e.id = l.experiment_id and e.deleted_at is null
  join public.programs p on p.id = l.program_id and p.deleted_at is null
  join public.business_lines bl on bl.id = e.line_id
  left join public.problems pr on pr.id = e.problem_id
  where l.deleted_at is null
  union all
  select
    'pilot'::text,
    pl.id,
    pl.text,
    pl.created_at,
    pi.id,
    pi.title,
    pi.program_id,
    null::text,
    null::text,
    pi.verdict::text,
    pi.decision::text,
    pi.test_type::text,
    v.category::text,
    (select string_agg(distinct mc.name, ', ') from public.pilot_media pm join public.media_channels mc on mc.id = pm.media_id where pm.pilot_id = pi.id),
    pi.decided_at
  from public.pilot_learnings pl
  join public.pilots pi on pi.id = pl.pilot_id and pi.deleted_at is null
  left join public.pilot_variables v on v.id = pi.variable_id;

grant select on public.all_learnings to authenticated;
revoke all on public.all_learnings from anon;

-- -----------------------------------------------------------------------------
-- H1 · Resumen semanal por correo (cada quien lo apaga desde su menú)
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists weekly_digest boolean not null default true;

-- Un resumen por persona y semana (el servidor reserva antes de enviar).
create table if not exists public.weekly_digest_sends (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.weekly_digest_sends enable row level security;
revoke all on public.weekly_digest_sends from anon, authenticated;

-- -----------------------------------------------------------------------------
-- B3 · Errores del servidor (solo los escribe el servidor; solo los lee el admin)
-- -----------------------------------------------------------------------------
create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  source text not null,
  message text not null,
  digest text,
  detail text,
  user_id uuid references public.profiles (id) on delete set null
);
create index if not exists error_log_time_idx on public.error_log (occurred_at desc);
alter table public.error_log enable row level security;
revoke all on public.error_log from anon, authenticated;
grant select on public.error_log to authenticated;
drop policy if exists error_log_select on public.error_log;
create policy error_log_select on public.error_log for select to authenticated using (private.is_admin());

-- -----------------------------------------------------------------------------
-- U1 · Días de uso por persona (adopción; alimenta la North Star en dirección)
-- -----------------------------------------------------------------------------
create table if not exists public.usage_days (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  day date not null default ((now() at time zone 'America/Bogota')::date),
  area text not null default 'app' check (area in ('app', 'programas', 'pilotos', 'direccion')),
  primary key (user_id, day, area)
);
alter table public.usage_days enable row level security;
revoke all on public.usage_days from anon;
grant select, insert on public.usage_days to authenticated;
drop policy if exists usage_days_insert on public.usage_days;
create policy usage_days_insert on public.usage_days for insert to authenticated with check (user_id = auth.uid());
drop policy if exists usage_days_select on public.usage_days;
create policy usage_days_select on public.usage_days for select to authenticated using (user_id = auth.uid() or private.is_admin());

-- -----------------------------------------------------------------------------
-- S8 · La Tía: reserva atómica del cupo diario antes de llamar a Claude
-- -----------------------------------------------------------------------------
drop policy if exists tia_usage_update on public.tia_usage;
create policy tia_usage_update on public.tia_usage for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (input_tokens, output_tokens, model) on public.tia_usage to authenticated;

create or replace function public.tia_reserve(p_program uuid, p_feature text, p_limit integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
  rid uuid;
  day_start timestamptz := ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
begin
  if uid is null then
    raise exception 'Inicie sesión para usar La Tía.';
  end if;
  if p_program is not null and not private.is_member(p_program) then
    raise exception 'No tiene acceso a ese programa.';
  end if;
  -- Un candado por persona: dos pestañas no se saltan el tope.
  perform pg_advisory_xact_lock(hashtext('tia:' || uid::text));
  select count(*) into used from public.tia_usage where user_id = uid and created_at >= day_start;
  if used >= greatest(p_limit, 0) then
    return null;
  end if;
  insert into public.tia_usage (user_id, program_id, feature, model)
  values (uid, p_program, p_feature, 'reservado')
  returning id into rid;
  return rid;
end;
$$;
revoke execute on function public.tia_reserve(uuid, text, integer) from public, anon;
grant execute on function public.tia_reserve(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- S5 · Pilotos: el creador edita lo suyo (lo que creó o del que es responsable)
-- -----------------------------------------------------------------------------
create or replace function private.pilot_can_edit(p_pilot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.pilot_is_approver() or (
    private.pilot_can_write() and exists (
      select 1 from public.pilots p
      where p.id = p_pilot and (p.created_by = auth.uid() or p.owner_id = auth.uid())
    )
  );
$$;

drop policy if exists pilots_update on public.pilots;
create policy pilots_update on public.pilots for update to authenticated
  using (deleted_at is null and private.pilot_can_edit(id))
  with check (deleted_at is null and private.pilot_can_write());

do $$
declare
  t text;
begin
  foreach t in array array['pilot_media', 'pilot_arms', 'pilot_guardrails', 'pilot_checklist_items', 'pilot_measurements'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (private.pilot_can_edit(pilot_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (private.pilot_can_edit(pilot_id)) with check (private.pilot_can_edit(pilot_id))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (private.pilot_can_edit(pilot_id))', t);
  end loop;
end;
$$;
drop policy if exists pilot_incidents_insert on public.pilot_incidents;
create policy pilot_incidents_insert on public.pilot_incidents for insert to authenticated with check (private.pilot_can_edit(pilot_id));

-- -----------------------------------------------------------------------------
-- B1 · Diseño del piloto en una sola transacción, con bloqueo optimista
-- (SECURITY INVOKER: RLS y guardas aplican igual que en las escrituras sueltas)
-- -----------------------------------------------------------------------------
create or replace function public.save_pilot_design(
  p_pilot uuid,
  p_expected_updated_at timestamptz,
  p_fields jsonb,
  p_arms jsonb,
  p_media jsonb
)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  current_updated timestamptz;
  a jsonb;
  m jsonb;
  keep_arms uuid[] := '{}';
  keep_media uuid[] := '{}';
  i integer := 0;
  new_updated timestamptz;
begin
  select updated_at into current_updated from public.pilots where id = p_pilot and deleted_at is null for update;
  if current_updated is null then
    raise exception 'El piloto no existe o no tiene acceso.';
  end if;
  if p_expected_updated_at is not null and current_updated > p_expected_updated_at + interval '1 millisecond' then
    raise exception 'Otra persona cambió este piloto mientras usted lo editaba. Recargue la página para ver lo último.';
  end if;

  update public.pilots set
    variable_id = nullif(p_fields ->> 'variable_id', '')::uuid,
    test_type = nullif(p_fields ->> 'test_type', '')::public.pilot_test_type,
    design_justification = nullif(p_fields ->> 'design_justification', ''),
    design_config = coalesce(p_fields -> 'design_config', '{}'::jsonb),
    planned_start = nullif(p_fields ->> 'planned_start', '')::date,
    planned_end = nullif(p_fields ->> 'planned_end', '')::date,
    planned_budget_cop = nullif(p_fields ->> 'planned_budget_cop', '')::numeric
  where id = p_pilot;

  for a in select * from jsonb_array_elements(coalesce(p_arms, '[]'::jsonb)) loop
    if nullif(a ->> 'id', '') is not null then keep_arms := keep_arms || (a ->> 'id')::uuid; end if;
  end loop;
  delete from public.pilot_arms where pilot_id = p_pilot and not (id = any (keep_arms));
  update public.pilot_arms set is_control = false where pilot_id = p_pilot and is_control;
  for a in select * from jsonb_array_elements(coalesce(p_arms, '[]'::jsonb)) loop
    if nullif(a ->> 'id', '') is not null then
      update public.pilot_arms set
        name = a ->> 'name',
        is_control = coalesce((a ->> 'is_control')::boolean, false),
        split_pct = nullif(a ->> 'split_pct', '')::numeric,
        cities = coalesce(array(select jsonb_array_elements_text(a -> 'cities')), '{}'),
        description = nullif(a ->> 'description', ''),
        sort_order = i
      where id = (a ->> 'id')::uuid and pilot_id = p_pilot;
    else
      insert into public.pilot_arms (pilot_id, name, is_control, split_pct, cities, description, sort_order)
      values (
        p_pilot, a ->> 'name', coalesce((a ->> 'is_control')::boolean, false), nullif(a ->> 'split_pct', '')::numeric,
        coalesce(array(select jsonb_array_elements_text(a -> 'cities')), '{}'), nullif(a ->> 'description', ''), i
      );
    end if;
    i := i + 1;
  end loop;

  i := 0;
  for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    if nullif(m ->> 'id', '') is not null then keep_media := keep_media || (m ->> 'id')::uuid; end if;
  end loop;
  delete from public.pilot_media where pilot_id = p_pilot and not (id = any (keep_media));
  for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    if nullif(m ->> 'id', '') is not null then
      update public.pilot_media set
        media_id = (m ->> 'media_id')::uuid,
        account = nullif(m ->> 'account', ''),
        campaign = nullif(m ->> 'campaign', ''),
        audience = nullif(m ->> 'audience', ''),
        destination = nullif(m ->> 'destination', ''),
        cities = coalesce(array(select jsonb_array_elements_text(m -> 'cities')), '{}'),
        sort_order = i
      where id = (m ->> 'id')::uuid and pilot_id = p_pilot;
    else
      insert into public.pilot_media (pilot_id, media_id, account, campaign, audience, destination, cities, sort_order)
      values (
        p_pilot, (m ->> 'media_id')::uuid, nullif(m ->> 'account', ''), nullif(m ->> 'campaign', ''), nullif(m ->> 'audience', ''),
        nullif(m ->> 'destination', ''), coalesce(array(select jsonb_array_elements_text(m -> 'cities')), '{}'), i
      );
    end if;
    i := i + 1;
  end loop;

  select updated_at into new_updated from public.pilots where id = p_pilot;
  return new_updated;
end;
$$;
revoke execute on function public.save_pilot_design(uuid, timestamptz, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_pilot_design(uuid, timestamptz, jsonb, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- G1 · Hechos diarios de campañas (los escribe el servidor desde la integración)
-- -----------------------------------------------------------------------------
create table if not exists public.ad_facts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.pilot_integration_connections (id) on delete set null,
  source text not null,
  account_ref text not null default '',
  day date not null,
  campaign_name text not null,
  adset_name text not null default '',
  ad_name text not null default '',
  spend numeric not null default 0 check (spend >= 0),
  impressions numeric not null default 0 check (impressions >= 0),
  clicks numeric not null default 0 check (clicks >= 0),
  conversations numeric not null default 0 check (conversations >= 0),
  landing_views numeric not null default 0 check (landing_views >= 0),
  snapshot_id uuid references public.pilot_snapshots (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, account_ref, day, campaign_name, adset_name, ad_name)
);
create index if not exists ad_facts_day_idx on public.ad_facts (day desc);
drop trigger if exists set_updated_at on public.ad_facts;
create trigger set_updated_at before update on public.ad_facts for each row execute function private.set_updated_at();
alter table public.ad_facts enable row level security;
revoke all on public.ad_facts from anon, authenticated;
grant select on public.ad_facts to authenticated;
drop policy if exists ad_facts_select on public.ad_facts;
create policy ad_facts_select on public.ad_facts for select to authenticated using (private.pilot_can_read());

-- -----------------------------------------------------------------------------
-- G2 · Ventas del negocio (CRM/BSS) para conciliar con lo que dice la plataforma
-- -----------------------------------------------------------------------------
create table if not exists public.business_conversions (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  channel text not null check (length(trim(channel)) between 1 and 80),
  campaign_name text not null default '',
  -- Clave opcional para cruzar uno a uno (ctwa_clid o teléfono con hash). Nunca el teléfono en claro.
  match_key text not null default '',
  sales numeric not null default 0 check (sales >= 0),
  revenue_cop numeric check (revenue_cop is null or revenue_cop >= 0),
  source text not null default 'csv' check (source in ('csv', 'manual', 'crm')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (day, channel, campaign_name, match_key)
);
create index if not exists business_conversions_day_idx on public.business_conversions (day desc);
alter table public.business_conversions enable row level security;
revoke all on public.business_conversions from anon;
grant select, insert, update, delete on public.business_conversions to authenticated;
drop policy if exists bconv_select on public.business_conversions;
create policy bconv_select on public.business_conversions for select to authenticated using (private.pilot_can_read());
drop policy if exists bconv_insert on public.business_conversions;
create policy bconv_insert on public.business_conversions for insert to authenticated with check (private.pilot_can_write());
drop policy if exists bconv_update on public.business_conversions;
create policy bconv_update on public.business_conversions for update to authenticated
  using (private.pilot_can_write()) with check (private.pilot_can_write());
drop policy if exists bconv_delete on public.business_conversions;
create policy bconv_delete on public.business_conversions for delete to authenticated using (private.pilot_is_approver());

-- -----------------------------------------------------------------------------
-- G1 · Guarda de datos: solo es "ajustado a mano" lo que corrige una persona.
-- -----------------------------------------------------------------------------
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
    -- La integración reescribe sus propios datos sin marcarlos como ajustados.
    if old.source = 'mcp' and new.value is distinct from old.value and not (private.is_service() and new.source = 'mcp') then
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

-- G1 · Al borrar una conexión se borra también su secreto de Vault (solo el servidor).
create or replace function public.delete_integration_token(p_connection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  if not private.is_service() then
    raise exception 'Solo el servidor borra tokens de integración.';
  end if;
  select vault_secret_id into secret_id from public.pilot_integration_connections where id = p_connection;
  if secret_id is not null then
    delete from vault.secrets where id = secret_id;
  end if;
  update public.pilot_integration_connections set vault_secret_id = null, status = 'disconnected' where id = p_connection;
end;
$$;
revoke execute on function public.delete_integration_token(uuid) from public, anon, authenticated;
grant execute on function public.delete_integration_token(uuid) to service_role;
