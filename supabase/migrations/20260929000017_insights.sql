-- =============================================================================
-- Repositorio de insights («El carriel de insights»).
--
-- Un insight es una observación con su fuente («me di cuenta de que…»), global
-- (fuera de los programas) y visible para todas las personas con sesión. De un
-- insight nacen problemas, programas o pilotos: el vínculo queda guardado y el
-- insight pasa a «Sembrado».
--
-- Además redefine public.gamification_stats (016) para sumar los insights a
-- La Recua. Si la 016 no se aplicó, esta la crea igual.
-- =============================================================================

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 5 and 200),
  detail text check (detail is null or char_length(detail) <= 4000),
  source text not null default 'data'
    check (source in ('data', 'customer', 'competition', 'team', 'market', 'hunch')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 500),
  line_hint text check (line_hint is null or char_length(line_hint) <= 80),
  stage text check (stage in ('acquisition', 'activation', 'conversion', 'retention')),
  channel text check (channel is null or char_length(channel) <= 80),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  status text not null default 'new' check (status in ('new', 'validated', 'planted', 'archived')),
  -- Lo que sembró. Se fijan solo por la RPC link_insight.
  program_id uuid references public.programs (id) on delete set null,
  problem_id uuid references public.problems (id) on delete set null,
  pilot_id uuid references public.pilots (id) on delete set null,
  planted_by uuid references public.profiles (id) on delete set null,
  planted_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index if not exists insights_recent_idx on public.insights (created_at desc) where deleted_at is null;
create index if not exists insights_author_idx on public.insights (created_by);

create table if not exists public.insight_votes (
  insight_id uuid not null references public.insights (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (insight_id, user_id)
);
create index if not exists insight_votes_user_idx on public.insight_votes (user_id);

drop trigger if exists set_updated_at on public.insights;
create trigger set_updated_at before update on public.insights for each row execute function private.set_updated_at();

-- Guarda: el vínculo con lo sembrado y el autor no se cambian con un update directo.
create or replace function private.insights_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'El autor de un insight no se cambia.';
  end if;
  if new.program_id is distinct from old.program_id or new.problem_id is distinct from old.problem_id
     or new.pilot_id is distinct from old.pilot_id or new.planted_by is distinct from old.planted_by
     or new.planted_at is distinct from old.planted_at then
    raise exception 'Lo que sembró un insight se registra desde «Convertir en problema», «Armar proyecto» o «Crear piloto».';
  end if;
  if new.status = 'planted' and old.status <> 'planted' then
    raise exception 'Un insight queda «Sembrado» cuando se usa para un problema, un programa o un piloto.';
  end if;
  return new;
end;
$$;
drop trigger if exists a_insights_guard on public.insights;
create trigger a_insights_guard before update on public.insights for each row execute function private.insights_guard();

alter table public.insights enable row level security;
alter table public.insight_votes enable row level security;
revoke all on public.insights, public.insight_votes from anon;
grant select, insert, update on public.insights to authenticated;
grant select, insert, delete on public.insight_votes to authenticated;

drop policy if exists insights_select on public.insights;
create policy insights_select on public.insights for select to authenticated using (deleted_at is null);
drop policy if exists insights_insert on public.insights;
create policy insights_insert on public.insights for insert to authenticated
  with check (created_by = auth.uid() and status in ('new', 'validated') and program_id is null and problem_id is null and pilot_id is null);
-- Editar, validar, archivar o borrar (deleted_at): quien lo escribió o un admin.
drop policy if exists insights_update on public.insights;
create policy insights_update on public.insights for update to authenticated
  using (deleted_at is null and (created_by = auth.uid() or private.is_admin()))
  with check (created_by = auth.uid() or private.is_admin());

drop policy if exists insight_votes_select on public.insight_votes;
create policy insight_votes_select on public.insight_votes for select to authenticated using (true);
drop policy if exists insight_votes_insert on public.insight_votes;
create policy insight_votes_insert on public.insight_votes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.insights i where i.id = insight_id and i.deleted_at is null));
drop policy if exists insight_votes_delete on public.insight_votes;
create policy insight_votes_delete on public.insight_votes for delete to authenticated using (user_id = auth.uid());

-- Sembrar: cualquiera que pueda ver el destino (miembro del programa, o con rol en Pilotos)
-- vincula el insight y lo marca «Sembrado». Solo un destino por llamada.
create or replace function public.link_insight(p_insight uuid, p_program uuid default null, p_problem uuid default null, p_pilot uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid := p_program;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para sembrar un insight.';
  end if;
  if (p_program is not null)::int + (p_problem is not null)::int + (p_pilot is not null)::int <> 1 then
    raise exception 'Elija un solo destino para el insight: un programa, un problema o un piloto.';
  end if;
  if not exists (select 1 from public.insights i where i.id = p_insight and i.deleted_at is null) then
    raise exception 'El insight no existe o fue borrado.';
  end if;
  if p_problem is not null then
    select pr.program_id into v_program from public.problems pr where pr.id = p_problem and pr.deleted_at is null;
    if v_program is null then
      raise exception 'El problema no existe o fue borrado.';
    end if;
  end if;
  if v_program is not null and not (private.is_member(v_program) or private.is_admin()) then
    raise exception 'Usted no es miembro de ese programa.';
  end if;
  if p_pilot is not null then
    if not exists (select 1 from public.pilots pi where pi.id = p_pilot and pi.deleted_at is null) then
      raise exception 'El piloto no existe o fue borrado.';
    end if;
    if private.pilot_role() is null then
      raise exception 'Usted no tiene rol en Pilotos.';
    end if;
  end if;
  perform private.bypass_guard();
  update public.insights set
    status = 'planted',
    program_id = coalesce(v_program, program_id),
    problem_id = coalesce(p_problem, problem_id),
    pilot_id = coalesce(p_pilot, pilot_id),
    planted_by = auth.uid(),
    planted_at = now()
  where id = p_insight;
end;
$$;
revoke all on function public.link_insight(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.link_insight(uuid, uuid, uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- La Recua: los insights también suman.
-- -----------------------------------------------------------------------------
drop function if exists public.gamification_stats(timestamptz);
create function public.gamification_stats(p_since timestamptz default null)
returns table (
  user_id uuid,
  name text,
  days_used int,
  recent_days date[],
  programs_created int,
  programs_ready int,
  programs_crowned int,
  problems_created int,
  experiments_created int,
  experiments_decided int,
  winners int,
  losers int,
  scaled int,
  discarded int,
  stale_ideas int,
  learnings int,
  weeks_loaded int,
  comments int,
  pilots_created int,
  pilots_decided int,
  pilots_cancelled int,
  pilot_data_days int,
  trashed int,
  insights_created int,
  insights_planted int,
  insight_votes_received int,
  insight_votes_given int
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select coalesce(p_since, '-infinity'::timestamptz) as t,
           coalesce((p_since at time zone 'America/Bogota')::date, '-infinity'::date) as d
  ),
  real_programs as (
    select p.id from public.programs p where not p.is_demo and p.deleted_at is null
  ),
  exps as (
    select e.* from public.experiments e
    where e.deleted_at is null and e.program_id in (select id from real_programs)
  )
  select
    pr.id,
    coalesce(nullif(trim(pr.name), ''), split_part(pr.email, '@', 1)),
    (select count(distinct u.day)::int from public.usage_days u, since s where u.user_id = pr.id and u.day >= s.d),
    (select coalesce(array_agg(distinct u.day order by u.day desc), '{}') from public.usage_days u
      where u.user_id = pr.id and u.day >= ((now() at time zone 'America/Bogota')::date - 60)),
    (select count(*)::int from public.programs p, since s
      where p.created_by = pr.id and p.id in (select id from real_programs) and p.created_at >= s.t),
    (select count(*)::int from public.programs p, since s
      where p.created_by = pr.id and p.id in (select id from real_programs)
        and p.setup_completed_at is not null and p.setup_completed_at >= s.t),
    (select count(*)::int from public.programs p
      join public.program_members m on m.program_id = p.id and m.user_id = pr.id and m.role = 'owner', since s
      where p.id in (select id from real_programs)
        and p.end_date < (now() at time zone 'America/Bogota')::date
        and p.end_date >= s.d
        and exists (select 1 from exps e where e.program_id = p.id and e.status in ('decided', 'scaled'))),
    (select count(*)::int from public.problems x, since s
      where x.created_by = pr.id and x.deleted_at is null and x.program_id in (select id from real_programs) and x.created_at >= s.t),
    (select count(*)::int from exps e, since s where e.created_by = pr.id and e.created_at >= s.t),
    (select count(*)::int from exps e, since s where e.owner_id = pr.id and e.status in ('decided', 'scaled') and e.decided_at >= s.t),
    (select count(*)::int from exps e, since s where e.owner_id = pr.id and e.verdict = 'winner' and e.decided_at >= s.t),
    (select count(*)::int from exps e, since s where e.owner_id = pr.id and e.verdict = 'loser' and e.decided_at >= s.t),
    (select count(*)::int from exps e, since s where e.owner_id = pr.id and e.status = 'scaled' and e.status_changed_at >= s.t),
    (select count(*)::int from exps e, since s
      where coalesce(e.owner_id, e.created_by) = pr.id and e.status = 'discarded' and e.status_changed_at >= s.t),
    (select count(*)::int from exps e
      where coalesce(e.owner_id, e.created_by) = pr.id and e.status = 'idea' and e.status_changed_at < now() - interval '30 days'),
    (select count(*)::int from public.learnings l, since s
      where l.created_by = pr.id and l.deleted_at is null and l.program_id in (select id from real_programs) and l.created_at >= s.t)
      + (select count(*)::int from public.pilot_learnings pl
          join public.pilots pi on pi.id = pl.pilot_id and pi.deleted_at is null and not pi.is_example, since s
          where pl.created_by = pr.id and pl.created_at >= s.t),
    (select count(distinct v.week_start)::int from public.metric_values v, since s
      where v.entered_by = pr.id and v.deleted_at is null and v.program_id in (select id from real_programs) and v.created_at >= s.t),
    (select count(*)::int from public.experiment_comments c, since s
      where c.created_by = pr.id and c.program_id in (select id from real_programs) and c.created_at >= s.t),
    (select count(*)::int from public.pilots pi, since s
      where pi.created_by = pr.id and pi.deleted_at is null and not pi.is_example and pi.created_at >= s.t),
    (select count(*)::int from public.pilots pi, since s
      where coalesce(pi.decided_by, pi.owner_id) = pr.id and pi.status = 'decided' and pi.deleted_at is null
        and not pi.is_example and pi.decided_at >= s.t),
    (select count(*)::int from public.pilots pi, since s
      where pi.created_by = pr.id and pi.status = 'cancelled' and pi.deleted_at is null
        and not pi.is_example and pi.status_changed_at >= s.t),
    (select count(distinct (pm.created_at at time zone 'America/Bogota')::date)::int from public.pilot_measurements pm
      join public.pilots pi on pi.id = pm.pilot_id and pi.deleted_at is null and not pi.is_example, since s
      where pm.created_by = pr.id and pm.created_at >= s.t),
    (select count(*)::int from public.trash_items t, since s
      where t.deleted_by = pr.id and t.program_id in (select p.id from public.programs p where not p.is_demo) and t.deleted_at >= s.t),
    (select count(*)::int from public.insights i, since s
      where i.created_by = pr.id and i.deleted_at is null and i.created_at >= s.t),
    -- Sembrado: le cuenta a quien escribió el insight (lo que vio se volvió trabajo).
    (select count(*)::int from public.insights i, since s
      where i.created_by = pr.id and i.deleted_at is null and i.status = 'planted' and i.planted_at >= s.t),
    -- Votos que recibió de otras personas (los propios no cuentan).
    (select count(*)::int from public.insight_votes iv
      join public.insights i on i.id = iv.insight_id and i.deleted_at is null, since s
      where i.created_by = pr.id and iv.user_id <> pr.id and iv.created_at >= s.t),
    (select count(*)::int from public.insight_votes iv
      join public.insights i on i.id = iv.insight_id and i.deleted_at is null, since s
      where iv.user_id = pr.id and i.created_by <> pr.id and iv.created_at >= s.t)
  from public.profiles pr
$$;
revoke all on function public.gamification_stats(timestamptz) from public, anon;
grant execute on function public.gamification_stats(timestamptz) to authenticated;
comment on function public.gamification_stats(timestamptz) is
  'La Recua: conteos de actividad por persona para puntos y escalafón. Solo conteos, sin detalle.';

-- Borrar un insight (lógico): quien lo escribió o un admin.
create or replace function public.delete_insight(p_insight uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.insights i
    where i.id = p_insight and i.deleted_at is null and (i.created_by = auth.uid() or private.is_admin())
  ) then
    raise exception 'Solo quien escribió el insight (o un admin) lo puede borrar.';
  end if;
  perform private.bypass_guard();
  update public.insights set deleted_at = now(), deleted_by = auth.uid() where id = p_insight;
end;
$$;
revoke all on function public.delete_insight(uuid) from public, anon;
grant execute on function public.delete_insight(uuid) to authenticated;
