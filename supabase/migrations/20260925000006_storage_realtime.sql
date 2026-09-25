-- =============================================================================
-- Storage (adjuntos) y Realtime (tableros en vivo)
-- =============================================================================

-- Bucket privado. Ruta: {program_id}/{entity_type}/{entity_id}/{uuid}-{nombre}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  20971520,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puede el usuario adjuntar a esta entidad?
create or replace function private.can_attach(p_program text, p_entity_type text, p_entity text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_entity uuid;
begin
  begin
    v_program := p_program::uuid;
    v_entity := p_entity::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if p_entity_type = 'problem' then
    return exists (
      select 1 from public.problems p
      where p.id = v_entity and p.program_id = v_program and p.deleted_at is null
    ) and private.can_edit(v_program);
  elsif p_entity_type = 'experiment' then
    return exists (
      select 1 from public.experiments e where e.id = v_entity and e.program_id = v_program
    ) and private.can_edit_experiment(v_entity);
  end if;
  return false;
end;
$$;

create or replace function private.can_read_object(p_program text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return private.is_member(p_program::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

grant execute on function private.can_attach(text, text, text), private.can_read_object(text) to authenticated;

create policy attachments_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and private.can_read_object((storage.foldername(name))[1]));

create policy attachments_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.can_attach(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2],
      (storage.foldername(name))[3]
    )
  );
-- Sin UPDATE ni DELETE para usuarios: los archivos se borran desde el servidor
-- al eliminar definitivamente (cola storage_deletion_queue).

-- Realtime: los tableros escuchan cambios en estas tablas (respeta RLS).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['experiments', 'experiment_variants', 'metric_values', 'problems', 'calendar_events', 'learnings'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
