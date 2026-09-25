-- =============================================================================
-- RPC: operaciones atómicas que validan permisos y reglas en la base
-- Todas son SECURITY DEFINER: revalidan el rol del usuario antes de actuar y
-- activan private.bypass_guard() solo después de validar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function private.fail(p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_message, errcode = 'P0001';
end;
$$;

create or replace function private.status_label(p_status public.experiment_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'idea' then 'Idea'
    when 'prioritized' then 'Priorizado'
    when 'in_design' then 'En diseño'
    when 'in_test' then 'En prueba'
    when 'in_reading' then 'En lectura'
    when 'decided' then 'Decidido'
    when 'scaled' then 'Escalado a BAU'
    when 'discarded' then 'Descartado'
  end;
$$;

-- Congelamiento que contiene una fecha (regla 5).
create or replace function private.freeze_containing(p_program uuid, p_date date)
returns public.calendar_events
language sql
stable
security definer
set search_path = ''
as $$
  select ce.* from public.calendar_events ce
  where ce.program_id = p_program
    and ce.type = 'freeze'
    and ce.deleted_at is null
    and p_date between ce.start_date and ce.end_date
  order by ce.start_date
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Ciclo de vida (regla 3), bloqueo (regla 4) y congelamientos (regla 5)
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
      perform private.fail('No tienes permiso para mover este ejercicio.');
    end if;
  else
    if not v_edit then
      perform private.fail('No tienes permiso para priorizar o descartar ejercicios.');
    end if;
  end if;

  -- Requisitos.
  if p_to in ('prioritized', 'in_design') and (e.impact is null or e.confidence is null or e.ease is null) then
    v_missing := array_append(v_missing, 'calificación ICE completa (impacto, confianza y facilidad)');
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
        perform private.fail('Para forzar el inicio dentro de un congelamiento escribe una justificación.');
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

-- Veredicto + decisión + aprendizaje obligatorio + paso a Decidido, en una sola
-- transacción (regla 3).
create or replace function public.decide_experiment(
  p_experiment uuid,
  p_verdict public.verdict,
  p_decision public.decision,
  p_rationale text,
  p_learning text,
  p_applies_to uuid[] default '{}',
  p_suggested_hypothesis text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.experiments;
begin
  select * into e from public.experiments where id = p_experiment and deleted_at is null for update;
  if not found then
    perform private.fail('El ejercicio no existe o fue borrado.');
  end if;
  if not private.can_manage(e.program_id) then
    perform private.fail('Solo el owner o un admin emite el veredicto y la decisión.');
  end if;
  if e.status <> 'in_reading' then
    perform private.fail('Solo se decide un ejercicio que está En lectura.');
  end if;
  if p_verdict is null or p_decision is null then
    perform private.fail('El veredicto y la decisión son obligatorios.');
  end if;
  if coalesce(trim(p_learning), '') = '' then
    perform private.fail('Al decidir un ejercicio es obligatorio registrar un aprendizaje.');
  end if;

  perform private.bypass_guard();

  update public.experiments
     set verdict = p_verdict,
         decision = p_decision,
         decision_rationale = nullif(trim(coalesce(p_rationale, '')), '')
   where id = e.id;

  insert into public.learnings (program_id, experiment_id, text, applies_to_line_ids, suggested_hypothesis, created_by)
  values (e.program_id, e.id, trim(p_learning), coalesce(p_applies_to, '{}'), nullif(trim(coalesce(p_suggested_hypothesis, '')), ''), auth.uid())
  on conflict (experiment_id) where deleted_at is null
  do update set text = excluded.text,
                applies_to_line_ids = excluded.applies_to_line_ids,
                suggested_hypothesis = excluded.suggested_hypothesis;

  perform private.log_activity(
    e.program_id, 'verdict', 'experiment', e.id,
    format('Veredicto de "%s": %s; decisión: %s', e.title, p_verdict, p_decision),
    jsonb_build_object('verdict', p_verdict, 'decision', p_decision, 'rationale', p_rationale)
  );

  perform public.transition_experiment(e.id, 'decided');
end;
$$;

create or replace function public.unlock_design(p_experiment uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.experiments;
begin
  select * into e from public.experiments where id = p_experiment and deleted_at is null for update;
  if not found then
    perform private.fail('El ejercicio no existe o fue borrado.');
  end if;
  if not private.can_manage(e.program_id) then
    perform private.fail('Solo el owner o un admin puede desbloquear el diseño.');
  end if;
  if e.design_locked_at is null then
    return;
  end if;
  if coalesce(trim(p_justification), '') = '' then
    perform private.fail('Para desbloquear el diseño escribe una justificación.');
  end if;
  perform private.bypass_guard();
  update public.experiments set design_locked_at = null where id = e.id;
  perform private.log_activity(
    e.program_id, 'design_unlocked', 'experiment', e.id,
    format('Desbloqueó el diseño de "%s"', e.title),
    jsonb_build_object('justification', p_justification)
  );
end;
$$;

create or replace function public.lock_design(p_experiment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.experiments;
begin
  select * into e from public.experiments where id = p_experiment and deleted_at is null for update;
  if not found then
    perform private.fail('El ejercicio no existe o fue borrado.');
  end if;
  if not private.can_edit_experiment(e.id) then
    perform private.fail('No tienes permiso para bloquear este diseño.');
  end if;
  if e.design_locked_at is not null or e.status not in ('in_test', 'in_reading') then
    return;
  end if;
  perform private.bypass_guard();
  update public.experiments set design_locked_at = now() where id = e.id;
  perform private.log_activity(e.program_id, 'design_locked', 'experiment', e.id,
    format('Volvió a bloquear el diseño de "%s"', e.title));
end;
$$;

-- -----------------------------------------------------------------------------
-- Borrado lógico (regla 8)
-- Cada borrado genera un lote (deletion_batch). Todo lo que se borra en cascada
-- comparte el lote, así la restauración devuelve exactamente lo mismo.
-- -----------------------------------------------------------------------------
create or replace function private.mark_experiment(p_id uuid, p_batch uuid, p_ts timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.experiment_variants set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where experiment_id = p_id and deleted_at is null;
  update public.learnings set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where experiment_id = p_id and deleted_at is null;
  update public.attachments set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where experiment_id = p_id and deleted_at is null;
  update public.experiments set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.mark_problem(p_id uuid, p_batch uuid, p_ts timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.experiments where problem_id = p_id and deleted_at is null loop
    perform private.mark_experiment(r.id, p_batch, p_ts);
  end loop;
  update public.attachments set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where problem_id = p_id and deleted_at is null;
  update public.problems set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.metric_subtree(p_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive tree as (
    select m.id from public.metrics m where m.id = p_id
    union all
    select m.id from public.metrics m join tree t on m.parent_id = t.id where m.deleted_at is null
  )
  select coalesce(array_agg(id), '{}') from tree;
$$;

create or replace function private.mark_metric(p_id uuid, p_batch uuid, p_ts timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := private.metric_subtree(p_id);
  r record;
begin
  for r in select id from public.experiments where metric_id = any (v_ids) and deleted_at is null loop
    perform private.mark_experiment(r.id, p_batch, p_ts);
  end loop;
  update public.metric_values set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where metric_id = any (v_ids) and deleted_at is null;
  update public.metrics set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where id = any (v_ids) and deleted_at is null;
end;
$$;

create or replace function private.mark_stage(p_id uuid, p_batch uuid, p_ts timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.problems where stage_id = p_id and deleted_at is null loop
    perform private.mark_problem(r.id, p_batch, p_ts);
  end loop;
  update public.funnel_stages set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.mark_line(p_id uuid, p_batch uuid, p_ts timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.funnel_stages where line_id = p_id and deleted_at is null loop
    perform private.mark_stage(r.id, p_batch, p_ts);
  end loop;
  for r in select id from public.experiments where line_id = p_id and deleted_at is null loop
    perform private.mark_experiment(r.id, p_batch, p_ts);
  end loop;
  update public.metric_values set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where deleted_at is null and metric_id in (select id from public.metrics where line_id = p_id);
  update public.metrics set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where line_id = p_id and deleted_at is null;
  update public.business_lines set deleted_at = p_ts, deleted_by = auth.uid(), deletion_batch = p_batch
   where id = p_id and deleted_at is null;
end;
$$;

create or replace function private.add_trash(
  p_program uuid, p_type text, p_id uuid, p_label text, p_batch uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trash_items (program_id, entity_type, entity_id, label, batch_id, details, deleted_by)
  values (p_program, p_type, p_id, p_label, p_batch, coalesce(p_details, '{}'::jsonb), auth.uid());
$$;

-- Qué más se verá afectado por un borrado (para el diálogo de confirmación).
create or replace function public.deletion_impact(p_entity_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_ids uuid[];
  v_result jsonb;
begin
  case p_entity_type
    when 'experiment' then
      select program_id into v_program from public.experiments where id = p_id and deleted_at is null;
      select jsonb_build_object(
        'variants', (select count(*) from public.experiment_variants where experiment_id = p_id and deleted_at is null),
        'attachments', (select count(*) from public.attachments where experiment_id = p_id and deleted_at is null),
        'learnings', (select count(*) from public.learnings where experiment_id = p_id and deleted_at is null)
      ) into v_result;
    when 'problem' then
      select program_id into v_program from public.problems where id = p_id and deleted_at is null;
      select jsonb_build_object(
        'experiments', (select count(*) from public.experiments where problem_id = p_id and deleted_at is null),
        'attachments', (select count(*) from public.attachments a where a.deleted_at is null and (a.problem_id = p_id
          or a.experiment_id in (select id from public.experiments where problem_id = p_id and deleted_at is null)))
      ) into v_result;
    when 'metric' then
      select program_id into v_program from public.metrics where id = p_id and deleted_at is null;
      v_ids := private.metric_subtree(p_id);
      select jsonb_build_object(
        'child_metrics', greatest(cardinality(v_ids) - 1, 0),
        'metric_values', (select count(*) from public.metric_values where metric_id = any (v_ids) and deleted_at is null),
        'experiments', (select count(*) from public.experiments where metric_id = any (v_ids) and deleted_at is null)
      ) into v_result;
    when 'stage' then
      select program_id into v_program from public.funnel_stages where id = p_id and deleted_at is null;
      select jsonb_build_object(
        'problems', (select count(*) from public.problems where stage_id = p_id and deleted_at is null),
        'experiments', (select count(*) from public.experiments where deleted_at is null
          and problem_id in (select id from public.problems where stage_id = p_id and deleted_at is null))
      ) into v_result;
    when 'line' then
      select program_id into v_program from public.business_lines where id = p_id and deleted_at is null;
      select jsonb_build_object(
        'metrics', (select count(*) from public.metrics where line_id = p_id and deleted_at is null),
        'metric_values', (select count(*) from public.metric_values mv join public.metrics m on m.id = mv.metric_id
          where m.line_id = p_id and mv.deleted_at is null),
        'stages', (select count(*) from public.funnel_stages where line_id = p_id and deleted_at is null),
        'problems', (select count(*) from public.problems where line_id = p_id and deleted_at is null),
        'experiments', (select count(*) from public.experiments where line_id = p_id and deleted_at is null),
        'variants', (select count(*) from public.experiment_variants v join public.experiments e on e.id = v.experiment_id
          where e.line_id = p_id and v.deleted_at is null),
        'attachments', (select count(*) from public.attachments a where a.deleted_at is null and (
          a.problem_id in (select id from public.problems where line_id = p_id)
          or a.experiment_id in (select id from public.experiments where line_id = p_id))),
        'learnings', (select count(*) from public.learnings l join public.experiments e on e.id = l.experiment_id
          where e.line_id = p_id and l.deleted_at is null)
      ) into v_result;
    when 'program' then
      v_program := p_id;
      select jsonb_build_object(
        'lines', (select count(*) from public.business_lines where program_id = p_id and deleted_at is null),
        'metrics', (select count(*) from public.metrics where program_id = p_id and deleted_at is null),
        'problems', (select count(*) from public.problems where program_id = p_id and deleted_at is null),
        'experiments', (select count(*) from public.experiments where program_id = p_id and deleted_at is null),
        'attachments', (select count(*) from public.attachments where program_id = p_id and deleted_at is null),
        'learnings', (select count(*) from public.learnings where program_id = p_id and deleted_at is null)
      ) into v_result;
    else
      perform private.fail('Tipo de elemento desconocido.');
  end case;

  if v_program is null or not private.is_member(v_program) then
    perform private.fail('El elemento no existe o no tienes acceso.');
  end if;
  return v_result;
end;
$$;

create or replace function public.delete_experiment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.experiments;
  v_role public.program_role;
  v_batch uuid := gen_random_uuid();
begin
  select * into e from public.experiments where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('El ejercicio no existe o ya fue borrado.');
  end if;
  v_role := private.program_role(e.program_id);
  if not (
    private.can_manage(e.program_id)
    or (
      e.status in ('idea', 'prioritized', 'in_design', 'discarded')
      and v_role in ('collaborator', 'agency')
      and e.created_by = auth.uid()
    )
  ) then
    if e.status in ('idea', 'prioritized', 'in_design', 'discarded') then
      perform private.fail('Solo puedes borrar los ejercicios que creaste.');
    else
      perform private.fail('Un ejercicio En prueba o posterior solo lo borra el owner o un admin.');
    end if;
  end if;
  perform private.bypass_guard();
  perform private.mark_experiment(e.id, v_batch, now());
  perform private.add_trash(e.program_id, 'experiment', e.id, e.title, v_batch,
    jsonb_build_object('status', e.status));
  perform private.log_activity(e.program_id, 'deleted', 'experiment', e.id, format('Borró el ejercicio "%s"', e.title));
end;
$$;

create or replace function public.delete_problem(p_id uuid, p_strategy text default null, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.problems;
  v_count int;
  v_batch uuid := gen_random_uuid();
begin
  select * into p from public.problems where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('El problema no existe o ya fue borrado.');
  end if;
  if not private.can_manage(p.program_id) then
    perform private.fail('Solo el owner o un admin puede borrar problemas.');
  end if;
  select count(*) into v_count from public.experiments where problem_id = p.id and deleted_at is null;

  perform private.bypass_guard();

  if v_count > 0 then
    if p_strategy = 'reassign' then
      if p_target is null or p_target = p.id or not exists (
        select 1 from public.problems t where t.id = p_target and t.line_id = p.line_id and t.deleted_at is null
      ) then
        perform private.fail('Elige otro problema de la misma línea para reasignar los ejercicios.');
      end if;
      update public.experiments set problem_id = p_target where problem_id = p.id and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('El problema tiene %s ejercicio(s) vinculados: elige reasignarlos o borrarlos junto con él.', v_count));
    end if;
  end if;

  perform private.mark_problem(p.id, v_batch, now());
  perform private.add_trash(p.program_id, 'problem', p.id, p.title, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'experiments', v_count));
  perform private.log_activity(p.program_id, 'deleted', 'problem', p.id, format('Borró el problema "%s"', p.title),
    jsonb_build_object('strategy', p_strategy, 'target', p_target));
end;
$$;

create or replace function public.delete_metric(p_id uuid, p_strategy text default null, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.metrics;
  v_ids uuid[];
  v_count int;
  v_batch uuid := gen_random_uuid();
begin
  select * into m from public.metrics where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('La métrica no existe o ya fue borrada.');
  end if;
  if not private.can_manage(m.program_id) then
    perform private.fail('Solo el owner o un admin puede borrar métricas.');
  end if;
  v_ids := private.metric_subtree(m.id);
  select count(*) into v_count from public.experiments where metric_id = any (v_ids) and deleted_at is null;

  perform private.bypass_guard();

  if v_count > 0 then
    if p_strategy = 'reassign' then
      if p_target is null or p_target = any (v_ids) or not exists (
        select 1 from public.metrics t where t.id = p_target and t.line_id = m.line_id and t.deleted_at is null
      ) then
        perform private.fail('Elige otra métrica de la misma línea (fuera de esta rama) para reasignar los ejercicios.');
      end if;
      update public.experiments set metric_id = p_target where metric_id = any (v_ids) and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('La métrica tiene %s ejercicio(s) vinculados: elige reasignarlos o borrarlos junto con ella.', v_count));
    end if;
  end if;

  perform private.mark_metric(m.id, v_batch, now());
  perform private.add_trash(m.program_id, 'metric', m.id, m.name, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'experiments', v_count));
  perform private.log_activity(m.program_id, 'deleted', 'metric', m.id, format('Borró la métrica "%s"', m.name),
    jsonb_build_object('strategy', p_strategy, 'target', p_target));
end;
$$;

create or replace function public.delete_stage(p_id uuid, p_strategy text default null, p_target uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.funnel_stages;
  v_count int;
  v_batch uuid := gen_random_uuid();
begin
  select * into s from public.funnel_stages where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('La etapa no existe o ya fue borrada.');
  end if;
  if not private.can_manage(s.program_id) then
    perform private.fail('Solo el owner o un admin puede borrar etapas.');
  end if;
  select count(*) into v_count from public.problems where stage_id = s.id and deleted_at is null;

  perform private.bypass_guard();

  if v_count > 0 then
    if p_strategy = 'reassign' then
      if p_target is null or p_target = s.id or not exists (
        select 1 from public.funnel_stages t where t.id = p_target and t.line_id = s.line_id and t.deleted_at is null
      ) then
        perform private.fail('Elige otra etapa de la misma línea para reasignar los problemas.');
      end if;
      update public.problems set stage_id = p_target where stage_id = s.id and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('La etapa tiene %s problema(s): elige reasignarlos o borrarlos junto con ella.', v_count));
    end if;
  end if;

  perform private.mark_stage(s.id, v_batch, now());
  perform private.add_trash(s.program_id, 'stage', s.id, s.name, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'problems', v_count));
  perform private.log_activity(s.program_id, 'deleted', 'stage', s.id, format('Borró la etapa "%s"', s.name));
end;
$$;

create or replace function public.delete_line(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.business_lines;
  v_batch uuid := gen_random_uuid();
begin
  select * into l from public.business_lines where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('La línea no existe o ya fue borrada.');
  end if;
  if not private.can_manage(l.program_id) then
    perform private.fail('Solo el owner o un admin puede borrar líneas.');
  end if;
  perform private.bypass_guard();
  perform private.mark_line(l.id, v_batch, now());
  perform private.add_trash(l.program_id, 'line', l.id, l.name, v_batch);
  perform private.log_activity(l.program_id, 'deleted', 'line', l.id, format('Borró la línea "%s" y todo su contenido', l.name));
end;
$$;

create or replace function public.delete_program(p_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.programs;
  r record;
  v_batch uuid := gen_random_uuid();
  v_ts timestamptz := now();
begin
  select * into p from public.programs where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('El programa no existe o ya fue borrado.');
  end if;
  if not private.can_manage(p.id) then
    perform private.fail('Solo el owner del programa o un admin puede borrarlo.');
  end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(p.name) then
    perform private.fail('Escribe el nombre exacto del programa para confirmar.');
  end if;
  perform private.bypass_guard();
  for r in select id from public.business_lines where program_id = p.id and deleted_at is null loop
    perform private.mark_line(r.id, v_batch, v_ts);
  end loop;
  update public.calendar_events set deleted_at = v_ts, deleted_by = auth.uid(), deletion_batch = v_batch
   where program_id = p.id and deleted_at is null;
  update public.programs set deleted_at = v_ts, deleted_by = auth.uid(), deletion_batch = v_batch where id = p.id;
  perform private.add_trash(p.id, 'program', p.id, p.name, v_batch);
  perform private.log_activity(p.id, 'deleted', 'program', p.id, format('Borró el programa "%s"', p.name));
end;
$$;

create or replace function public.delete_calendar_event(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.calendar_events;
  v_batch uuid := gen_random_uuid();
begin
  select * into c from public.calendar_events where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('El evento no existe o ya fue borrado.');
  end if;
  if not private.can_edit(c.program_id) then
    perform private.fail('No tienes permiso para editar el calendario.');
  end if;
  perform private.bypass_guard();
  update public.calendar_events set deleted_at = now(), deleted_by = auth.uid(), deletion_batch = v_batch where id = c.id;
  perform private.add_trash(c.program_id, 'calendar_event', c.id, c.name, v_batch, jsonb_build_object('type', c.type));
  perform private.log_activity(c.program_id, 'deleted', 'calendar_event', c.id, format('Borró el evento "%s"', c.name));
end;
$$;

create or replace function public.delete_variant(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.experiment_variants;
  e public.experiments;
  v_batch uuid := gen_random_uuid();
begin
  select * into v from public.experiment_variants where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('La variante no existe o ya fue borrada.');
  end if;
  select * into e from public.experiments where id = v.experiment_id;
  if not private.can_edit_experiment(e.id) then
    perform private.fail('No tienes permiso para editar este ejercicio.');
  end if;
  if e.design_locked_at is not null then
    perform private.fail('El diseño está bloqueado: no se pueden borrar variantes.');
  end if;
  perform private.bypass_guard();
  update public.experiment_variants set deleted_at = now(), deleted_by = auth.uid(), deletion_batch = v_batch where id = v.id;
  perform private.add_trash(v.program_id, 'variant', v.id, format('%s · %s', e.title, v.name), v_batch);
  perform private.log_activity(v.program_id, 'deleted', 'variant', v.id, format('Borró la variante "%s" de "%s"', v.name, e.title));
end;
$$;

create or replace function public.delete_attachment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.attachments;
  v_batch uuid := gen_random_uuid();
begin
  select * into a from public.attachments where id = p_id and deleted_at is null;
  if not found then
    perform private.fail('El adjunto no existe o ya fue borrado.');
  end if;
  if (a.entity_type = 'problem' and not private.can_edit(a.program_id))
     or (a.entity_type = 'experiment' and not private.can_edit_experiment(a.experiment_id)) then
    perform private.fail('No tienes permiso para borrar este adjunto.');
  end if;
  perform private.bypass_guard();
  update public.attachments set deleted_at = now(), deleted_by = auth.uid(), deletion_batch = v_batch where id = a.id;
  perform private.add_trash(a.program_id, 'attachment', a.id, a.name, v_batch);
  perform private.log_activity(a.program_id, 'deleted', 'attachment', a.id, format('Borró el adjunto "%s"', a.name));
end;
$$;

-- -----------------------------------------------------------------------------
-- Papelera: restaurar y eliminar definitivamente
-- -----------------------------------------------------------------------------
create or replace function private.entity_table(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'program' then 'programs'
    when 'line' then 'business_lines'
    when 'metric' then 'metrics'
    when 'stage' then 'funnel_stages'
    when 'problem' then 'problems'
    when 'experiment' then 'experiments'
    when 'variant' then 'experiment_variants'
    when 'attachment' then 'attachments'
    when 'calendar_event' then 'calendar_events'
  end;
$$;

-- Verifica que el padre del elemento a restaurar no esté borrado.
create or replace function private.restore_blocker(p_type text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_msg text;
begin
  case p_type
    when 'experiment' then
      select case
        when p.deleted_at is not null then format('Primero restaura el problema "%s".', p.title)
        when m.deleted_at is not null then format('Primero restaura la métrica "%s".', m.name)
        when l.deleted_at is not null then format('Primero restaura la línea "%s".', l.name)
      end into v_msg
      from public.experiments e
      join public.problems p on p.id = e.problem_id
      join public.metrics m on m.id = e.metric_id
      join public.business_lines l on l.id = e.line_id
      where e.id = p_id;
    when 'problem' then
      select case
        when l.deleted_at is not null then format('Primero restaura la línea "%s".', l.name)
        when s.deleted_at is not null then format('Primero restaura la etapa "%s".', s.name)
      end into v_msg
      from public.problems p
      join public.funnel_stages s on s.id = p.stage_id
      join public.business_lines l on l.id = p.line_id
      where p.id = p_id;
    when 'metric' then
      select case
        when l.deleted_at is not null then format('Primero restaura la línea "%s".', l.name)
        when parent.deleted_at is not null then format('Primero restaura la métrica padre "%s".', parent.name)
      end into v_msg
      from public.metrics m
      join public.business_lines l on l.id = m.line_id
      left join public.metrics parent on parent.id = m.parent_id
      where m.id = p_id;
    when 'stage' then
      select case when l.deleted_at is not null then format('Primero restaura la línea "%s".', l.name) end into v_msg
      from public.funnel_stages s join public.business_lines l on l.id = s.line_id where s.id = p_id;
    when 'variant' then
      select case when e.deleted_at is not null then format('Primero restaura el ejercicio "%s".', e.title) end into v_msg
      from public.experiment_variants v join public.experiments e on e.id = v.experiment_id where v.id = p_id;
    when 'attachment' then
      select case
        when p.deleted_at is not null then format('Primero restaura el problema "%s".', p.title)
        when e.deleted_at is not null then format('Primero restaura el ejercicio "%s".', e.title)
      end into v_msg
      from public.attachments a
      left join public.problems p on p.id = a.problem_id
      left join public.experiments e on e.id = a.experiment_id
      where a.id = p_id;
    else
      v_msg := null;
  end case;
  return v_msg;
end;
$$;

create or replace function public.restore_trash_item(p_trash uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trash_items;
  v_blocker text;
  v_table text;
begin
  select * into t from public.trash_items where id = p_trash;
  if not found then
    perform private.fail('El elemento ya no está en la papelera.');
  end if;
  if not private.can_manage(t.program_id) then
    perform private.fail('Solo el owner o un admin puede restaurar desde la papelera.');
  end if;
  v_blocker := private.restore_blocker(t.entity_type, t.entity_id);
  if v_blocker is not null then
    perform private.fail(v_blocker);
  end if;

  perform private.bypass_guard();
  begin
    foreach v_table in array array[
      'programs', 'calendar_events', 'business_lines', 'metrics', 'metric_values', 'funnel_stages',
      'problems', 'experiments', 'experiment_variants', 'learnings', 'attachments'
    ] loop
      execute format(
        'update public.%I set deleted_at = null, deleted_by = null, deletion_batch = null where deletion_batch = $1',
        v_table
      ) using t.batch_id;
    end loop;
  exception when unique_violation then
    perform private.fail('No se puede restaurar: ya existe un elemento activo equivalente (por ejemplo, otra métrica norte en la línea o otro aprendizaje del ejercicio).');
  end;

  delete from public.trash_items where id = t.id;
  perform private.log_activity(t.program_id, 'restored', t.entity_type, t.entity_id, format('Restauró "%s" desde la papelera', t.label));
end;
$$;

-- Borra de verdad la entidad raíz; las FK en cascada se llevan el resto y el
-- trigger de adjuntos encola los archivos para Storage.
create or replace function private.purge_trash_item_internal(p_trash uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trash_items;
  v_table text;
begin
  select * into t from public.trash_items where id = p_trash;
  if not found then
    return;
  end if;
  v_table := private.entity_table(t.entity_type);
  if v_table is null then
    delete from public.trash_items where id = t.id;
    return;
  end if;

  perform private.bypass_guard();

  execute format('delete from public.%I where id = $1', v_table) using t.entity_id;

  if t.entity_type = 'program' then
    perform private.log_activity(null, 'purged', 'program', t.entity_id, format('Eliminó definitivamente el programa "%s"', t.label));
    return;
  end if;

  delete from public.trash_items where id = t.id;

  -- Elementos que estaban en la papelera y desaparecieron por la cascada.
  delete from public.trash_items ti
   where ti.program_id = t.program_id
     and not exists (
       select 1 from public.programs x where ti.entity_type = 'program' and x.id = ti.entity_id
       union all select 1 from public.business_lines x where ti.entity_type = 'line' and x.id = ti.entity_id
       union all select 1 from public.metrics x where ti.entity_type = 'metric' and x.id = ti.entity_id
       union all select 1 from public.funnel_stages x where ti.entity_type = 'stage' and x.id = ti.entity_id
       union all select 1 from public.problems x where ti.entity_type = 'problem' and x.id = ti.entity_id
       union all select 1 from public.experiments x where ti.entity_type = 'experiment' and x.id = ti.entity_id
       union all select 1 from public.experiment_variants x where ti.entity_type = 'variant' and x.id = ti.entity_id
       union all select 1 from public.attachments x where ti.entity_type = 'attachment' and x.id = ti.entity_id
       union all select 1 from public.calendar_events x where ti.entity_type = 'calendar_event' and x.id = ti.entity_id
     );

  perform private.log_activity(t.program_id, 'purged', t.entity_type, t.entity_id, format('Eliminó definitivamente "%s"', t.label));
end;
$$;

create or replace function public.purge_trash_item(p_trash uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.trash_items;
begin
  select * into t from public.trash_items where id = p_trash;
  if not found then
    perform private.fail('El elemento ya no está en la papelera.');
  end if;
  if not private.can_manage(t.program_id) then
    perform private.fail('Solo el owner o un admin puede eliminar definitivamente.');
  end if;
  perform private.purge_trash_item_internal(t.id);
end;
$$;

create or replace function public.empty_trash(p_program uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  if not private.can_manage(p_program) then
    perform private.fail('Solo el owner o un admin puede vaciar la papelera.');
  end if;
  for r in
    select id from public.trash_items
    where program_id = p_program and entity_type <> 'program'
    order by deleted_at desc
  loop
    perform private.purge_trash_item_internal(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Job programado: todo lo que lleve más de 30 días en la papelera.
create or replace function public.purge_expired_trash(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  if not private.is_service() then
    perform private.fail('Solo el servidor puede ejecutar la purga programada.');
  end if;
  for r in
    select id from public.trash_items
    where deleted_at < now() - make_interval(days => p_days)
    order by (entity_type = 'program'), deleted_at
  loop
    perform private.purge_trash_item_internal(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de ejecución
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.transition_experiment(uuid, public.experiment_status, text, boolean),
  public.decide_experiment(uuid, public.verdict, public.decision, text, text, uuid[], text),
  public.unlock_design(uuid, text),
  public.lock_design(uuid),
  public.deletion_impact(text, uuid),
  public.delete_experiment(uuid),
  public.delete_problem(uuid, text, uuid),
  public.delete_metric(uuid, text, uuid),
  public.delete_stage(uuid, text, uuid),
  public.delete_line(uuid),
  public.delete_program(uuid, text),
  public.delete_calendar_event(uuid),
  public.delete_variant(uuid),
  public.delete_attachment(uuid),
  public.restore_trash_item(uuid),
  public.purge_trash_item(uuid),
  public.empty_trash(uuid)
to authenticated;
grant execute on function public.purge_expired_trash(integer) to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
