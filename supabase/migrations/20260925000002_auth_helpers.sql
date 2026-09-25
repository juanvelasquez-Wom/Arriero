-- =============================================================================
-- Perfiles y funciones auxiliares de permisos
-- Las funciones de private.* se usan dentro de las políticas RLS y de las RPC.
-- Son SECURITY DEFINER para evitar recursión de RLS y tienen search_path fijo.
-- =============================================================================

grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Perfil automático al crear un usuario de Auth
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Contexto de la petición
-- -----------------------------------------------------------------------------

-- Verdadero cuando la petición llega con la secret key (rol service_role) o por
-- una conexión directa a la base (migraciones, SQL editor). Se usa session_user
-- y el claim del JWT, no current_user, porque dentro de una función
-- SECURITY DEFINER current_user es el dueño de la función.
create or replace function private.is_service()
returns boolean
language sql
stable
set search_path = ''
as $$
  select session_user in ('postgres', 'supabase_admin', 'supabase_auth_admin')
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

-- Las RPC que ya validaron permisos activan este indicador (solo dura la transacción)
-- para que los triggers de guarda permitan cambios de estado, bloqueo, etc.
create or replace function private.guard_bypassed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.bypass_guard', true), '') = 'on';
$$;

create or replace function private.bypass_guard()
returns void
language sql
set search_path = ''
as $$
  select set_config('app.bypass_guard', 'on', true);
$$;

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function private.program_role(p_program uuid)
returns public.program_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.program_members m
  where m.program_id = p_program and m.user_id = auth.uid();
$$;

create or replace function private.is_member(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.program_members m
    where m.program_id = p_program and m.user_id = auth.uid()
  );
$$;

-- Admin, owner o collaborator: edita la estructura del programa.
create or replace function private.can_edit(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce(private.program_role(p_program) in ('owner', 'collaborator'), false);
$$;

-- Admin u owner: decide, borra estructura, invita, restaura.
create or replace function private.can_manage(p_program uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce(private.program_role(p_program) = 'owner', false);
$$;

-- Puede editar un ejercicio concreto: edición general o agencia asignada.
create or replace function private.can_edit_experiment(p_experiment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiments e
    where e.id = p_experiment
      and e.deleted_at is null
      and (
        private.can_edit(e.program_id)
        or (private.program_role(e.program_id) = 'agency' and e.owner_id = auth.uid())
      )
  );
$$;

-- Comparte al menos un programa con el usuario actual (para ver perfiles).
create or replace function private.shares_program(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.program_members a
    join public.program_members b on b.program_id = a.program_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- -----------------------------------------------------------------------------
-- Registro de actividad
-- -----------------------------------------------------------------------------
create or replace function private.log_activity(
  p_program uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (program_id, actor_id, action, entity_type, entity_id, summary, payload)
  values (p_program, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_payload, '{}'::jsonb));
$$;

grant execute on all functions in schema private to authenticated, service_role;
