-- Perfiles para usuarios de Auth creados antes de que existiera el trigger
-- on_auth_user_created (por ejemplo, cuentas creadas desde el dashboard).
insert into public.profiles (id, email, name)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
