-- =============================================================================
-- QR Attendance Pro: account management functions only
--
-- A small script for when Settings -> Accounts says to run schema.sql again. It creates
-- just the three admin functions that screen needs (it is the same text as in schema.sql,
-- and safe to run more than once). It needs schema.sql to have been run before, because
-- it relies on the is_admin() function and the app_users table.
-- =============================================================================

-- Admin: every login account, including new ones that do not have a role yet.
create or replace function public.list_all_accounts()
returns table (user_id uuid, email text, role text, branch_id text, display_name text,
               created_at timestamptz, last_sign_in_at timestamptz, is_me boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list accounts.';
  end if;
  return query
    select a.id,
           a.email::text,
           u.role,
           u.branch_id,
           coalesce(a.raw_user_meta_data->>'display_name', ''),
           a.created_at,
           a.last_sign_in_at,
           (a.id = auth.uid())
      from auth.users a
      left join public.app_users u on u.user_id = a.id
     order by (u.role is null) desc, a.created_at desc;
end;
$$;

-- Admin: approve an account (give it a role) or change its role.
-- You cannot change your own role, and there must always be at least one admin.
create or replace function public.set_account_role(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  other_admins int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change accounts.';
  end if;
  if p_role not in ('admin', 'kiosk') then
    return jsonb_build_object('ok', false, 'error', 'The role must be admin or kiosk.');
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'That account does not exist.');
  end if;
  if p_user = auth.uid() and p_role <> 'admin' then
    return jsonb_build_object('ok', false, 'error', 'You cannot change your own role.');
  end if;
  if p_role <> 'admin' and exists (select 1 from public.app_users where user_id = p_user and role = 'admin') then
    select count(*) into other_admins from public.app_users where role = 'admin' and user_id <> p_user;
    if other_admins = 0 then
      return jsonb_build_object('ok', false, 'error', 'There must be at least one admin.');
    end if;
  end if;

  insert into public.app_users (user_id, role) values (p_user, p_role)
  on conflict (user_id) do update set role = excluded.role;
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: take an account's access away (it goes back to "waiting for a role").
-- The login itself is not deleted; do that in Supabase under Authentication -> Users.
create or replace function public.remove_account_access(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  other_admins int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change accounts.';
  end if;
  if p_user = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'You cannot remove your own access.');
  end if;
  if exists (select 1 from public.app_users where user_id = p_user and role = 'admin') then
    select count(*) into other_admins from public.app_users where role = 'admin' and user_id <> p_user;
    if other_admins = 0 then
      return jsonb_build_object('ok', false, 'error', 'There must be at least one admin.');
    end if;
  end if;
  delete from public.app_users where user_id = p_user;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.list_all_accounts()                  from public;
revoke all on function public.set_account_role(uuid, text)         from public;
revoke all on function public.remove_account_access(uuid)          from public;
grant execute on function public.list_all_accounts()                  to authenticated;
grant execute on function public.set_account_role(uuid, text)         to authenticated;
grant execute on function public.remove_account_access(uuid)          to authenticated;

-- Make the API pick up the new functions straight away.
notify pgrst, 'reload schema';

-- Shows the three functions, so you can see it worked.
select proname as created_function
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('list_all_accounts', 'set_account_role', 'remove_account_access')
 order by proname;
