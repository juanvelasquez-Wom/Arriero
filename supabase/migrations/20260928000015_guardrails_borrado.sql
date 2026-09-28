-- =============================================================================
-- Corrección: al eliminar de forma definitiva un programa o un ejercicio (cascada
-- o purga de la papelera), la guarda de experiment_guardrails no encontraba el
-- ejercicio y bloqueaba el borrado. En DELETE, si el ejercicio ya no está, se deja
-- pasar (lo está borrando la cascada).
-- =============================================================================
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
  from public.experiments e where e.id = exp_id and (e.deleted_at is null or tg_op = 'DELETE');
  if v_program is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
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
