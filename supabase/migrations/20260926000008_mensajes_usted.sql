-- Voz de ARRIERO: los mensajes de error de triggers y RPC pasan de tú a usted.
-- Solo cambian textos; la lógica de cada función es idéntica a la original.

-- de 20260925000003_business_rules.sql
create or replace function private.programs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.is_demo and not private.is_admin() then
      raise exception 'Solo un admin puede crear el programa de ejemplo.';
    end if;
  else
    if new.is_demo is distinct from old.is_demo then
      raise exception 'No se puede cambiar si un programa es de ejemplo.';
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      raise exception 'Para borrar o restaurar un programa use la acción Borrar o la papelera.';
    end if;
  end if;
  return new;
end;
$$;

-- de 20260925000003_business_rules.sql
create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_service() then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin or new.email is distinct from old.email then
    raise exception 'No se puede cambiar el rol de admin ni el correo desde aquí.';
  end if;
  return new;
end;
$$;

-- de 20260925000003_business_rules.sql
create or replace function private.experiments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.program_role;
  v_admin boolean;
  v_manage boolean;
  v_edit boolean;
begin
  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;

  v_admin := private.is_admin();
  v_role := private.program_role(new.program_id);
  v_manage := v_admin or v_role = 'owner';
  v_edit := v_manage or v_role = 'collaborator';

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if new.status <> 'idea' or new.design_locked_at is not null
       or new.verdict is not null or new.decision is not null then
      raise exception 'Un ejercicio nuevo empieza en Idea; el estado cambia con las transiciones.';
    end if;
    if not v_edit and (new.impact is not null or new.confidence is not null or new.ease is not null) then
      raise exception 'La agencia no califica ICE.';
    end if;
    new.status_changed_at := now();
    return new;
  end if;

  if new.status is distinct from old.status
     or new.status_changed_at is distinct from old.status_changed_at
     or new.design_locked_at is distinct from old.design_locked_at
     or new.decided_at is distinct from old.decided_at then
    raise exception 'El estado y el bloqueo del diseño se cambian con las transiciones del ejercicio.';
  end if;

  if new.deleted_at is distinct from old.deleted_at or new.deletion_batch is distinct from old.deletion_batch then
    raise exception 'Para borrar o restaurar use la acción Borrar o la papelera.';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'No se puede cambiar quién creó el ejercicio.';
  end if;

  if not v_edit and (
    new.impact is distinct from old.impact
    or new.confidence is distinct from old.confidence
    or new.ease is distinct from old.ease
    or new.fits_calendar is distinct from old.fits_calendar
    or new.control is distinct from old.control
    or new.owner_id is distinct from old.owner_id
    or new.problem_id is distinct from old.problem_id
    or new.metric_id is distinct from old.metric_id
  ) then
    raise exception 'La agencia no puede cambiar la priorización, el responsable, el problema ni la métrica.';
  end if;

  if not v_manage and (
    new.verdict is distinct from old.verdict
    or new.decision is distinct from old.decision
    or new.decision_rationale is distinct from old.decision_rationale
  ) then
    raise exception 'Solo el owner o un admin emite el veredicto y la decisión.';
  end if;

  -- Regla 4: diseño bloqueado.
  if old.design_locked_at is not null and (
    new.test_type is distinct from old.test_type
    or new.primary_metric is distinct from old.primary_metric
    or new.control_metrics is distinct from old.control_metrics
    or new.min_duration_days is distinct from old.min_duration_days
    or new.decision_rule is distinct from old.decision_rule
    or new.metric_id is distinct from old.metric_id
  ) then
    raise exception 'El diseño está bloqueado desde que el ejercicio entró en prueba. Solo el owner puede desbloquearlo.';
  end if;

  return new;
end;
$$;

-- de 20260925000003_business_rules.sql
create or replace function private.variants_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_locked timestamptz;
begin
  select e.program_id, e.design_locked_at into v_program, v_locked
  from public.experiments e where e.id = new.experiment_id and e.deleted_at is null;
  if v_program is null then
    raise exception 'El ejercicio no existe o fue borrado.';
  end if;
  new.program_id := v_program;

  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if v_locked is not null then
      raise exception 'El diseño está bloqueado: no se pueden agregar variantes.';
    end if;
    return new;
  end if;

  if new.experiment_id <> old.experiment_id then
    raise exception 'Una variante no puede cambiar de ejercicio.';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Para borrar una variante use la acción Borrar.';
  end if;
  if v_locked is not null and (
    new.name is distinct from old.name
    or new.is_control is distinct from old.is_control
    or new.description is distinct from old.description
  ) then
    raise exception 'El diseño está bloqueado: solo se pueden cargar resultados en las variantes.';
  end if;
  return new;
end;
$$;

-- de 20260925000003_business_rules.sql
create or replace function private.attachments_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  if new.entity_type = 'problem' then
    select p.program_id into v_program from public.problems p where p.id = new.problem_id and p.deleted_at is null;
  else
    select e.program_id into v_program from public.experiments e where e.id = new.experiment_id and e.deleted_at is null;
  end if;
  if v_program is null then
    raise exception 'La entidad del adjunto no existe o fue borrada.';
  end if;
  new.program_id := v_program;
  if tg_op = 'INSERT' and not private.is_service() then
    new.uploaded_by := auth.uid();
    new.created_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and not (private.is_service() or private.guard_bypassed())
     and new.deleted_at is distinct from old.deleted_at then
    raise exception 'Para borrar un adjunto use la acción Borrar.';
  end if;
  return new;
end;
$$;

-- de 20260925000003_business_rules.sql
create or replace function private.soft_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception 'No se puede crear un elemento borrado.';
    end if;
    return new;
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.deletion_batch is distinct from old.deletion_batch then
    raise exception 'Para borrar o restaurar use la acción Borrar o la papelera.';
  end if;
  return new;
end;
$$;

-- de 20260925000004_rpc.sql
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

-- de 20260925000004_rpc.sql
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
    perform private.fail('Para desbloquear el diseño escriba una justificación.');
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

-- de 20260925000004_rpc.sql
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
    perform private.fail('No tiene permiso para bloquear este diseño.');
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

-- de 20260925000004_rpc.sql
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
    perform private.fail('El elemento no existe o no tiene acceso.');
  end if;
  return v_result;
end;
$$;

-- de 20260925000004_rpc.sql
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
      perform private.fail('Solo puede borrar los ejercicios que usted creó.');
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

-- de 20260925000004_rpc.sql
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
        perform private.fail('Elija otro problema de la misma línea para reasignar los ejercicios.');
      end if;
      update public.experiments set problem_id = p_target where problem_id = p.id and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('El problema tiene %s ejercicio(s) vinculados: elija si los reasigna o los borra junto con él.', v_count));
    end if;
  end if;

  perform private.mark_problem(p.id, v_batch, now());
  perform private.add_trash(p.program_id, 'problem', p.id, p.title, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'experiments', v_count));
  perform private.log_activity(p.program_id, 'deleted', 'problem', p.id, format('Borró el problema "%s"', p.title),
    jsonb_build_object('strategy', p_strategy, 'target', p_target));
end;
$$;

-- de 20260925000004_rpc.sql
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
        perform private.fail('Elija otra métrica de la misma línea (fuera de esta rama) para reasignar los ejercicios.');
      end if;
      update public.experiments set metric_id = p_target where metric_id = any (v_ids) and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('La métrica tiene %s ejercicio(s) vinculados: elija si los reasigna o los borra junto con ella.', v_count));
    end if;
  end if;

  perform private.mark_metric(m.id, v_batch, now());
  perform private.add_trash(m.program_id, 'metric', m.id, m.name, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'experiments', v_count));
  perform private.log_activity(m.program_id, 'deleted', 'metric', m.id, format('Borró la métrica "%s"', m.name),
    jsonb_build_object('strategy', p_strategy, 'target', p_target));
end;
$$;

-- de 20260925000004_rpc.sql
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
        perform private.fail('Elija otra etapa de la misma línea para reasignar los problemas.');
      end if;
      update public.problems set stage_id = p_target where stage_id = s.id and deleted_at is null;
    elsif p_strategy is distinct from 'cascade' then
      perform private.fail(format('La etapa tiene %s problema(s): elija si los reasigna o los borra junto con ella.', v_count));
    end if;
  end if;

  perform private.mark_stage(s.id, v_batch, now());
  perform private.add_trash(s.program_id, 'stage', s.id, s.name, v_batch,
    jsonb_build_object('strategy', p_strategy, 'target', p_target, 'problems', v_count));
  perform private.log_activity(s.program_id, 'deleted', 'stage', s.id, format('Borró la etapa "%s"', s.name));
end;
$$;

-- de 20260925000004_rpc.sql
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
    perform private.fail('Escriba el nombre exacto del programa para confirmar.');
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

-- de 20260925000004_rpc.sql
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
    perform private.fail('No tiene permiso para editar el calendario.');
  end if;
  perform private.bypass_guard();
  update public.calendar_events set deleted_at = now(), deleted_by = auth.uid(), deletion_batch = v_batch where id = c.id;
  perform private.add_trash(c.program_id, 'calendar_event', c.id, c.name, v_batch, jsonb_build_object('type', c.type));
  perform private.log_activity(c.program_id, 'deleted', 'calendar_event', c.id, format('Borró el evento "%s"', c.name));
end;
$$;

-- de 20260925000004_rpc.sql
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
    perform private.fail('No tiene permiso para editar este ejercicio.');
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

-- de 20260925000004_rpc.sql
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
    perform private.fail('No tiene permiso para borrar este adjunto.');
  end if;
  perform private.bypass_guard();
  update public.attachments set deleted_at = now(), deleted_by = auth.uid(), deletion_batch = v_batch where id = a.id;
  perform private.add_trash(a.program_id, 'attachment', a.id, a.name, v_batch);
  perform private.log_activity(a.program_id, 'deleted', 'attachment', a.id, format('Borró el adjunto "%s"', a.name));
end;
$$;
