-- =============================================================================
-- Gamificación («La Recua»): conteos por persona para los puntos y el escalafón.
--
-- Solo lectura. Devuelve CONTEOS por persona (nunca títulos, textos ni ids de
-- programas), así cualquiera puede ver el ranking sin saltarse el RLS del detalle.
-- No cuenta el programa de ejemplo ni lo que está en la papelera.
-- `p_since` = desde cuándo contar (null = desde siempre). Las reglas de puntos
-- viven en src/domain/gamification.ts.
-- =============================================================================
create or replace function public.gamification_stats(p_since timestamptz default null)
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
  trashed int
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
    -- Programa coronado: ya terminó y dejó al menos un ejercicio decidido. Se le abona a sus owners.
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
    -- Ideas quietas: siguen en Idea hace más de 30 días (esto no depende del periodo).
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
      where t.deleted_by = pr.id and t.program_id in (select p.id from public.programs p where not p.is_demo) and t.deleted_at >= s.t)
  from public.profiles pr
$$;

revoke all on function public.gamification_stats(timestamptz) from public, anon;
grant execute on function public.gamification_stats(timestamptz) to authenticated;

comment on function public.gamification_stats(timestamptz) is
  'La Recua: conteos de actividad por persona para puntos y escalafón. Solo conteos, sin detalle.';
