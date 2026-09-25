-- =============================================================================
-- Row Level Security
-- Regla general:
--   · SELECT: miembro del programa (o admin) y deleted_at IS NULL.
--   · Escrituras simples: según la matriz de permisos (ver CLAUDE.md §7).
--   · Borrar, restaurar, cambiar de estado, bloquear: solo por RPC (sin
--     políticas DELETE para usuarios).
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'program_horizons', 'program_members', 'calendar_events',
    'business_lines', 'metrics', 'metric_targets', 'metric_values', 'metric_value_history',
    'funnel_stages', 'problems', 'experiments', 'experiment_variants', 'learnings',
    'attachments', 'activity_log', 'trash_items', 'storage_deletion_queue'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Nadie fuera del servidor toca la cola de Storage.
revoke all on public.storage_deletion_queue from anon, authenticated;
-- El registro de actividad y el historial solo se escriben por triggers/RPC.
revoke insert, update, delete on public.activity_log, public.metric_value_history, public.trash_items from anon, authenticated;
-- anon no necesita nada: no hay registro abierto ni páginas públicas con datos.
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin() or private.shares_program(id));

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- programs
-- -----------------------------------------------------------------------------
create policy programs_select on public.programs for select to authenticated
  using (deleted_at is null and private.is_member(id));

create policy programs_insert on public.programs for insert to authenticated
  with check (private.is_admin());

create policy programs_update on public.programs for update to authenticated
  using (deleted_at is null and private.can_manage(id))
  with check (deleted_at is null and private.can_manage(id));

-- -----------------------------------------------------------------------------
-- program_horizons (datos del programa: owner/admin)
-- -----------------------------------------------------------------------------
create policy horizons_select on public.program_horizons for select to authenticated
  using (private.is_member(program_id));
create policy horizons_insert on public.program_horizons for insert to authenticated
  with check (private.can_manage(program_id));
create policy horizons_update on public.program_horizons for update to authenticated
  using (private.can_manage(program_id)) with check (private.can_manage(program_id));
create policy horizons_delete on public.program_horizons for delete to authenticated
  using (private.can_manage(program_id));

-- -----------------------------------------------------------------------------
-- program_members (invitar y cambiar roles: owner/admin)
-- -----------------------------------------------------------------------------
create policy members_select on public.program_members for select to authenticated
  using (private.is_member(program_id));
create policy members_insert on public.program_members for insert to authenticated
  with check (private.can_manage(program_id));
create policy members_update on public.program_members for update to authenticated
  using (private.can_manage(program_id)) with check (private.can_manage(program_id));
create policy members_delete on public.program_members for delete to authenticated
  using (private.can_manage(program_id));

-- -----------------------------------------------------------------------------
-- Estructura editable por admin/owner/collaborator
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'business_lines', 'metrics', 'metric_values', 'funnel_stages', 'problems'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (deleted_at is null and private.is_member(program_id))',
      t
    );
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (deleted_at is null and private.can_edit(program_id))',
      t
    );
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (deleted_at is null and private.can_edit(program_id)) with check (deleted_at is null and private.can_edit(program_id))',
      t
    );
  end loop;
end;
$$;

-- Los objetivos no tienen borrado lógico: viven y mueren con su métrica.
create policy metric_targets_select on public.metric_targets for select to authenticated
  using (private.is_member(program_id));
create policy metric_targets_insert on public.metric_targets for insert to authenticated
  with check (private.can_edit(program_id));
create policy metric_targets_update on public.metric_targets for update to authenticated
  using (private.can_edit(program_id)) with check (private.can_edit(program_id));
create policy metric_targets_delete on public.metric_targets for delete to authenticated
  using (private.can_edit(program_id));

create policy metric_value_history_select on public.metric_value_history for select to authenticated
  using (private.is_member(program_id));

-- -----------------------------------------------------------------------------
-- experiments
-- -----------------------------------------------------------------------------
create policy experiments_select on public.experiments for select to authenticated
  using (deleted_at is null and private.is_member(program_id));

-- Crean: admin, owner, collaborator y agency.
create policy experiments_insert on public.experiments for insert to authenticated
  with check (
    deleted_at is null
    and created_by = auth.uid()
    and (private.can_edit(program_id) or private.program_role(program_id) = 'agency')
  );

-- Editan: admin, owner, collaborator; la agencia solo los asignados.
create policy experiments_update on public.experiments for update to authenticated
  using (
    deleted_at is null
    and (private.can_edit(program_id) or (private.program_role(program_id) = 'agency' and owner_id = auth.uid()))
  )
  with check (
    deleted_at is null
    and (private.can_edit(program_id) or (private.program_role(program_id) = 'agency' and owner_id = auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- experiment_variants
-- -----------------------------------------------------------------------------
create policy variants_select on public.experiment_variants for select to authenticated
  using (deleted_at is null and private.is_member(program_id));
create policy variants_insert on public.experiment_variants for insert to authenticated
  with check (deleted_at is null and private.can_edit_experiment(experiment_id));
create policy variants_update on public.experiment_variants for update to authenticated
  using (deleted_at is null and private.can_edit_experiment(experiment_id))
  with check (deleted_at is null and private.can_edit_experiment(experiment_id));

-- -----------------------------------------------------------------------------
-- learnings (se crean al decidir, por RPC; se editan después)
-- -----------------------------------------------------------------------------
create policy learnings_select on public.learnings for select to authenticated
  using (deleted_at is null and private.is_member(program_id));
create policy learnings_update on public.learnings for update to authenticated
  using (deleted_at is null and private.can_edit(program_id))
  with check (deleted_at is null and private.can_edit(program_id));

-- -----------------------------------------------------------------------------
-- attachments
-- -----------------------------------------------------------------------------
create policy attachments_select on public.attachments for select to authenticated
  using (deleted_at is null and private.is_member(program_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    deleted_at is null
    and (
      (entity_type = 'problem' and private.can_edit(program_id))
      or (entity_type = 'experiment' and private.can_edit_experiment(experiment_id))
    )
  );

-- -----------------------------------------------------------------------------
-- activity_log y papelera
-- -----------------------------------------------------------------------------
create policy activity_log_select on public.activity_log for select to authenticated
  using (
    (program_id is not null and private.is_member(program_id))
    or (program_id is null and private.is_admin())
  );

-- La papelera solo la ve quien puede restaurar.
create policy trash_items_select on public.trash_items for select to authenticated
  using (private.can_manage(program_id));
