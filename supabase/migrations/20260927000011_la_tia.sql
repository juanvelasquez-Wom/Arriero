-- La Tía: copiloto de Arriero conectado a Claude.
-- · tia_messages: historial de "Pregúntele a la Tía" (cada persona ve solo el suyo).
-- · tia_usage: consumo por persona y función, para topes diarios y control de costos.
-- La llamada a Claude se hace desde el servidor (ANTHROPIC_API_KEY); aquí solo se guarda
-- lo que se conversó y cuánto se gastó.

create table if not exists public.tia_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index if not exists tia_messages_user_program_idx on public.tia_messages (user_id, program_id, created_at);

alter table public.tia_messages enable row level security;
revoke all on public.tia_messages from anon;
grant select, insert, delete on public.tia_messages to authenticated;

drop policy if exists tia_messages_select on public.tia_messages;
create policy tia_messages_select on public.tia_messages for select to authenticated
  using (user_id = auth.uid());
drop policy if exists tia_messages_insert on public.tia_messages;
create policy tia_messages_insert on public.tia_messages for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(program_id));
drop policy if exists tia_messages_delete on public.tia_messages;
create policy tia_messages_delete on public.tia_messages for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.tia_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  program_id uuid references public.programs (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index if not exists tia_usage_user_day_idx on public.tia_usage (user_id, created_at);

alter table public.tia_usage enable row level security;
revoke all on public.tia_usage from anon;
grant select, insert on public.tia_usage to authenticated;

-- Cada quien ve e inserta su propio consumo; el admin global ve todo (control de costos).
drop policy if exists tia_usage_select on public.tia_usage;
create policy tia_usage_select on public.tia_usage for select to authenticated
  using (user_id = auth.uid() or private.is_admin());
drop policy if exists tia_usage_insert on public.tia_usage;
create policy tia_usage_insert on public.tia_usage for insert to authenticated
  with check (user_id = auth.uid() and (program_id is null or private.is_member(program_id)));
