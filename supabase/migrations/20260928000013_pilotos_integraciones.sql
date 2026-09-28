-- =============================================================================
-- Pilotos · integraciones por MCP (preparado, apagado)
-- Nada de esto se usa hasta PILOTS_MCP_ENABLED=true en el servidor y una conexión
-- con token. Ver docs/pilotos/integraciones.md.
-- =============================================================================
-- · Una conexión por plataforma y cuenta. El token NUNCA vive aquí: está en
--   Supabase Vault y solo lo leen funciones que ejecuta el servidor.
-- · Cada extracción deja un snapshot con la consulta, la respuesta cruda de la
--   herramienta MCP y el JSON validado: toda cifra se rastrea hasta su origen.
-- -----------------------------------------------------------------------------
create table public.pilot_integration_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google_ads', 'ga4', 'tiktok', 'gtm')),
  account_label text not null check (length(trim(account_label)) between 1 and 120),
  account_ref text,
  vault_secret_id uuid,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'expired', 'error')),
  expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (provider, account_ref)
);

create table public.pilot_snapshots (
  id uuid primary key default gen_random_uuid(),
  -- Null en el sync diario de la cuenta (ad_facts) y en "Probar conexión".
  pilot_id uuid references public.pilots (id) on delete cascade,
  connection_id uuid references public.pilot_integration_connections (id) on delete set null,
  source text not null,
  account_ref text,
  date_from date,
  date_to date,
  query jsonb not null default '{}'::jsonb,
  raw_tool_result jsonb,
  validated jsonb,
  status text not null check (status in ('ok', 'invalid', 'error')),
  attempts smallint not null default 1,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);
create index pilot_snapshots_pilot_idx on public.pilot_snapshots (pilot_id, created_at desc);

alter table public.pilot_measurements
  add constraint pilot_measurements_snapshot_fk foreign key (snapshot_id) references public.pilot_snapshots (id) on delete set null;

-- Nadie mueve a mano la referencia al secreto ni el estado de conexión: lo hace el servidor.
create or replace function private.pilot_connections_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_service() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.vault_secret_id := null;
    new.status := 'disconnected';
  elsif new.vault_secret_id is distinct from old.vault_secret_id or (new.status = 'connected' and old.status <> 'connected') then
    raise exception 'La conexión se hace desde el servidor, con el token de la plataforma.';
  end if;
  return new;
end;
$$;

create trigger b_guard before insert or update on public.pilot_integration_connections
  for each row execute function private.pilot_connections_guard();

-- Token en Vault: solo el servidor (service_role) guarda y lee.
create or replace function private.set_integration_token(p_connection uuid, p_token text, p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.pilot_integration_connections;
  secret_id uuid;
begin
  if not private.is_service() then
    raise exception 'Solo el servidor guarda tokens de integración.';
  end if;
  select * into c from public.pilot_integration_connections where id = p_connection;
  if c.id is null then
    raise exception 'La conexión no existe.';
  end if;
  if c.vault_secret_id is null then
    secret_id := vault.create_secret(p_token, 'pilot_integration_' || c.id::text, 'Token de ' || c.provider || ' para Pilotos');
  else
    perform vault.update_secret(c.vault_secret_id, p_token);
    secret_id := c.vault_secret_id;
  end if;
  update public.pilot_integration_connections
  set vault_secret_id = secret_id, status = 'connected', expires_at = p_expires_at, last_error = null
  where id = c.id;
end;
$$;

create or replace function private.get_integration_token(p_connection uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token text;
begin
  if not private.is_service() then
    raise exception 'Solo el servidor lee tokens de integración.';
  end if;
  select s.decrypted_secret into token
  from public.pilot_integration_connections c
  join vault.decrypted_secrets s on s.id = c.vault_secret_id
  where c.id = p_connection;
  return token;
end;
$$;

revoke execute on function private.set_integration_token(uuid, text, timestamptz), private.get_integration_token(uuid) from public, anon, authenticated;
grant execute on function private.set_integration_token(uuid, text, timestamptz), private.get_integration_token(uuid) to service_role;

-- Envoltorios en public para llamarlos por la API con la secret key (y solo con ella).
create or replace function public.set_integration_token(p_connection uuid, p_token text, p_expires_at timestamptz default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.set_integration_token(p_connection, p_token, p_expires_at);
$$;

create or replace function public.get_integration_token(p_connection uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_integration_token(p_connection);
$$;

revoke execute on function public.set_integration_token(uuid, text, timestamptz), public.get_integration_token(uuid) from public, anon, authenticated;
grant execute on function public.set_integration_token(uuid, text, timestamptz), public.get_integration_token(uuid) to service_role;


create trigger set_updated_at before update on public.pilot_integration_connections
  for each row execute function private.set_updated_at();
create trigger z_audit after insert or update or delete on public.pilot_integration_connections
  for each row execute function private.pilot_audit_row();

alter table public.pilot_integration_connections enable row level security;
alter table public.pilot_snapshots enable row level security;
revoke all on public.pilot_integration_connections, public.pilot_snapshots from anon;
grant select, insert, update, delete on public.pilot_integration_connections to authenticated;
grant select on public.pilot_snapshots to authenticated;
revoke insert, update, delete on public.pilot_snapshots from authenticated;

-- Conexiones: todos ven el estado (nunca el token); el aprobador las administra.
create policy pilot_connections_select on public.pilot_integration_connections for select to authenticated using (private.pilot_can_read());
create policy pilot_connections_insert on public.pilot_integration_connections for insert to authenticated
  with check (private.pilot_is_approver() and vault_secret_id is null);
create policy pilot_connections_update on public.pilot_integration_connections for update to authenticated
  using (private.pilot_is_approver()) with check (private.pilot_is_approver());
create policy pilot_connections_delete on public.pilot_integration_connections for delete to authenticated
  using (private.pilot_is_approver());
-- Snapshots: todos los ven (trazabilidad); solo el servidor los escribe.
create policy pilot_snapshots_select on public.pilot_snapshots for select to authenticated using (private.pilot_can_read());
