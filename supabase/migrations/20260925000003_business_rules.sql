-- =============================================================================
-- Reglas de negocio en la base
-- Espejo en SQL de src/domain/*. Si cambias una regla aquí, cámbiala allá
-- (y en sus tests) en el mismo commit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Puntaje (regla 2)
-- -----------------------------------------------------------------------------
create or replace function private.compute_ice(p_impact smallint, p_confidence smallint, p_ease smallint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_impact is null or p_confidence is null or p_ease is null then null
    else round((p_impact + p_confidence + p_ease)::numeric / 3, 1)
  end;
$$;

create or replace function private.compute_final_score(
  p_ice numeric,
  p_fits_calendar boolean,
  p_control public.control_level,
  p_config jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ice is null then null
    else round(
      p_ice
      + case when p_fits_calendar then coalesce((p_config ->> 'calendar_bonus')::numeric, 1) else 0 end
      - case p_control
          when 'shared' then coalesce((p_config ->> 'shared_penalty')::numeric, 1)
          when 'external' then coalesce((p_config ->> 'external_penalty')::numeric, 3)
          else 0
        end,
      1
    )
  end;
$$;

create or replace function private.experiments_scoring()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_config jsonb;
begin
  select p.scoring_config into v_config from public.programs p where p.id = new.program_id;
  new.ice_score := private.compute_ice(new.impact, new.confidence, new.ease);
  new.final_score := private.compute_final_score(new.ice_score, new.fits_calendar, new.control, v_config);
  return new;
end;
$$;

-- Recalcular puntajes cuando cambia la configuración del programa.
create or replace function private.programs_rescore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scoring_config is distinct from old.scoring_config then
    perform private.bypass_guard();
    update public.experiments e
       set final_score = private.compute_final_score(e.ice_score, e.fits_calendar, e.control, new.scoring_config)
     where e.program_id = new.id;
  end if;
  return new;
end;
$$;

create trigger programs_rescore
  after update of scoring_config on public.programs
  for each row execute function private.programs_rescore();

-- -----------------------------------------------------------------------------
-- Programa: el creador queda como owner
-- -----------------------------------------------------------------------------
create or replace function private.programs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.program_members (program_id, user_id, role, created_by)
    values (new.id, new.created_by, 'owner', new.created_by)
    on conflict (program_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$;

create trigger programs_after_insert
  after insert on public.programs
  for each row execute function private.programs_after_insert();

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
      raise exception 'Para borrar o restaurar un programa usa la acción Borrar o la papelera.';
    end if;
  end if;
  return new;
end;
$$;

create trigger a_programs_guard
  before insert or update on public.programs
  for each row execute function private.programs_guard();

-- -----------------------------------------------------------------------------
-- Perfiles: is_admin y email solo cambian desde el servidor
-- -----------------------------------------------------------------------------
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
    raise exception 'No puedes cambiar el rol de admin ni el correo desde aquí.';
  end if;
  return new;
end;
$$;

create trigger a_profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- -----------------------------------------------------------------------------
-- Miembros: siempre queda al menos un owner; los cambios de rol se registran
-- -----------------------------------------------------------------------------
create or replace function private.program_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_service() then
    return coalesce(new, old);
  end if;
  -- En un borrado en cascada del programa, el programa ya no existe.
  if not exists (select 1 from public.programs p where p.id = old.program_id) then
    return coalesce(new, old);
  end if;
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.program_members m
       where m.program_id = old.program_id and m.role = 'owner' and m.id <> old.id
     ) then
    raise exception 'El programa debe tener al menos un owner.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger a_program_members_guard
  before update or delete on public.program_members
  for each row execute function private.program_members_guard();

create or replace function private.program_members_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.programs p where p.id = old.program_id) then
      return old;
    end if;
    select coalesce(nullif(p.name, ''), p.email) into v_name from public.profiles p where p.id = old.user_id;
    perform private.log_activity(old.program_id, 'member_removed', 'member', old.user_id,
      format('Quitó a %s del programa', v_name), jsonb_build_object('role', old.role));
    return old;
  end if;
  select coalesce(nullif(p.name, ''), p.email) into v_name from public.profiles p where p.id = new.user_id;
  if tg_op = 'INSERT' then
    perform private.log_activity(new.program_id, 'member_added', 'member', new.user_id,
      format('Agregó a %s como %s', v_name, new.role), jsonb_build_object('role', new.role));
  elsif new.role is distinct from old.role then
    perform private.log_activity(new.program_id, 'role_changed', 'member', new.user_id,
      format('Cambió el rol de %s de %s a %s', v_name, old.role, new.role),
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end;
$$;

create trigger z_program_members_log
  after insert or update or delete on public.program_members
  for each row execute function private.program_members_log();

-- -----------------------------------------------------------------------------
-- Coherencia jerárquica: program_id / line_id se derivan del padre
-- -----------------------------------------------------------------------------
-- Al crear una línea se proponen las cuatro etapas por defecto (editables).
create or replace function private.lines_default_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.skip_default_stages', true), '') = 'on' then
    return new;
  end if;
  insert into public.funnel_stages (program_id, line_id, name, sort_order, description, created_by)
  values
    (new.program_id, new.id, 'Adquisición', 1,
      'Cómo llega el cliente: alcance, tráfico y conversaciones iniciadas.', new.created_by),
    (new.program_id, new.id, 'Activación', 2,
      'El cliente muestra intención: explora la oferta, responde o agrega al carrito.', new.created_by),
    (new.program_id, new.id, 'Conversión', 3,
      'El cliente compra, se porta o activa el servicio.', new.created_by),
    (new.program_id, new.id, 'Recuperación y recurrencia', 4,
      'Rescate de abandonos y compras repetidas.', new.created_by);
  return new;
end;
$$;

create trigger lines_default_stages
  after insert on public.business_lines
  for each row execute function private.lines_default_stages();

create or replace function private.metrics_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_parent_line uuid;
begin
  select l.program_id into v_program from public.business_lines l where l.id = new.line_id;
  if v_program is null then
    raise exception 'La línea no existe.';
  end if;
  if tg_op = 'UPDATE' and new.line_id <> old.line_id then
    raise exception 'Una métrica no puede cambiar de línea.';
  end if;
  new.program_id := v_program;
  if new.parent_id is not null then
    select m.line_id into v_parent_line from public.metrics m where m.id = new.parent_id and m.deleted_at is null;
    if v_parent_line is null or v_parent_line <> new.line_id then
      raise exception 'La métrica padre debe ser de la misma línea.';
    end if;
    if tg_op = 'UPDATE' and exists (
      with recursive up as (
        select m.id, m.parent_id from public.metrics m where m.id = new.parent_id
        union all
        select m.id, m.parent_id from public.metrics m join up on m.id = up.parent_id
      )
      select 1 from up where up.id = new.id
    ) then
      raise exception 'El árbol no puede tener ciclos.';
    end if;
  end if;
  if new.owner_id is not null and not exists (
    select 1 from public.program_members pm where pm.program_id = v_program and pm.user_id = new.owner_id
  ) then
    raise exception 'El responsable de la métrica debe ser miembro del programa.';
  end if;
  return new;
end;
$$;

create trigger a_metrics_coherence
  before insert or update of line_id, parent_id, owner_id on public.metrics
  for each row execute function private.metrics_coherence();

create or replace function private.metric_targets_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select m.program_id into v_program from public.metrics m where m.id = new.metric_id;
  if v_program is null then
    raise exception 'La métrica no existe.';
  end if;
  new.program_id := v_program;
  if not exists (
    select 1 from public.program_horizons h where h.id = new.horizon_id and h.program_id = v_program
  ) then
    raise exception 'El horizonte debe ser del mismo programa.';
  end if;
  return new;
end;
$$;

create trigger a_metric_targets_coherence
  before insert or update of metric_id, horizon_id on public.metric_targets
  for each row execute function private.metric_targets_coherence();

create or replace function private.metric_values_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select m.program_id into v_program from public.metrics m where m.id = new.metric_id;
  if v_program is null then
    raise exception 'La métrica no existe.';
  end if;
  new.program_id := v_program;
  if tg_op = 'INSERT' and not private.is_service() then
    new.entered_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger a_metric_values_coherence
  before insert or update of metric_id on public.metric_values
  for each row execute function private.metric_values_coherence();

-- Historial de cambios de los valores semanales.
create or replace function private.metric_values_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.value is distinct from old.value or new.note is distinct from old.note then
    insert into public.metric_value_history (program_id, metric_value_id, old_value, new_value, old_note, new_note, changed_by)
    values (old.program_id, old.id, old.value, new.value, old.note, new.note, auth.uid());
    if not private.is_service() then
      new.entered_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger b_metric_values_history
  before update on public.metric_values
  for each row execute function private.metric_values_history();

create or replace function private.funnel_stages_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  -- Desvincular la métrica (incluido el SET NULL en cascada al eliminar una
  -- métrica o una línea) no necesita validación.
  if tg_op = 'UPDATE' and new.line_id = old.line_id and new.metric_id is null then
    return new;
  end if;
  select l.program_id into v_program from public.business_lines l where l.id = new.line_id;
  if v_program is null then
    raise exception 'La línea no existe.';
  end if;
  if tg_op = 'UPDATE' and new.line_id <> old.line_id then
    raise exception 'Una etapa no puede cambiar de línea.';
  end if;
  new.program_id := v_program;
  if new.metric_id is not null and not exists (
    select 1 from public.metrics m where m.id = new.metric_id and m.line_id = new.line_id
  ) then
    raise exception 'La métrica vinculada debe ser de la misma línea.';
  end if;
  return new;
end;
$$;

create trigger a_funnel_stages_coherence
  before insert or update of line_id, metric_id on public.funnel_stages
  for each row execute function private.funnel_stages_coherence();

create or replace function private.problems_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line uuid;
  v_program uuid;
begin
  select s.line_id, s.program_id into v_line, v_program
  from public.funnel_stages s where s.id = new.stage_id and s.deleted_at is null;
  if v_line is null then
    raise exception 'La etapa del embudo no existe o fue borrada.';
  end if;
  if tg_op = 'UPDATE' and v_line <> old.line_id then
    raise exception 'La etapa debe pertenecer a la misma línea del problema.';
  end if;
  new.line_id := v_line;
  new.program_id := v_program;
  return new;
end;
$$;

create trigger a_problems_coherence
  before insert or update of stage_id, line_id on public.problems
  for each row execute function private.problems_coherence();

-- -----------------------------------------------------------------------------
-- Ejercicios: coherencia (regla 1), guarda de permisos por columna y bloqueo
-- del diseño (regla 4). Los triggers BEFORE se ejecutan por orden alfabético.
-- -----------------------------------------------------------------------------
create or replace function private.experiments_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line uuid;
  v_program uuid;
  v_metric_line uuid;
begin
  select p.line_id, p.program_id into v_line, v_program
  from public.problems p where p.id = new.problem_id and p.deleted_at is null;
  if v_line is null then
    raise exception 'Todo ejercicio necesita un problema existente.';
  end if;
  if tg_op = 'UPDATE' and v_line <> old.line_id then
    raise exception 'El problema debe ser de la misma línea del ejercicio.';
  end if;
  select m.line_id into v_metric_line from public.metrics m where m.id = new.metric_id and m.deleted_at is null;
  if v_metric_line is null or v_metric_line <> v_line then
    raise exception 'La métrica del árbol debe pertenecer a la misma línea del problema.';
  end if;
  new.line_id := v_line;
  new.program_id := v_program;
  if new.owner_id is not null and not exists (
    select 1 from public.program_members pm where pm.program_id = v_program and pm.user_id = new.owner_id
  ) then
    raise exception 'El responsable debe ser miembro del programa.';
  end if;
  return new;
end;
$$;

create trigger a_experiments_coherence
  before insert or update of problem_id, metric_id, line_id, program_id, owner_id on public.experiments
  for each row execute function private.experiments_coherence();

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
    raise exception 'Para borrar o restaurar usa la acción Borrar o la papelera.';
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

create trigger b_experiments_guard
  before insert or update on public.experiments
  for each row execute function private.experiments_guard();

create trigger c_experiments_scoring
  before insert or update on public.experiments
  for each row execute function private.experiments_scoring();

-- -----------------------------------------------------------------------------
-- Variantes, aprendizajes y adjuntos
-- -----------------------------------------------------------------------------
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
    raise exception 'Para borrar una variante usa la acción Borrar.';
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

create trigger a_variants_guard
  before insert or update on public.experiment_variants
  for each row execute function private.variants_guard();

create or replace function private.learnings_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  select e.program_id into v_program from public.experiments e where e.id = new.experiment_id;
  if v_program is null then
    raise exception 'El ejercicio no existe.';
  end if;
  new.program_id := v_program;
  if exists (
    select 1 from unnest(new.applies_to_line_ids) as l(id)
    where not exists (select 1 from public.business_lines bl where bl.id = l.id and bl.program_id = v_program)
  ) then
    raise exception 'Las líneas del aprendizaje deben ser del mismo programa.';
  end if;
  if tg_op = 'UPDATE' and not (private.is_service() or private.guard_bypassed())
     and new.deleted_at is distinct from old.deleted_at then
    raise exception 'El aprendizaje se borra junto con su ejercicio.';
  end if;
  return new;
end;
$$;

create trigger a_learnings_coherence
  before insert or update on public.learnings
  for each row execute function private.learnings_coherence();

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
    raise exception 'Para borrar un adjunto usa la acción Borrar.';
  end if;
  return new;
end;
$$;

create trigger a_attachments_coherence
  before insert or update on public.attachments
  for each row execute function private.attachments_coherence();

-- Al eliminar definitivamente un adjunto (directo o en cascada) su archivo
-- queda en cola para borrarse de Storage desde el servidor.
create or replace function private.attachments_enqueue_storage_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_deletion_queue (bucket, storage_path) values ('attachments', old.storage_path);
  return old;
end;
$$;

create trigger z_attachments_enqueue_storage_delete
  after delete on public.attachments
  for each row execute function private.attachments_enqueue_storage_delete();

-- -----------------------------------------------------------------------------
-- Guarda genérica: deleted_at solo cambia por RPC en el resto de tablas
-- -----------------------------------------------------------------------------
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
    raise exception 'Para borrar o restaurar usa la acción Borrar o la papelera.';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'business_lines', 'metrics', 'metric_values', 'funnel_stages', 'problems'] loop
    execute format(
      'create trigger b_soft_delete_guard before insert or update on public.%I for each row execute function private.soft_delete_guard()',
      t
    );
  end loop;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;
