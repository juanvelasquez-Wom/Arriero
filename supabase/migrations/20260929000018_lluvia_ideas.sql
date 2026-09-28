-- =============================================================================
-- Lluvia de ideas («aguaceros»).
--
-- Un aguacero es una sesión de brainstorming con un reto («¿Cómo subimos las
-- portabilidades en diciembre?»). Pasa por tres fases, solo por RPC:
--   open    → llueven ideas (cualquiera con sesión anota)
--   voting  → se puntúan (impacto y facilidad de 1 a 5, y hasta 3 favoritas)
--   closed  → se ve el podio y quien lo creó (o un admin) decide qué se vuelve
--             proyecto, piloto o insight, y qué se va al cementerio.
-- Global (fuera de los programas) y visible para todas las personas con sesión.
-- Los puntajes son a ciegas: cada quien ve los suyos hasta que se cierra.
--
-- Además redefine public.gamification_stats (017) para sumar las ideas a La Recua.
-- =============================================================================

create table if not exists public.idea_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 5 and 200),
  context text check (context is null or char_length(context) <= 2000),
  line_hint text check (line_hint is null or char_length(line_hint) <= 80),
  deadline date,
  phase text not null default 'open' check (phase in ('open', 'voting', 'closed')),
  phase_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index if not exists idea_sessions_recent_idx on public.idea_sessions (created_at desc) where deleted_at is null;
create index if not exists idea_sessions_author_idx on public.idea_sessions (created_by);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.idea_sessions (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 200),
  detail text check (detail is null or char_length(detail) <= 2000),
  -- Solo cambia cómo se muestra: el autor siempre queda guardado.
  anonymous boolean not null default false,
  -- La decisión y lo que nació de la idea. Se fijan solo por RPC.
  decision text check (decision in ('project', 'pilot', 'insight', 'buried')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  program_id uuid references public.programs (id) on delete set null,
  pilot_id uuid references public.pilots (id) on delete set null,
  insight_id uuid references public.insights (id) on delete set null,
  linked_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);
create index if not exists ideas_session_idx on public.ideas (session_id) where deleted_at is null;
create index if not exists ideas_author_idx on public.ideas (created_by);

create table if not exists public.idea_scores (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  impact smallint check (impact between 1 and 5),
  ease smallint check (ease between 1 and 5),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
create index if not exists idea_scores_user_idx on public.idea_scores (user_id);

drop trigger if exists set_updated_at on public.idea_sessions;
create trigger set_updated_at before update on public.idea_sessions for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.ideas;
create trigger set_updated_at before update on public.ideas for each row execute function private.set_updated_at();
drop trigger if exists set_updated_at on public.idea_scores;
create trigger set_updated_at before update on public.idea_scores for each row execute function private.set_updated_at();

-- Guarda del aguacero: la fase, el autor y el borrado solo cambian por RPC.
create or replace function private.idea_sessions_guard()
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
    raise exception 'Quien armó el aguacero no se cambia.';
  end if;
  if new.phase is distinct from old.phase or new.phase_changed_at is distinct from old.phase_changed_at
     or new.closed_at is distinct from old.closed_at then
    raise exception 'La fase del aguacero se cambia con los botones de la sesión (abrir, votar, cerrar).';
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Un aguacero se borra con «Borrar el aguacero».';
  end if;
  return new;
end;
$$;
drop trigger if exists a_idea_sessions_guard on public.idea_sessions;
create trigger a_idea_sessions_guard before update on public.idea_sessions for each row execute function private.idea_sessions_guard();

-- Guarda de la idea: autor, sesión, decisión, vínculos y borrado solo por RPC;
-- el texto solo se corrige mientras llueve.
create or replace function private.ideas_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_service() or private.guard_bypassed() then
    return new;
  end if;
  if new.created_by is distinct from old.created_by or new.session_id is distinct from old.session_id then
    raise exception 'El autor y el aguacero de una idea no se cambian.';
  end if;
  if new.decision is distinct from old.decision or new.decision_note is distinct from old.decision_note
     or new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at
     or new.program_id is distinct from old.program_id or new.pilot_id is distinct from old.pilot_id
     or new.insight_id is distinct from old.insight_id or new.linked_at is distinct from old.linked_at then
    raise exception 'Lo que pasa con una idea lo decide quien armó el aguacero, al cerrarlo.';
  end if;
  if new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by then
    raise exception 'Una idea se borra con «Borrar la idea».';
  end if;
  if (new.title is distinct from old.title or new.detail is distinct from old.detail or new.anonymous is distinct from old.anonymous)
     and not exists (select 1 from public.idea_sessions s where s.id = new.session_id and s.phase = 'open') then
    raise exception 'Las ideas se corrigen mientras llueve. Este aguacero ya escampó.';
  end if;
  return new;
end;
$$;
drop trigger if exists a_ideas_guard on public.ideas;
create trigger a_ideas_guard before update on public.ideas for each row execute function private.ideas_guard();

alter table public.idea_sessions enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_scores enable row level security;
revoke all on public.idea_sessions, public.ideas, public.idea_scores from anon;
grant select, insert, update on public.idea_sessions to authenticated;
grant select, insert, update on public.ideas to authenticated;
-- Los puntajes se escriben solo con la RPC score_idea.
revoke insert, update, delete on public.idea_scores from authenticated;
grant select on public.idea_scores to authenticated;

drop policy if exists idea_sessions_select on public.idea_sessions;
create policy idea_sessions_select on public.idea_sessions for select to authenticated using (deleted_at is null);
drop policy if exists idea_sessions_insert on public.idea_sessions;
create policy idea_sessions_insert on public.idea_sessions for insert to authenticated
  with check (created_by = auth.uid() and phase = 'open' and closed_at is null and deleted_at is null);
drop policy if exists idea_sessions_update on public.idea_sessions;
create policy idea_sessions_update on public.idea_sessions for update to authenticated
  using (deleted_at is null and (created_by = auth.uid() or private.is_admin()))
  with check (created_by = auth.uid() or private.is_admin());

drop policy if exists ideas_select on public.ideas;
create policy ideas_select on public.ideas for select to authenticated
  using (deleted_at is null and exists (select 1 from public.idea_sessions s where s.id = session_id and s.deleted_at is null));
-- Anotar: cualquiera con sesión, mientras el aguacero esté abierto.
drop policy if exists ideas_insert on public.ideas;
create policy ideas_insert on public.ideas for insert to authenticated
  with check (
    created_by = auth.uid() and decision is null and decided_by is null and program_id is null and pilot_id is null
    and insight_id is null and deleted_at is null
    and exists (select 1 from public.idea_sessions s where s.id = session_id and s.deleted_at is null and s.phase = 'open')
  );
drop policy if exists ideas_update on public.ideas;
create policy ideas_update on public.ideas for update to authenticated
  using (deleted_at is null and (created_by = auth.uid() or private.is_admin()))
  with check (created_by = auth.uid() or private.is_admin());

-- A ciegas: cada quien ve sus puntajes; los de los demás aparecen al cerrar.
drop policy if exists idea_scores_select on public.idea_scores;
create policy idea_scores_select on public.idea_scores for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.ideas i join public.idea_sessions s on s.id = i.session_id
      where i.id = idea_id and s.phase = 'closed'
    )
  );

-- -----------------------------------------------------------------------------
-- RPC
-- -----------------------------------------------------------------------------

-- Cambiar la fase: quien armó el aguacero o un admin. Adelante o un paso atrás.
create or replace function public.set_idea_session_phase(p_session uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_phase text;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para mover el aguacero.';
  end if;
  select s.created_by, s.phase into v_owner, v_phase from public.idea_sessions s where s.id = p_session and s.deleted_at is null;
  if v_owner is null then
    raise exception 'El aguacero no existe o fue borrado.';
  end if;
  if v_owner <> auth.uid() and not private.is_admin() then
    raise exception 'Solo quien armó el aguacero (o un admin) cambia la fase.';
  end if;
  if p_phase not in ('open', 'voting', 'closed') then
    raise exception 'Fase inválida.';
  end if;
  if p_phase = v_phase then
    return;
  end if;
  if not ((v_phase = 'open' and p_phase = 'voting') or (v_phase = 'voting' and p_phase in ('open', 'closed'))
          or (v_phase = 'closed' and p_phase = 'voting')) then
    raise exception 'Ese salto no se puede: el aguacero va de «Llueven ideas» a «A puntuar» y de ahí a «Se decidió».';
  end if;
  if p_phase = 'voting' and v_phase = 'open'
     and not exists (select 1 from public.ideas i where i.session_id = p_session and i.deleted_at is null) then
    raise exception 'Sin ideas no hay qué puntuar. Que llueva primero.';
  end if;
  if v_phase = 'closed' and exists (
    select 1 from public.ideas i where i.session_id = p_session and i.deleted_at is null and i.linked_at is not null
  ) then
    raise exception 'Ya hay ideas convertidas en proyecto, piloto o insight: el aguacero no se reabre.';
  end if;
  perform private.bypass_guard();
  update public.idea_sessions set
    phase = p_phase,
    phase_changed_at = now(),
    closed_at = case when p_phase = 'closed' then now() else null end
  where id = p_session;
end;
$$;
revoke all on function public.set_idea_session_phase(uuid, text) from public, anon;
grant execute on function public.set_idea_session_phase(uuid, text) to authenticated;

-- Puntuar: solo en «A puntuar», nunca la idea propia, y máximo 3 favoritas por aguacero.
-- Un valor nulo deja lo que había (así cada toque guarda solo lo que cambió).
create or replace function public.score_idea(p_idea uuid, p_impact int default null, p_ease int default null, p_favorite boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_author uuid;
  v_phase text;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para puntuar.';
  end if;
  select i.session_id, i.created_by, s.phase into v_session, v_author, v_phase
  from public.ideas i join public.idea_sessions s on s.id = i.session_id and s.deleted_at is null
  where i.id = p_idea and i.deleted_at is null;
  if v_session is null then
    raise exception 'La idea no existe o fue borrada.';
  end if;
  if v_phase <> 'voting' then
    raise exception 'Todavía no se puntúa: primero que llueva, después se vota.';
  end if;
  if v_author = auth.uid() then
    raise exception 'A la mamá no se le pregunta si el hijo es bonito: sus ideas las puntúan los demás.';
  end if;
  if (p_impact is not null and p_impact not between 1 and 5) or (p_ease is not null and p_ease not between 1 and 5) then
    raise exception 'El puntaje va de 1 a 5.';
  end if;
  if coalesce(p_favorite, false) and (
    select count(*) from public.idea_scores sc join public.ideas i on i.id = sc.idea_id and i.deleted_at is null
    where sc.user_id = auth.uid() and sc.favorite and i.session_id = v_session and sc.idea_id <> p_idea
  ) >= 3 then
    raise exception 'Máximo 3 «¡Esta!» por aguacero. Quítele la estrella a otra primero.';
  end if;
  insert into public.idea_scores as sc (idea_id, user_id, impact, ease, favorite)
  values (p_idea, auth.uid(), p_impact, p_ease, coalesce(p_favorite, false))
  on conflict (idea_id, user_id) do update set
    impact = coalesce(excluded.impact, sc.impact),
    ease = coalesce(excluded.ease, sc.ease),
    favorite = coalesce(p_favorite, sc.favorite);
end;
$$;
revoke all on function public.score_idea(uuid, int, int, boolean) from public, anon;
grant execute on function public.score_idea(uuid, int, int, boolean) to authenticated;

-- Cuántas personas han puntuado (sin decir qué puntuaron).
create or replace function public.idea_session_progress(p_session uuid)
returns table (voters int, scores int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct sc.user_id)::int, count(*)::int
  from public.idea_scores sc
  join public.ideas i on i.id = sc.idea_id and i.deleted_at is null
  join public.idea_sessions s on s.id = i.session_id and s.deleted_at is null
  where i.session_id = p_session and auth.uid() is not null;
$$;
revoke all on function public.idea_session_progress(uuid) from public, anon;
grant execute on function public.idea_session_progress(uuid) to authenticated;

-- Decidir: quien armó el aguacero (o un admin), con el aguacero cerrado.
-- 'insight' crea el insight en el carriel de una vez y lo deja vinculado.
-- p_decision nulo revive la idea (si todavía no se convirtió en nada).
create or replace function public.decide_idea(p_idea uuid, p_decision text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea public.ideas%rowtype;
  v_session public.idea_sessions%rowtype;
  v_insight uuid;
  v_author text;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para decidir.';
  end if;
  select * into v_idea from public.ideas i where i.id = p_idea and i.deleted_at is null;
  if v_idea.id is null then
    raise exception 'La idea no existe o fue borrada.';
  end if;
  select * into v_session from public.idea_sessions s where s.id = v_idea.session_id and s.deleted_at is null;
  if v_session.id is null then
    raise exception 'El aguacero no existe o fue borrado.';
  end if;
  if v_session.created_by <> auth.uid() and not private.is_admin() then
    raise exception 'Solo quien armó el aguacero (o un admin) decide qué pasa con cada idea.';
  end if;
  if v_session.phase <> 'closed' then
    raise exception 'Primero cierre la votación: se decide con el podio a la vista.';
  end if;
  if p_decision is not null and p_decision not in ('project', 'pilot', 'insight', 'buried') then
    raise exception 'Decisión inválida.';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'La nota de la decisión va en máximo 500 caracteres.';
  end if;
  if v_idea.linked_at is not null and p_decision is distinct from v_idea.decision then
    raise exception 'Esa idea ya se volvió otra cosa: la decisión no se cambia.';
  end if;
  if p_decision = 'insight' and v_idea.insight_id is null then
    select coalesce(nullif(trim(pr.name), ''), split_part(pr.email, '@', 1)) into v_author
    from public.profiles pr where pr.id = v_idea.created_by;
    insert into public.insights (title, detail, source, created_by)
    values (
      left(case when char_length(trim(v_idea.title)) < 5 then v_idea.title || ' (idea)' else v_idea.title end, 200),
      left(concat_ws(E'\n\n', nullif(trim(v_idea.detail), ''),
        'Salió del aguacero «' || v_session.title || '»'
          || case when v_idea.anonymous then ', de un arriero tímido.' else ', idea de ' || coalesce(v_author, 'alguien') || '.' end), 4000),
      'team',
      auth.uid()
    )
    returning id into v_insight;
  end if;
  perform private.bypass_guard();
  update public.ideas set
    decision = p_decision,
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    decided_by = case when p_decision is null then null else auth.uid() end,
    decided_at = case when p_decision is null then null else now() end,
    insight_id = coalesce(v_insight, insight_id),
    linked_at = case when v_insight is not null then now() else linked_at end
  where id = p_idea;
  return v_insight;
end;
$$;
revoke all on function public.decide_idea(uuid, text, text) from public, anon;
grant execute on function public.decide_idea(uuid, text, text) to authenticated;

-- Vincular lo que nació: el programa (idea decidida como proyecto) o el piloto
-- (idea decidida como piloto). Lo llama quien lo creó, como con los insights.
create or replace function public.link_idea(p_idea uuid, p_program uuid default null, p_pilot uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision text;
begin
  if auth.uid() is null then
    raise exception 'Inicie sesión para vincular la idea.';
  end if;
  if (p_program is not null)::int + (p_pilot is not null)::int <> 1 then
    raise exception 'Elija un solo destino para la idea: un programa o un piloto.';
  end if;
  select i.decision into v_decision from public.ideas i
  join public.idea_sessions s on s.id = i.session_id and s.deleted_at is null
  where i.id = p_idea and i.deleted_at is null;
  if not found then
    raise exception 'La idea no existe o fue borrada.';
  end if;
  if p_program is not null then
    if v_decision is distinct from 'project' then
      raise exception 'Esa idea no se decidió como proyecto.';
    end if;
    if not exists (select 1 from public.programs p where p.id = p_program and p.deleted_at is null) then
      raise exception 'El programa no existe o fue borrado.';
    end if;
    if not (private.is_member(p_program) or private.is_admin()) then
      raise exception 'Usted no es miembro de ese programa.';
    end if;
  end if;
  if p_pilot is not null then
    if v_decision is distinct from 'pilot' then
      raise exception 'Esa idea no se decidió como piloto.';
    end if;
    if not exists (select 1 from public.pilots pi where pi.id = p_pilot and pi.deleted_at is null) then
      raise exception 'El piloto no existe o fue borrado.';
    end if;
    if private.pilot_role() is null then
      raise exception 'Usted no tiene rol en Pilotos.';
    end if;
  end if;
  perform private.bypass_guard();
  update public.ideas set
    program_id = coalesce(p_program, program_id),
    pilot_id = coalesce(p_pilot, pilot_id),
    linked_at = now()
  where id = p_idea;
end;
$$;
revoke all on function public.link_idea(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_idea(uuid, uuid, uuid) to authenticated;

-- Borrar una idea (lógico): su autor, quien armó el aguacero o un admin.
create or replace function public.delete_idea(p_idea uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ideas i join public.idea_sessions s on s.id = i.session_id
    where i.id = p_idea and i.deleted_at is null
      and (i.created_by = auth.uid() or s.created_by = auth.uid() or private.is_admin())
  ) then
    raise exception 'Solo quien anotó la idea, quien armó el aguacero o un admin la puede borrar.';
  end if;
  if exists (select 1 from public.ideas i where i.id = p_idea and i.linked_at is not null) then
    raise exception 'Esa idea ya se volvió proyecto, piloto o insight: no se borra.';
  end if;
  perform private.bypass_guard();
  update public.ideas set deleted_at = now(), deleted_by = auth.uid() where id = p_idea;
end;
$$;
revoke all on function public.delete_idea(uuid) from public, anon;
grant execute on function public.delete_idea(uuid) to authenticated;

-- Borrar un aguacero (lógico): quien lo armó o un admin.
create or replace function public.delete_idea_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.idea_sessions s
    where s.id = p_session and s.deleted_at is null and (s.created_by = auth.uid() or private.is_admin())
  ) then
    raise exception 'Solo quien armó el aguacero (o un admin) lo puede borrar.';
  end if;
  perform private.bypass_guard();
  update public.idea_sessions set deleted_at = now(), deleted_by = auth.uid() where id = p_session;
end;
$$;
revoke all on function public.delete_idea_session(uuid) from public, anon;
grant execute on function public.delete_idea_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- La Recua: las ideas también suman.
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
  insight_votes_given int,
  ideas_created int,
  idea_sessions_created int,
  ideas_scored int,
  ideas_chosen int,
  ideas_buried int
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
  ),
  live_ideas as (
    select i.* from public.ideas i
    join public.idea_sessions s on s.id = i.session_id and s.deleted_at is null
    where i.deleted_at is null
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
      where iv.user_id = pr.id and i.created_by <> pr.id and iv.created_at >= s.t),
    -- Lluvia de ideas.
    (select count(*)::int from live_ideas i, since s where i.created_by = pr.id and i.created_at >= s.t),
    (select count(*)::int from public.idea_sessions ss, since s
      where ss.created_by = pr.id and ss.deleted_at is null and ss.created_at >= s.t),
    (select count(*)::int from public.idea_scores sc join live_ideas i on i.id = sc.idea_id, since s
      where sc.user_id = pr.id and sc.created_at >= s.t),
    -- Elegida: le cuenta a quien la anotó (proyecto, piloto o insight).
    (select count(*)::int from live_ideas i, since s
      where i.created_by = pr.id and i.decision in ('project', 'pilot', 'insight') and i.decided_at >= s.t),
    (select count(*)::int from live_ideas i, since s
      where i.created_by = pr.id and i.decision = 'buried' and i.decided_at >= s.t)
  from public.profiles pr
$$;
revoke all on function public.gamification_stats(timestamptz) from public, anon;
grant execute on function public.gamification_stats(timestamptz) to authenticated;
comment on function public.gamification_stats(timestamptz) is
  'La Recua: conteos de actividad por persona para puntos y escalafón. Solo conteos, sin detalle.';
