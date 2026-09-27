-- Auditoría V0: hipótesis obligatoria para diseñar, guardado atómico de variantes,
-- valor económico por unidad en las métricas y comentarios en los ejercicios.

-- -----------------------------------------------------------------------------
-- 1. Valor por unidad (para estimar el impacto en pesos de un resultado)
-- -----------------------------------------------------------------------------
alter table public.metrics add column if not exists unit_value numeric;
comment on column public.metrics.unit_value is 'Valor económico estimado de una unidad de la métrica (COP). Opcional.';

-- -----------------------------------------------------------------------------
-- 2. Transición: pasar a En diseño exige la hipótesis completa
-- -----------------------------------------------------------------------------
create or replace function public.transition_experiment(
  p_experiment uuid,
  p_to public.experiment_status,
  p_justification text default null,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.experiments;
  v_role public.program_role;
  v_manage boolean;
  v_edit boolean;
  v_assigned boolean;
  v_missing text[] := '{}';
  v_start date;
  v_freeze public.calendar_events;
  v_allowed public.experiment_status[];
  v_forced boolean := false;
begin
  select * into e from public.experiments where id = p_experiment and deleted_at is null for update;
  if not found then
    perform private.fail('El ejercicio no existe o fue borrado.');
  end if;

  v_role := private.program_role(e.program_id);
  v_manage := private.can_manage(e.program_id);
  v_edit := private.can_edit(e.program_id);
  v_assigned := v_role = 'agency' and e.owner_id = auth.uid();

  if e.status = p_to then
    return;
  end if;

  v_allowed := case e.status
    when 'idea' then array['prioritized', 'discarded']::public.experiment_status[]
    when 'prioritized' then array['in_design', 'idea', 'discarded']::public.experiment_status[]
    when 'in_design' then array['in_test', 'prioritized', 'discarded']::public.experiment_status[]
    when 'in_test' then array['in_reading']::public.experiment_status[]
    when 'in_reading' then array['decided']::public.experiment_status[]
    when 'decided' then array['scaled']::public.experiment_status[]
    else array[]::public.experiment_status[]
  end;

  if not (p_to = any (v_allowed)) then
    perform private.fail(format('No se puede pasar de %s a %s.', private.status_label(e.status), private.status_label(p_to)));
  end if;

  -- Permisos por transición.
  if p_to in ('decided', 'scaled') then
    if not v_manage then
      perform private.fail('Solo el owner o un admin puede decidir un ejercicio.');
    end if;
  elsif p_to in ('in_test', 'in_reading') or (e.status = 'prioritized' and p_to = 'in_design') then
    if not (v_edit or v_assigned) then
      perform private.fail('No tiene permiso para mover este ejercicio.');
    end if;
  else
    if not v_edit then
      perform private.fail('No tiene permiso para priorizar o descartar ejercicios.');
    end if;
  end if;

  -- Requisitos.
  if p_to in ('prioritized', 'in_design') and (e.impact is null or e.confidence is null or e.ease is null) then
    v_missing := array_append(v_missing, 'calificación ICE completa (impacto, confianza y facilidad)');
  end if;

  if p_to = 'in_design' and (
    coalesce(trim(e.hypothesis_if), '') = '' or coalesce(trim(e.hypothesis_then), '') = '' or coalesce(trim(e.hypothesis_because), '') = ''
  ) then
    v_missing := array_append(v_missing, 'hipótesis completa (SI, ENTONCES y PORQUE)');
  end if;

  if p_to = 'in_test' then
    if e.test_type is null then v_missing := array_append(v_missing, 'tipo de prueba'); end if;
    if not exists (select 1 from public.experiment_variants v where v.experiment_id = e.id and v.deleted_at is null and v.is_control) then
      v_missing := array_append(v_missing, 'una variante de control');
    end if;
    if not exists (select 1 from public.experiment_variants v where v.experiment_id = e.id and v.deleted_at is null and not v.is_control) then
      v_missing := array_append(v_missing, 'al menos una variante además del control');
    end if;
    if coalesce(trim(e.primary_metric), '') = '' then v_missing := array_append(v_missing, 'métrica principal'); end if;
    if e.min_duration_days is null then v_missing := array_append(v_missing, 'duración mínima'); end if;
    if coalesce(trim(e.decision_rule), '') = '' then v_missing := array_append(v_missing, 'regla de decisión'); end if;
    if e.owner_id is null then v_missing := array_append(v_missing, 'responsable'); end if;
    v_start := coalesce(e.actual_start, e.planned_start);
    if v_start is null then v_missing := array_append(v_missing, 'fecha de inicio'); end if;
  end if;

  if p_to = 'decided' then
    if exists (
      select 1 from public.experiment_variants v
      where v.experiment_id = e.id and v.deleted_at is null
        and (v.sample is null or (v.conversions is null and v.metric_value is null))
    ) or not exists (
      select 1 from public.experiment_variants v where v.experiment_id = e.id and v.deleted_at is null
    ) then
      v_missing := array_append(v_missing, 'resultados cargados en todas las variantes');
    end if;
    if e.verdict is null then v_missing := array_append(v_missing, 'veredicto'); end if;
    if e.decision is null then v_missing := array_append(v_missing, 'decisión'); end if;
    if not exists (select 1 from public.learnings l where l.experiment_id = e.id and l.deleted_at is null) then
      v_missing := array_append(v_missing, 'aprendizaje');
    end if;
  end if;

  if p_to = 'scaled' and e.decision is distinct from 'scale' then
    v_missing := array_append(v_missing, 'decisión "escalar"');
  end if;

  if array_length(v_missing, 1) > 0 then
    perform private.fail('Para pasar a ' || private.status_label(p_to) || ' falta: ' || array_to_string(v_missing, ', ') || '.');
  end if;

  -- Congelamiento en la fecha de inicio.
  if p_to = 'in_test' then
    v_freeze := private.freeze_containing(e.program_id, v_start);
    if v_freeze.id is not null then
      if not p_force then
        perform private.fail(format(
          'La fecha de inicio (%s) cae dentro del congelamiento "%s" (%s a %s).',
          to_char(v_start, 'DD/MM/YYYY'), v_freeze.name,
          to_char(v_freeze.start_date, 'DD/MM/YYYY'), to_char(v_freeze.end_date, 'DD/MM/YYYY')
        ));
      end if;
      if not v_manage then
        perform private.fail('Solo el owner o un admin puede forzar un inicio dentro de un congelamiento.');
      end if;
      if coalesce(trim(p_justification), '') = '' then
        perform private.fail('Para forzar el inicio dentro de un congelamiento escriba una justificación.');
      end if;
      v_forced := true;
    end if;
  end if;

  perform private.bypass_guard();

  update public.experiments
     set status = p_to,
         status_changed_at = now(),
         design_locked_at = case when p_to = 'in_test' then now() else design_locked_at end,
         decided_at = case when p_to = 'decided' then now() else decided_at end,
         actual_start = case when p_to = 'in_test' then coalesce(actual_start, planned_start) else actual_start end,
         actual_end = case when p_to = 'in_reading' then coalesce(actual_end, greatest(current_date, actual_start)) else actual_end end
   where id = e.id;

  perform private.log_activity(
    e.program_id, 'status_changed', 'experiment', e.id,
    format('Movió "%s" de %s a %s', e.title, private.status_label(e.status), private.status_label(p_to)),
    jsonb_build_object('from', e.status, 'to', p_to)
  );

  if v_forced then
    perform private.log_activity(
      e.program_id, 'freeze_forced', 'experiment', e.id,
      format('Forzó el inicio de "%s" dentro del congelamiento "%s"', e.title, v_freeze.name),
      jsonb_build_object('freeze_id', v_freeze.id, 'justification', p_justification)
    );
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Guardado atómico de variantes (todo o nada). Corre con los permisos de quien
--    la llama: RLS y las guardas del diseño bloqueado siguen aplicando.
-- -----------------------------------------------------------------------------
create or replace function public.save_experiment_variants(p_experiment uuid, p_variants jsonb)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
  v_keep uuid[];
  v jsonb;
  v_id uuid;
  v_i int := 0;
  r record;
begin
  if jsonb_typeof(p_variants) is distinct from 'array' then
    perform private.fail('Las variantes deben venir como una lista.');
  end if;

  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_keep
  from jsonb_array_elements(p_variants) x
  where coalesce(x ->> 'id', '') <> '';

  -- Las que ya no están se borran con la acción de siempre.
  for r in
    select ev.id from public.experiment_variants ev
    where ev.experiment_id = p_experiment and ev.deleted_at is null and not (ev.id = any (v_keep))
  loop
    perform public.delete_variant(r.id);
  end loop;

  -- Primero se quita la marca de control a las que la pierden (índice único parcial).
  update public.experiment_variants ev set is_control = false
  where ev.experiment_id = p_experiment
    and ev.id = any (v_keep)
    and ev.is_control
    and exists (
      select 1 from jsonb_array_elements(p_variants) x
      where coalesce(x ->> 'id', '') <> ''
        and (x ->> 'id')::uuid = ev.id
        and not coalesce((x ->> 'is_control')::boolean, false)
    );

  for v in select value from jsonb_array_elements(p_variants) loop
    v_id := null;
    if coalesce(v ->> 'id', '') <> '' then
      update public.experiment_variants
      set name = v ->> 'name',
          is_control = coalesce((v ->> 'is_control')::boolean, false),
          description = nullif(v ->> 'description', ''),
          sort_order = v_i
      where id = (v ->> 'id')::uuid and experiment_id = p_experiment
      returning id into v_id;
      if v_id is null then
        perform private.fail('Una de las variantes no existe o ya fue borrada.');
      end if;
    else
      insert into public.experiment_variants (experiment_id, name, is_control, description, sort_order)
      values (p_experiment, v ->> 'name', coalesce((v ->> 'is_control')::boolean, false), nullif(v ->> 'description', ''), v_i)
      returning id into v_id;
    end if;
    v_ids := array_append(v_ids, v_id);
    v_i := v_i + 1;
  end loop;

  return v_ids;
end;
$$;

revoke all on function public.save_experiment_variants(uuid, jsonb) from public, anon;
grant execute on function public.save_experiment_variants(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Comentarios en los ejercicios
-- -----------------------------------------------------------------------------
create table if not exists public.experiment_comments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experiment_comments_experiment_idx on public.experiment_comments (experiment_id, created_at);

create or replace function private.experiment_comments_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select e.program_id into v_program from public.experiments e where e.id = new.experiment_id and e.deleted_at is null;
  if v_program is null then
    raise exception 'El ejercicio no existe o fue borrado.';
  end if;
  new.program_id := v_program;
  if tg_op = 'INSERT' and not private.is_service() then
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' then
    if new.experiment_id is distinct from old.experiment_id or new.created_by is distinct from old.created_by then
      raise exception 'Un comentario no puede cambiar de ejercicio ni de autor.';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists a_experiment_comments_coherence on public.experiment_comments;
create trigger a_experiment_comments_coherence
  before insert or update on public.experiment_comments
  for each row execute function private.experiment_comments_coherence();

alter table public.experiment_comments enable row level security;
revoke all on public.experiment_comments from anon;
grant select, insert, update, delete on public.experiment_comments to authenticated;

-- Ver: cualquier miembro del programa. Escribir: quien puede editar el ejercicio
-- (incluida la agencia asignada). Editar: solo el autor. Borrar: el autor o un admin.
drop policy if exists experiment_comments_select on public.experiment_comments;
create policy experiment_comments_select on public.experiment_comments for select to authenticated
  using (private.is_member(program_id));

drop policy if exists experiment_comments_insert on public.experiment_comments;
create policy experiment_comments_insert on public.experiment_comments for insert to authenticated
  with check (private.can_edit_experiment(experiment_id));

drop policy if exists experiment_comments_update on public.experiment_comments;
create policy experiment_comments_update on public.experiment_comments for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists experiment_comments_delete on public.experiment_comments;
create policy experiment_comments_delete on public.experiment_comments for delete to authenticated
  using (created_by = auth.uid() or private.is_admin());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'experiment_comments'
     ) then
    alter publication supabase_realtime add table public.experiment_comments;
  end if;
end;
$$;
