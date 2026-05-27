-- ============================================================================
-- Petbnb MVP — Step 4.5 — Admin RPC functions
-- Run AFTER 0004_admin_role.sql.
--
-- public.profiles is in the public schema and admins can SELECT it via the
-- is_admin() bypass we added in 0004. But the admin user-list UI also needs
-- each user's email and auth.users.created_at / last_sign_in_at — and the
-- auth schema isn't exposed via the PostgREST REST API.
--
-- Solution: a SECURITY DEFINER function that performs the join server-side
-- and self-gates with is_admin(). Granted EXECUTE to authenticated; the
-- internal check rejects everyone else.
-- ============================================================================

create or replace function public.admin_list_users()
returns table (
  id                  uuid,
  full_name           text,
  phone               text,
  role                text,
  avatar_url          text,
  nafath_verified     boolean,
  is_verified         boolean,
  is_suspended        boolean,
  profile_created_at  timestamptz,
  email               text,
  auth_created_at     timestamptz,
  last_sign_in_at     timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query
    select
      p.id,
      p.full_name,
      p.phone,
      p.role,
      p.avatar_url,
      p.nafath_verified,
      p.is_verified,
      p.is_suspended,
      p.created_at as profile_created_at,
      u.email::text,
      u.created_at as auth_created_at,
      u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
