-- =============================================================================
-- QR Attendance Pro: kiosk access code (optional)
--
-- Run AFTER supabase/schema.sql. Safe to run again.
--
-- What it does
--   * An admin sets a kiosk code in the app (Settings -> Kiosk access).
--   * Once a code is set, a kiosk account can only read data or add scans from a
--     device that was activated with that code. The device receives a random key that
--     is kept in its browser; only the key's hash is stored here.
--   * Wrong codes are rate limited: 5 tries, then a 15 minute lock for that account.
--   * Changing or removing the code signs out every device. Admins can also revoke
--     single devices.
--   * Kiosk accounts get NO direct table access: they use the kiosk_* functions below,
--     which check the device key on every call. Admin accounts are not affected.
-- =============================================================================

-- ---------- Tables -----------------------------------------------------------

create table if not exists public.kiosk_access (
  id         int primary key default 1 check (id = 1),
  salt       text not null,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.kiosk_devices (
  id           text primary key,
  label        text not null default '',
  token_hash   text not null unique,
  user_id      uuid,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.kiosk_attempts (
  user_id      uuid primary key,
  failed       int not null default 0,
  locked_until timestamptz
);

alter table public.kiosk_access   enable row level security;
alter table public.kiosk_devices  enable row level security;
alter table public.kiosk_attempts enable row level security;

-- Admins can list and revoke devices. kiosk_access and kiosk_attempts have no policies
-- on purpose: only the functions below can touch them.
drop policy if exists "admin manage kiosk devices" on public.kiosk_devices;
create policy "admin manage kiosk devices" on public.kiosk_devices
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Helpers ----------------------------------------------------------

create or replace function public.is_kiosk() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users where user_id = auth.uid() and role = 'kiosk'
  );
$$;

create or replace function public.kiosk_code_set() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.kiosk_access where id = 1);
$$;

create or replace function public.kiosk_hash(p_token text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- True when the call may use kiosk data: admins always, everyone while no code is set,
-- otherwise only with the key of an activated device.
create or replace function public.kiosk_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or not public.kiosk_code_set()
      or (p_token is not null
          and exists (select 1 from public.kiosk_devices
                       where token_hash = public.kiosk_hash(p_token)));
$$;

-- Same definition as in schema.sql (keep them identical). Kiosk accounts only keep direct
-- table access while NO kiosk code is set.
create or replace function public.is_staff() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_admin() then
    return true;
  end if;
  if not exists (select 1 from public.app_users where user_id = auth.uid() and role = 'kiosk') then
    return false;
  end if;
  if to_regclass('public.kiosk_access') is not null then
    return not exists (select 1 from public.kiosk_access where id = 1);
  end if;
  return true;
end;
$$;

-- ---------- Functions used by the app ------------------------------------------

-- Is a code required, and is this device authorised? (Also records "last seen".)
create or replace function public.kiosk_status(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  if not (public.is_admin() or public.is_kiosk()) then
    raise exception 'not authorized';
  end if;
  ok := public.kiosk_token_ok(p_token);
  if ok and p_token is not null then
    update public.kiosk_devices
       set last_seen_at = now()
     where token_hash = public.kiosk_hash(p_token);
  end if;
  return jsonb_build_object(
    'installed', true,
    'codeRequired', public.kiosk_code_set(),
    'deviceOk', ok
  );
end;
$$;

-- Activate this device with the kiosk code. Returns the device key once.
create or replace function public.activate_kiosk(p_code text, p_label text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  acc     public.kiosk_access;
  att     public.kiosk_attempts;
  has_att boolean;
  n       int;
  tok     text;
begin
  if not (public.is_admin() or public.is_kiosk()) then
    return jsonb_build_object('ok', false, 'error', 'This account cannot activate a kiosk.');
  end if;

  select * into acc from public.kiosk_access where id = 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No kiosk code is set, so no activation is needed.');
  end if;

  select * into att from public.kiosk_attempts where user_id = uid;
  has_att := found;
  if has_att and att.locked_until is not null and att.locked_until > now() then
    return jsonb_build_object('ok', false, 'error',
      'Too many wrong codes. Try again in ' ||
      greatest(1, ceil(extract(epoch from (att.locked_until - now())) / 60)::int) || ' minute(s).');
  end if;

  if encode(sha256(convert_to(acc.salt || btrim(coalesce(p_code, '')), 'UTF8')), 'hex') <> acc.code_hash then
    if not has_att then
      n := 1;
      insert into public.kiosk_attempts (user_id, failed, locked_until) values (uid, 1, null);
    else
      n := case
             when att.locked_until is not null and att.locked_until <= now() then 1
             else att.failed + 1
           end;
      update public.kiosk_attempts
         set failed = n,
             locked_until = case when n >= 5 then now() + interval '15 minutes' else null end
       where user_id = uid;
    end if;
    return jsonb_build_object('ok', false, 'error',
      case when n >= 5 then 'Too many wrong codes. Locked for 15 minutes.' else 'Incorrect kiosk code.' end);
  end if;

  delete from public.kiosk_attempts where user_id = uid;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.kiosk_devices (id, label, token_hash, user_id)
  values (
    replace(gen_random_uuid()::text, '-', ''),
    left(coalesce(nullif(btrim(p_label), ''), 'Kiosk device'), 80),
    public.kiosk_hash(tok),
    uid
  );
  return jsonb_build_object('ok', true, 'token', tok);
end;
$$;

-- Admin: set the kiosk code (6+ characters) or clear it with an empty value.
-- Either way every activated device is signed out.
create or replace function public.set_kiosk_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c text := btrim(coalesce(p_code, ''));
  s text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the kiosk code.';
  end if;

  if c = '' then
    delete from public.kiosk_access where id = 1;
    delete from public.kiosk_devices;
    delete from public.kiosk_attempts;
    return jsonb_build_object('ok', true, 'codeSet', false);
  end if;
  if length(c) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Use at least 6 characters.');
  end if;

  s := replace(gen_random_uuid()::text, '-', '');
  insert into public.kiosk_access (id, salt, code_hash, updated_at)
  values (1, s, encode(sha256(convert_to(s || c, 'UTF8')), 'hex'), now())
  on conflict (id) do update
    set salt = excluded.salt, code_hash = excluded.code_hash, updated_at = now();
  delete from public.kiosk_devices;
  delete from public.kiosk_attempts;
  return jsonb_build_object('ok', true, 'codeSet', true);
end;
$$;

-- Everything a kiosk needs, in one call: employees, the last 3 days of attendance,
-- settings, the schedule around today and the repeat patterns.
create or replace function public.kiosk_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_kiosk()) then
    raise exception 'not authorized';
  end if;
  if not public.kiosk_token_ok(p_token) then
    raise exception 'device not authorized';
  end if;
  if p_token is not null then
    update public.kiosk_devices
       set last_seen_at = now()
     where token_hash = public.kiosk_hash(p_token);
  end if;

  return jsonb_build_object(
    'employees', coalesce((select jsonb_agg(to_jsonb(e)) from public.employees e), '[]'::jsonb),
    'records',   coalesce((select jsonb_agg(to_jsonb(r)) from public.attendance_records r
                            where r.ts >= now() - interval '3 days'), '[]'::jsonb),
    'settings',  coalesce((select a.data from public.app_settings a where a.id = 1), '{}'::jsonb),
    'schedule',  coalesce((select jsonb_agg(to_jsonb(s)) from public.schedule_entries s
                            where s.day between current_date - 3 and current_date + 3), '[]'::jsonb),
    'patterns',  coalesce((select jsonb_agg(to_jsonb(p)) from public.schedule_patterns p), '[]'::jsonb)
  );
end;
$$;

-- A kiosk saves a scan (a duplicate id is ignored, so retries are safe).
create or replace function public.kiosk_record(p_token text, p_record jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_kiosk()) then
    raise exception 'not authorized';
  end if;
  if not public.kiosk_token_ok(p_token) then
    raise exception 'device not authorized';
  end if;

  insert into public.attendance_records
    (id, employee_id, employee_name, employee_code, department, type, status, shift_id,
     work_date, unscheduled, edited, ts, source, note)
  select r.id, r.employee_id, r.employee_name, r.employee_code, r.department, r.type, r.status,
         r.shift_id, r.work_date, coalesce(r.unscheduled, false), false, r.ts,
         coalesce(r.source, 'qr'), coalesce(r.note, '')
    from jsonb_populate_record(null::public.attendance_records, p_record) r
  on conflict (id) do nothing;
  return true;
end;
$$;

-- "Awaiting approval" check for a badge whose signup is still pending.
create or replace function public.kiosk_pending_token(p_token text, p_badge text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_kiosk()) then
    return false;
  end if;
  if not public.kiosk_token_ok(p_token) then
    return false;
  end if;
  return exists (select 1 from public.pending_signups where badge_token = p_badge);
end;
$$;

-- ---------- Who may call what ------------------------------------------------

revoke all on function public.is_kiosk()                      from public;
revoke all on function public.kiosk_code_set()                from public;
revoke all on function public.kiosk_hash(text)                from public;
revoke all on function public.kiosk_token_ok(text)            from public;
revoke all on function public.kiosk_status(text)              from public;
revoke all on function public.activate_kiosk(text, text)      from public;
revoke all on function public.set_kiosk_code(text)            from public;
revoke all on function public.kiosk_load(text)                from public;
revoke all on function public.kiosk_record(text, jsonb)       from public;
revoke all on function public.kiosk_pending_token(text, text) from public;

grant execute on function public.kiosk_status(text)              to authenticated;
grant execute on function public.activate_kiosk(text, text)      to authenticated;
grant execute on function public.set_kiosk_code(text)            to authenticated;
grant execute on function public.kiosk_load(text)                to authenticated;
grant execute on function public.kiosk_record(text, jsonb)       to authenticated;
grant execute on function public.kiosk_pending_token(text, text) to authenticated;
