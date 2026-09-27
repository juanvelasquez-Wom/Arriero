-- Avisos dentro de la app (sin depender de SMTP): asignaciones, cambios de estado,
-- comentarios y menciones, y un job diario con "ya se puede leer", ideas quietas,
-- congelamientos que se acercan y el recordatorio de la carga semanal.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
grant select, update, delete on public.notifications to authenticated;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Quien recibe el aviso solo puede marcarlo como leído.
create or replace function private.notifications_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_service() and (
    new.user_id is distinct from old.user_id or new.kind is distinct from old.kind or new.title is distinct from old.title
    or new.body is distinct from old.body or new.href is distinct from old.href or new.program_id is distinct from old.program_id
    or new.dedupe_key is distinct from old.dedupe_key or new.created_at is distinct from old.created_at
  ) then
    raise exception 'De un aviso solo se puede cambiar si ya se leyó.';
  end if;
  return new;
end;
$$;
drop trigger if exists a_notifications_guard on public.notifications;
create trigger a_notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

-- Crea un aviso (no duplica si ya existe la misma clave para esa persona).
create or replace function private.notify(
  p_user uuid, p_program uuid, p_kind text, p_title text, p_body text, p_href text, p_dedupe text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, program_id, kind, title, body, href, dedupe_key)
  values (p_user, p_program, p_kind, p_title, p_body, p_href, p_dedupe)
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ejercicios: asignación y cambios de estado
-- -----------------------------------------------------------------------------
create or replace function private.experiments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_href text := '/programas/' || new.program_id || '/ejercicios/' || new.id;
  v_user uuid;
begin
  if new.deleted_at is not null then return new; end if;

  if new.owner_id is not null and new.owner_id is distinct from v_actor
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    perform private.notify(new.owner_id, new.program_id, 'assigned',
      'Le asignaron un ejercicio', '«' || new.title || '» ahora está a su cargo.', v_href);
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    for v_user in
      select distinct u from unnest(array[new.owner_id, new.created_by]) as u
      where u is not null and u is distinct from v_actor
    loop
      perform private.notify(v_user, new.program_id, 'status',
        '«' || new.title || '» pasó a ' || private.status_label(new.status),
        case new.status
          when 'in_test' then 'La prueba arrancó. Toca esperar la duración mínima antes de leerla.'
          when 'in_reading' then 'Ya cerró la prueba: toca cargar resultados y leerla.'
          when 'decided' then 'Ya tiene veredicto y aprendizaje.'
          when 'scaled' then '¡Eso! Ya es parte de la operación normal.'
          else null
        end,
        v_href);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists z_experiments_notify on public.experiments;
create trigger z_experiments_notify after insert or update on public.experiments
  for each row execute function private.experiments_notify();

-- -----------------------------------------------------------------------------
-- Comentarios: avisa al responsable, a quien creó el ejercicio, a quienes ya
-- comentaron y a quien mencionen con @nombre (primer nombre o correo).
-- -----------------------------------------------------------------------------
create or replace function private.comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_author text;
  v_href text;
  v_user uuid;
  v_body text := lower(new.body);
begin
  select x.id, x.title, x.owner_id, x.created_by, x.program_id into e from public.experiments x where x.id = new.experiment_id;
  select coalesce(nullif(p.name, ''), p.email) into v_author from public.profiles p where p.id = new.created_by;
  v_href := '/programas/' || e.program_id || '/ejercicios/' || e.id || '?tab=conversacion';

  -- Menciones
  for v_user in
    select m.user_id from public.program_members m
    join public.profiles p on p.id = m.user_id
    where m.program_id = e.program_id and m.user_id is distinct from new.created_by
      and (
        (coalesce(p.name, '') <> '' and v_body like '%@' || lower(split_part(p.name, ' ', 1)) || '%')
        or v_body like '%@' || lower(split_part(p.email, '@', 1)) || '%'
      )
  loop
    perform private.notify(v_user, e.program_id, 'mention',
      coalesce(v_author, 'Alguien') || ' lo mencionó en «' || e.title || '»', left(new.body, 180), v_href,
      'mention:' || new.id);
  end loop;

  -- Conversación
  for v_user in
    select distinct u from (
      select e.owner_id as u
      union select e.created_by
      union select c.created_by from public.experiment_comments c where c.experiment_id = e.id
    ) s
    where u is not null and u is distinct from new.created_by
  loop
    perform private.notify(v_user, e.program_id, 'comment',
      coalesce(v_author, 'Alguien') || ' comentó en «' || e.title || '»', left(new.body, 180), v_href,
      'comment:' || new.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists z_comments_notify on public.experiment_comments;
create trigger z_comments_notify after insert on public.experiment_comments
  for each row execute function private.comments_notify();

-- -----------------------------------------------------------------------------
-- Job diario (lo llama el cron con la secret key)
-- -----------------------------------------------------------------------------
create or replace function public.generate_daily_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
  v_last_monday date := (date_trunc('week', current_date) - interval '7 days')::date;
  r record;
  v_user uuid;
begin
  if not private.is_service() then
    perform private.fail('Solo el servidor puede generar los avisos diarios.');
  end if;
  select count(*) into v_before from public.notifications;

  -- Ya se puede leer: en prueba y con la duración mínima cumplida.
  for r in
    select e.* from public.experiments e
    join public.programs p on p.id = e.program_id and p.deleted_at is null
    where e.deleted_at is null and e.status = 'in_test' and e.actual_start is not null
      and e.min_duration_days is not null and current_date - e.actual_start >= e.min_duration_days
  loop
    for v_user in select distinct u from unnest(array[r.owner_id, r.created_by]) as u where u is not null loop
      perform private.notify(v_user, r.program_id, 'ready_to_read',
        'Ya se puede leer «' || r.title || '»',
        'Cumplió ' || r.min_duration_days || ' días en prueba. Hágale pues: cierre y cargue los resultados.',
        '/programas/' || r.program_id || '/ejercicios/' || r.id, 'ready:' || r.id);
    end loop;
  end loop;

  -- Ideas quietas: más de 30 días sin moverse (una vez al mes).
  for r in
    select e.* from public.experiments e
    join public.programs p on p.id = e.program_id and p.deleted_at is null
    where e.deleted_at is null and e.status in ('idea', 'prioritized') and e.status_changed_at < now() - interval '30 days'
  loop
    perform private.notify(coalesce(r.owner_id, r.created_by), r.program_id, 'stale',
      '«' || r.title || '» lleva más de un mes quieto',
      'Si ya no va, descártelo; si sí, priorícelo. No cargue por cargar.',
      '/programas/' || r.program_id || '/ejercicios/' || r.id, 'stale:' || r.id || ':' || to_char(current_date, 'YYYY-MM'));
  end loop;

  -- Congelamientos que empiezan en 7 días o menos: avisa a owners y colaboradores.
  for r in
    select ev.*, pr.name as program_name from public.calendar_events ev
    join public.programs pr on pr.id = ev.program_id and pr.deleted_at is null
    where ev.deleted_at is null and ev.type = 'freeze' and ev.start_date between current_date and current_date + 7
  loop
    for v_user in
      select m.user_id from public.program_members m where m.program_id = r.program_id and m.role in ('owner', 'collaborator')
    loop
      perform private.notify(v_user, r.program_id, 'freeze',
        'Se viene un congelamiento: ' || r.name,
        'Desde el ' || to_char(r.start_date, 'DD/MM') || ' no se lanza nada nuevo. Lo que vaya a arrancar, que arranque antes.',
        '/programas/' || r.program_id || '/tableros/gantt', 'freeze:' || r.id);
    end loop;
  end loop;

  -- Lunes: recordatorio de carga si faltan valores de la semana pasada.
  if extract(isodow from current_date) = 1 then
    for r in
      select pr.id as program_id, count(*) as missing from public.programs pr
      join public.metrics mt on mt.program_id = pr.id and mt.deleted_at is null
      where pr.deleted_at is null and pr.is_demo = false
        and v_last_monday between coalesce(pr.start_date, v_last_monday) and coalesce(pr.end_date, v_last_monday)
        and not exists (
          select 1 from public.metric_values mv where mv.metric_id = mt.id and mv.week_start = v_last_monday and mv.deleted_at is null
        )
      group by pr.id
    loop
      for v_user in
        select m.user_id from public.program_members m where m.program_id = r.program_id and m.role in ('owner', 'collaborator')
      loop
        perform private.notify(v_user, r.program_id, 'load_reminder',
          'Toca cargar la semana',
          'Faltan ' || r.missing || ' valor(es) de la semana del ' || to_char(v_last_monday, 'DD/MM') || '. Del dato al camino.',
          '/programas/' || r.program_id || '/carga?semana=' || v_last_monday, 'load:' || r.program_id || ':' || v_last_monday);
      end loop;
    end loop;
  end if;

  select count(*) into v_after from public.notifications;
  return v_after - v_before;
end;
$$;

revoke all on function public.generate_daily_notifications() from public, anon, authenticated;
grant execute on function public.generate_daily_notifications() to service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
