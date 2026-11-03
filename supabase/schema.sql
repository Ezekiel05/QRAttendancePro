-- =============================================================================
-- QR Attendance Pro: shared database for Supabase
--
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing and refreshes the policies.
--
-- Roles
--   admin : full access (employees, schedule, settings, edit/delete attendance)
--   kiosk : scan-only account for a tablet (reads employees/schedule, adds attendance)
--   Everyone else (including people who are signed out) can only use the public
--   signup form, through the submit_signup() function below.
-- =============================================================================

-- ---------- Tables ----------------------------------------------------------

create table if not exists public.app_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    text not null check (role in ('admin', 'kiosk'))
);

create table if not exists public.employees (
  id               text primary key,
  employee_code    text not null unique,
  name             text not null,
  department       text not null default 'General',
  job_title        text not null default '',
  email            text not null default '',
  badge_token      text not null unique,
  shift_id         text,
  active           boolean not null default true,
  face_descriptors jsonb,
  face_enrolled_at timestamptz,
  face_consent_at  timestamptz,
  created_at       timestamptz not null default now()
);

-- No foreign key on employee_id on purpose: history survives a deleted employee.
create table if not exists public.attendance_records (
  id            text primary key,
  employee_id   text not null,
  employee_name text,
  employee_code text,
  department    text,
  type          text not null check (type in ('in', 'out')),
  status        text,
  shift_id      text,
  work_date     date,
  unscheduled   boolean not null default false,
  edited        boolean not null default false,
  ts            timestamptz not null,
  source        text not null default 'qr',
  note          text not null default ''
);
create index if not exists attendance_records_employee_ts
  on public.attendance_records (employee_id, ts desc);
create index if not exists attendance_records_ts
  on public.attendance_records (ts);

create table if not exists public.app_settings (
  id   int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);
insert into public.app_settings (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

create table if not exists public.pending_signups (
  id               text primary key,
  name             text not null,
  department       text not null default 'General',
  job_title        text not null default '',
  email            text not null default '',
  badge_token      text not null unique,
  photo            text not null default '',
  face_descriptors jsonb not null default '[]'::jsonb,
  consent_at       timestamptz not null default now(),
  submitted_at     timestamptz not null default now()
);

create table if not exists public.schedule_entries (
  employee_id text not null,
  day         date not null,
  value       text not null,            -- a shift id, or 'off'
  primary key (employee_id, day)
);

create table if not exists public.schedule_patterns (
  employee_id text primary key,
  pattern     jsonb not null            -- { anchor: 'YYYY-MM-DD', weeks: [[7 x value], ...] }
);

-- ---------- Role helpers -----------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users where user_id = auth.uid()
  );
$$;

-- ---------- Row Level Security ----------------------------------------------

alter table public.app_users          enable row level security;
alter table public.employees          enable row level security;
alter table public.attendance_records enable row level security;
alter table public.app_settings       enable row level security;
alter table public.pending_signups    enable row level security;
alter table public.schedule_entries   enable row level security;
alter table public.schedule_patterns  enable row level security;

-- app_users: you can read your own role (nobody can edit roles from the app)
drop policy if exists "read own role" on public.app_users;
create policy "read own role" on public.app_users
  for select to authenticated using (user_id = auth.uid());

-- employees
drop policy if exists "staff read employees" on public.employees;
create policy "staff read employees" on public.employees
  for select to authenticated using (public.is_staff());
drop policy if exists "admin write employees" on public.employees;
create policy "admin write employees" on public.employees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- attendance: staff read + add; only admins edit or delete
drop policy if exists "staff read records" on public.attendance_records;
create policy "staff read records" on public.attendance_records
  for select to authenticated using (public.is_staff());
drop policy if exists "staff add records" on public.attendance_records;
create policy "staff add records" on public.attendance_records
  for insert to authenticated with check (public.is_staff());
drop policy if exists "admin edit records" on public.attendance_records;
create policy "admin edit records" on public.attendance_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete records" on public.attendance_records;
create policy "admin delete records" on public.attendance_records
  for delete to authenticated using (public.is_admin());

-- settings, schedule and patterns: staff read, admin write
drop policy if exists "staff read settings" on public.app_settings;
create policy "staff read settings" on public.app_settings
  for select to authenticated using (public.is_staff());
drop policy if exists "admin write settings" on public.app_settings;
create policy "admin write settings" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read schedule" on public.schedule_entries;
create policy "staff read schedule" on public.schedule_entries
  for select to authenticated using (public.is_staff());
drop policy if exists "admin write schedule" on public.schedule_entries;
create policy "admin write schedule" on public.schedule_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff read patterns" on public.schedule_patterns;
create policy "staff read patterns" on public.schedule_patterns
  for select to authenticated using (public.is_staff());
drop policy if exists "admin write patterns" on public.schedule_patterns;
create policy "admin write patterns" on public.schedule_patterns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- pending signups: admins only (the public form goes through submit_signup())
drop policy if exists "admin all pending" on public.pending_signups;
create policy "admin all pending" on public.pending_signups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Functions used by the app ---------------------------------------

-- What the public signup page may know (never the signup code itself).
create or replace function public.get_public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companyName',        coalesce(data->>'companyName', 'My Company'),
    'selfSignupEnabled',  coalesce((data->>'selfSignupEnabled')::boolean, false),
    'signupCodeRequired', coalesce(data->>'signupCode', '') <> '',
    'faceEnabled',        coalesce((data->>'faceEnabled')::boolean, false),
    'faceThreshold',      coalesce((data->>'faceThreshold')::numeric, 0.45)
  )
  from (
    select coalesce((select a.data from public.app_settings a where a.id = 1), '{}'::jsonb) as data
  ) s;
$$;

-- Public signup. Checks the settings and the code on the server, creates the QR
-- token on the server and caps the number of waiting signups.
create or replace function public.submit_signup(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg  jsonb;
  nm   text;
  descr jsonb;
  reg  public.pending_signups;
begin
  select a.data into cfg from public.app_settings a where a.id = 1;
  cfg := coalesce(cfg, '{}'::jsonb);

  if coalesce((cfg->>'selfSignupEnabled')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'Signup is turned off.');
  end if;
  if coalesce(cfg->>'signupCode', '') <> '' and coalesce(p->>'code', '') <> (cfg->>'signupCode') then
    return jsonb_build_object('ok', false, 'error', 'Incorrect signup code.');
  end if;

  nm := btrim(coalesce(p->>'name', ''));
  if nm = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter your name.');
  end if;
  if coalesce((p->>'consent')::boolean, false) = false then
    return jsonb_build_object('ok', false, 'error', 'Consent is required to register.');
  end if;
  if (select count(*) from public.pending_signups) >= 100 then
    return jsonb_build_object('ok', false, 'error', 'Too many pending signups. Please ask an admin to review them.');
  end if;

  descr := p->'faceDescriptors';
  if descr is null or jsonb_typeof(descr) <> 'array' then
    descr := '[]'::jsonb;
  end if;

  insert into public.pending_signups
    (id, name, department, job_title, email, badge_token, photo, face_descriptors, consent_at, submitted_at)
  values (
    replace(gen_random_uuid()::text, '-', ''),
    left(nm, 120),
    coalesce(nullif(btrim(p->>'department'), ''), 'General'),
    left(coalesce(p->>'position', ''), 120),
    left(coalesce(p->>'email', ''), 200),
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    left(coalesce(p->>'photo', ''), 60000),
    descr,
    now(),
    now()
  )
  returning * into reg;

  return jsonb_build_object('ok', true, 'registration', to_jsonb(reg));
end;
$$;

-- Admin approval: creates the employee (with the next EMP code) and removes the
-- pending row in one step, so two admins can never produce the same code.
create or replace function public.approve_signup(p_id text, p_shift text) returns public.employees
language plpgsql security definer set search_path = public as $$
declare
  reg    public.pending_signups;
  next_n int;
  emp    public.employees;
  has_face boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve signups.';
  end if;

  select * into reg from public.pending_signups where id = p_id;
  if not found then
    raise exception 'Signup not found.';
  end if;

  select coalesce(max(regexp_replace(employee_code, '\D', '', 'g')::int), 0) + 1
    into next_n
    from public.employees
   where employee_code ~ '^EMP-\d+$';

  has_face := jsonb_array_length(coalesce(reg.face_descriptors, '[]'::jsonb)) > 0;

  insert into public.employees
    (id, employee_code, name, department, job_title, email, badge_token, shift_id, active,
     face_descriptors, face_enrolled_at, face_consent_at)
  values (
    reg.id,
    'EMP-' || lpad(next_n::text, 4, '0'),
    reg.name, reg.department, reg.job_title, reg.email, reg.badge_token, p_shift, true,
    case when has_face then reg.face_descriptors end,
    case when has_face then reg.submitted_at end,
    case when has_face then reg.consent_at end
  )
  returning * into emp;

  delete from public.pending_signups where id = p_id;
  return emp;
end;
$$;

-- Lets a kiosk say "Awaiting approval" for a badge whose signup is still pending
-- without being allowed to read the pending list itself.
create or replace function public.pending_token_exists(token text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
     and exists (select 1 from public.pending_signups where badge_token = token);
$$;

revoke all on function public.get_public_info()               from public;
revoke all on function public.submit_signup(jsonb)            from public;
revoke all on function public.approve_signup(text, text)      from public;
revoke all on function public.pending_token_exists(text)      from public;
grant execute on function public.get_public_info()            to anon, authenticated;
grant execute on function public.submit_signup(jsonb)         to anon, authenticated;
grant execute on function public.approve_signup(text, text)   to authenticated;
grant execute on function public.pending_token_exists(text)   to authenticated;

-- ---------- Live updates across devices --------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'employees', 'attendance_records', 'app_settings',
    'pending_signups', 'schedule_entries', 'schedule_patterns'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Give your accounts a role ----------------------------------------
-- 1) Authentication -> Users -> Add user (tick "Auto Confirm User") for each account.
-- 2) Then run ONE statement per account, with that account's email:
--
--   insert into public.app_users (user_id, role)
--     select id, 'admin' from auth.users where email = 'you@example.com';
--
--   insert into public.app_users (user_id, role)
--     select id, 'kiosk' from auth.users where email = 'kiosk@example.com';
