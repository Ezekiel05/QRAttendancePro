# QR Attendance Pro

An enhanced version of the QR attendance tracker: React + Vite + Tailwind, with a
secured admin area, shift rules, reports and a more robust kiosk scanner.
Everything runs in the browser (localStorage) — no backend required to start.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:https    # self-signed HTTPS, for using the camera from a tablet/phone on your LAN
npm run build        # production build in dist/
```

Camera access (and admin password hashing) require **HTTPS or localhost**.

## First run

Open `/login` — there is **no default password**. The first visit asks you to create the admin
account (min. 8 characters). Then: Settings → set company name & work hours → Employees → add
people → print their badges → open **Kiosk** on the scanning device.

## What's new vs. v1

**Security**
- Admin password stored as a salted PBKDF2-SHA256 hash (no hard-coded `admin123`)
- Login lockout after 5 failed attempts, auto sign-out after inactivity (configurable)
- Session lives in `sessionStorage` (signed out when the tab closes)
- QR badges contain a random token instead of the employee ID; **Reissue** invalidates a lost badge
- CSV exports are protected against spreadsheet formula injection

**Attendance rules**
- Late / on-time sign-in and early sign-out, based on each employee's shift + grace period
- Minimum interval between scans (prevents accidental double-scan toggling)
- A forgotten sign-out from a previous day doesn't break the next day's sign-in
- Optional manual employee-code entry on the kiosk (off by default)

**Admin tools**
- Dashboard: signed in now, late, not-in-yet, 7-day trend chart, recent activity
- Employees: search, edit, archive/restore, delete, position field, reissue badge
- Printable badge sheet (`/admin/badges`) and PNG badge download
- Log: filter by employee/type/date range, pagination, **manual entries**, edit & delete records
- Reports: summary by employee (days, hours, late, early out, absent) and daily detail, CSV export
- Settings: schedule, kiosk rules, password change, JSON backup / restore, clear / reset data
- Dark mode, live clock, camera picker, scan sound, "time worked today" on sign-out
- Open the kiosk and admin in two tabs of the same browser: they stay in sync live

## Face recognition (experimental, face-only sign-in)

An alternative to QR. Runs entirely in the browser with `@vladmandic/face-api`; the model files are
copied from `node_modules` into `public/models` automatically (postinstall / predev / prebuild).

1. Settings -> **Face recognition** -> enable it (adjust the match threshold if needed).
2. Employees -> **Face** -> capture 3-5 samples (the admin must confirm the employee's written consent).
3. Kiosk -> a **QR code / Face** switch appears once at least one face is enrolled.

How matching works: each frame is turned into a 128-number descriptor and compared with every enrolled
employee (1:N). A match needs distance under the threshold (default 0.45), a clear margin over the
runner-up (0.08), the same person for 3 consecutive frames, and a face that fills >=20% of the frame.
Enrollment refuses a face that looks too similar to someone already enrolled. Matches are logged like
QR scans (late/early flags, minimum scan interval) with source "Face".

**Know before using it for real:**
- No liveness detection: a photo or phone screen of an enrolled employee can fool it. Use a supervised
  kiosk, or keep QR as the primary method.
- Face-only 1:N matching gets less reliable as headcount grows and varies with lighting, camera quality,
  masks, and between people. Test with your actual staff and tune the threshold.
- Face data is sensitive biometric data (Philippines Data Privacy Act): written consent, stated purpose,
  retention policy and secure storage. Descriptors currently live in plain localStorage, and the JSON
  backup includes them. Move to an encrypted backend before production use.
- Camera access needs HTTPS or localhost (`npm run dev:https` for a LAN tablet).

## Shifts

Settings -> **Shifts** holds up to four shifts (name, start, end, grace minutes, on/off). Defaults: Day
09:00-18:00, Morning 06:00-14:00, Evening 14:00-22:00, Night 22:00-06:00. Each employee is assigned a
shift in Employees (filter the list by shift too); signups get their shift when an admin approves them.

- Late / early-out flags use the employee's own shift and grace period.
- **Overnight shifts** (end earlier than start, e.g. Night 22:00-06:00) work: the 22:00 sign-in and the
  06:00 sign-out count as one work day, and the morning scan closes the shift instead of starting a new one.
- Every record stores its `workDate` and shift, so history keeps its meaning if shifts are edited later.
- The dashboard's "Not in yet" only lists people whose shift has already started.
- A sign-in left open longer than (shift length + 4 hours) is treated as a forgotten sign-out, and the next
  scan starts a new session.
- Upgrading from the single work-hours setting: the old hours become the first shift ("Day").

## Day-by-day schedule

Schedule (admin menu) is a weekly roster: pick a shift or Off for each employee on each day, so the same
person can be on Morning on Monday and Night on Tuesday. Use "Fill week", "Copy last week" and "Reset
week" for quick edits; the footer shows headcount per shift per day. On phones it becomes one card per
employee.

- A day you leave on **Default** uses the employee's default shift (Employees) on the company work days
  (Settings).
- A scan is judged against the shift scheduled for that person that day, including a night shift that
  started the evening before. A sign-out is judged against the shift its sign-in started under.
- Scans on a day the person isn't scheduled are still recorded and flagged "Not scheduled" / "Unscheduled".
- Dashboard "Not in yet" and the Reports absence counts follow the schedule.
- **Repeat patterns:** "Repeat…" next to an employee on the Schedule page sets a pattern that continues on
  its own: a cycle of 1-4 weeks (for example week 1 Morning, week 2 Night) with a shift, Off or Default for
  each day. The editor starts from the week you are viewing and applies from its starting week onward
  (earlier dates are never changed).
- Priority for any day: set by hand on the grid > repeat pattern > default shift on company work days.
- The schedule and patterns are included in backups.

## Employee self-signup

Settings -> **Employee self-signup** enables a public `/signup` page (a "Sign up" link shows in the nav).

1. The employee enters their details, agrees to the data-use consent, and takes a photo
   (with face sign-in enabled, they capture 3 face samples instead, which also enrolls their face).
2. They get a personal QR badge to download right away. It is **inactive** until approved:
   scanning it shows "Awaiting approval".
3. An admin reviews **Pending signups** at the top of the Employees page (photo, details, a warning
   if the face looks like an existing employee) and approves or rejects. On approval the employee
   gets their code and the badge they saved starts working. The review photo is then discarded;
   only face descriptors are kept.

Safeguards: an optional signup code, a cap of 100 pending signups, duplicate-face rejection, and
mandatory admin approval. The signup code is only a speed bump (stored unencrypted in the browser).

**Important limitation:** signups are written to this browser's localStorage, so employees must register
on the same browser/device the admin uses (for example the kiosk). Letting people sign up from their
own phones needs the backend mentioned below.

## Shared database (Supabase): use it from any device

By default each browser keeps its own data. With a free [Supabase](https://supabase.com) project, every device
(kiosk tablets, phones, the admin laptop) shares the same employees, schedule and attendance, updated live. The
app switches to the database automatically when it finds the two keys below; without them it keeps running in
local mode.

**One-time setup**
1. Create a free Supabase project. (Free projects pause after about a week with no activity; open the dashboard
   to resume one.)
2. SQL Editor -> New query -> paste all of `supabase/schema.sql` -> Run.
3. Authentication -> Users -> Add user (tick *Auto Confirm User*): one account for you (admin) and one per
   kiosk tablet. Then turn off public sign-ups (Authentication -> Sign In / Providers -> "Allow new users to
   sign up" off) so only accounts you create can exist.
4. Give each account a role in the SQL Editor (one statement per account, with its email):
   ```sql
   insert into public.app_users (user_id, role) select id, 'admin' from auth.users where email = 'you@example.com';
   insert into public.app_users (user_id, role) select id, 'kiosk' from auth.users where email = 'kiosk@example.com';
   ```
5. Project Settings -> API: copy the *Project URL* and the *anon public* key.
6. Locally: copy `.env.example` to `.env.local`, paste both values, then `npm install` and `npm run dev`.
7. Deployed site: GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret, add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then push (or re-run the workflow).
8. Sign in as admin, then Settings -> Data -> **Import data saved in this browser** to bring over what you
   already entered (use it in the browser that holds the data).

**About the URL:** use the project address only (`https://<ref>.supabase.co`). If you paste it with a path such as
`/rest/v1/`, the app strips the path automatically.

**About the key:** Supabase now calls it the *publishable key* (`sb_publishable_...`, under Project Settings ->
API Keys). It is a drop-in replacement for the older *anon* key and is safe in a web page: put it in
`VITE_SUPABASE_PUBLISHABLE_KEY` (or the old `VITE_SUPABASE_ANON_KEY`; the app accepts either, and the publishable
one wins if both are set). **Never** use the *secret* key (`sb_secret_...` or `service_role`): it bypasses every
security rule. The app refuses to start the database connection if it detects one and shows a red warning.

**How it behaves**
- **Roles:** *admin* can do everything; *kiosk* accounts (tablets) can only read employees/schedule and add
  scans. Sign in once on a tablet and it stays signed in. Signed-out visitors can only use the signup page.
- **Live sync:** changes appear on other devices within a second or two.
- **Flaky Wi-Fi:** scans are saved on the device first and uploaded in the background (a banner shows how many
  are waiting). The kiosk needs a connection to load at start-up.
- **Security:** every table has Row Level Security (see `supabase/schema.sql`). The anon key in the web page is
  public by design; the rules, not the key, protect the data. Face descriptors are readable by admin and kiosk
  accounts (needed for face matching), so use strong passwords and keep kiosk accounts to tablets you trust.
- **Signups** go through server-side functions that check the code, create the QR token and cap pending
  signups; the duplicate-face warning is shown to the admin at approval time.
- Changing `package.json` dependencies means running `npm install` and committing the updated
  `package-lock.json`.

## Checking that the database works

- The top bar shows **Shared DB** (green) when connected, or **Local only** (amber) when the keys were not found.
- Settings -> Data -> **Test database connection** does a real round trip as the signed-in account and reports
  the role, how many employees and records it can see, the response time and whether live updates are on.
- With `npm run dev`, restart the dev server after creating or editing `.env.local` (it is only read at start-up).
  In the browser's DevTools -> Network, filter for `supabase`: requests to `/rest/v1/...` should be 200 and
  a `realtime` WebSocket should connect.
- Test with two browsers (or a phone via `npm run dev:https`): add an employee in one and it should appear in the
  other within a couple of seconds.
- Tip: use a separate Supabase project for testing, with its own keys in `.env.local`, so test data never mixes
  with real data. The deployed site uses the keys stored as GitHub secrets.

## Logo and sign-in options

- **Logo:** Settings -> Logo -> upload any picture, then Save settings. It is resized to fit 256 px and stored with the
  other settings (so it syncs to every device with the shared database). It appears in the top bar, on the sign-in
  and signup pages, on the kiosk, on badges (including the downloaded PNG) and as the browser tab icon. For the logo
  to show on the *public* pages (sign-in/signup while signed out) with the shared database, re-run
  `supabase/schema.sql` once so the public info function includes it.
- **Stay signed in:** a checkbox on the sign-in page. Ticked, the session survives closing the browser; unticked, it
  ends when the browser closes. The choice is remembered on that device. Admins are still signed out after the
  inactivity timeout in Settings, and kiosk accounts are never timed out. Leave it off on shared computers.

## Kiosk access code (optional, shared database only)

Stops a leaked kiosk login or link from being used on any other device. The database enforces it, not just the
page.

1. Re-run `supabase/schema.sql` once (it updates the access rules), then run `supabase/kiosk-access.sql`.
2. Settings -> **Kiosk access** -> choose a code (6+ characters) -> Turn on.
3. On each tablet, sign in with the kiosk account. It shows **Activate this kiosk**: enter the code once (and a device
   name). The device stores its own secret key; only a hash of it is kept on the server.
4. From then on that tablet works normally. Other devices, even with the kiosk login, get nothing.

Admins can list devices, revoke one, or change/remove the code (which signs out every device) in Settings.
Wrong codes are rate-limited (5 tries, then 15 minutes locked per account).

Good to know: this authorises **devices**, not locations, and admin accounts are not covered (an admin can open the
kiosk page anywhere), so keep admin passwords strong. With a code set, kiosk tablets refresh their data every
minute instead of live. If you never run `kiosk-access.sql`, nothing changes.

## Display name

Click your name in the top bar (or Settings -> Your account) to set a nickname that is shown instead of your email
(without one, the part before the @ is shown). Works for admin and kiosk accounts.

## Branches (shared database only)

Track where people sign in. Settings -> **Branches**: add your branches, then link each branch's **kiosk account**
to its branch (give every tablet its own kiosk account). Scans from that account are recorded at that branch, and
the database stamps the branch itself, so nobody at the kiosk can pick or change it.

- Employees get an assigned branch (Employees -> add/edit, or when approving a signup) and can be filtered by it.
- The attendance Log shows the branch of every scan, can filter by it, and flags **Other branch** when someone signed
  in somewhere other than their assigned branch. Manual entries can set a branch.
- Reports can filter by assigned branch and the daily CSV includes where each person signed in.
- The Dashboard shows who is in right now per branch, and the kiosk shows its branch.

**Setup:** re-run `supabase/schema.sql` first (it only adds columns and functions, so it is safe), re-run
`supabase/kiosk-access.sql` if you use the kiosk code, *then* deploy the new app version. Changes to a kiosk
account's branch apply the next time that account signs in.

**Working at another branch:** on the Schedule page every day has a second dropdown, *Home* or a branch, next to the
shift. Pick a branch for a single day, or use **Branch all week** on a row. Repeat patterns can set a branch per
week as well, and the footer shows headcount per branch. Without a choice, people follow their assigned branch.
The Log flags **Other branch** only when someone signed in somewhere other than where they were scheduled that
day (hover for where), and the kiosk says **Scheduled at ...** if the scan is at a different branch. This needs no
database change.

## Menu

The top bar is a hamburger menu: **Attendance** (Kiosk, Dashboard, Attendance log, Reports), **People** (Employees,
Schedule), **Tools** (QR codes, Print badges) and **Admin** (Settings). Signed-out visitors see Sign in and, when
enabled, Employee signup. The menu also holds your display name and Sign out, which helps on phones.

## QR Generator

QR Codes (admin menu) makes a QR code for any link or text, or a Wi-Fi join code for kiosk tablets. Presets link
to this site's own pages (signup, kiosk, home), so new hires can scan a poster to reach the signup page
(self-signup must be enabled in Settings). Options: size, error correction, colours, white border and an
optional caption. Outputs: PNG, SVG, copy to clipboard, and print. Codes are created in the browser; nothing is
sent anywhere. Employee badges are still made from Employees (Badge / Print badges).

## Phones & tablets

The whole app is responsive. Tables become card lists on phones (and, for Employees, on portrait tablets),
inputs use 16px text on phones so iOS doesn't zoom on focus, and the scan-result toast respects the iPhone
home-bar safe area.

To use a phone or tablet as the kiosk: run `npm run dev:https`, open `https://<your-computer-IP>:5173` on the
device (accept the self-signed certificate warning once), and allow camera access. Remember that data is
stored per browser and origin: use that same device and address for the kiosk, signups and admin.

## Deploy for testing (free)

The app is a static site, so any free static host works. HTTPS is provided automatically, which the
camera needs.

- **GitHub Pages:** push to a *public* repo's `main` branch, then Settings -> Pages -> Source: *GitHub
  Actions*. The included workflow builds and publishes it to `https://<user>.github.io/<repo>/`.
- **Netlify / Vercel / Cloudflare Pages:** import the GitHub repo (works for private repos too). Build
  command `npm run build`, output directory `dist`. Redirect rules for client-side routes are included
  (`public/_redirects`, `vercel.json`).

Data lives in each visitor's own browser, so nothing is shared through the host. To test on a phone with the
same data as your computer: create an admin account on the phone, then Settings -> **Download backup** on the
computer and **Restore from backup** on the phone. Use fake employees for public test deployments.

## Project structure

```
src/
  App.jsx                  routes + admin guard
  context/                 DataContext (employees, records, settings, scan logic), AuthContext
  pages/                   Kiosk, Login, Dashboard, Employees, BadgePrint, Records, Reports, Settings
  components/              Navbar, Modal, BadgeCard, BadgeModal, ui (shared styles/pills)
  utils/                   storage, crypto, time, attendance (rules + reports), csv, sound
```

## Limitations to know about

- **Storage is per browser and per origin.** A kiosk tablet at `https://192.168.x.x:5173` and an admin
  laptop at `http://localhost:5173` do NOT share data. Run both in the same browser, or move
  persistence to a backend (all reads/writes go through `utils/storage.js` and the actions in
  `context/DataContext.jsx`).
- Client-side auth protects the UI, not the data: anyone with access to the browser profile can read
  localStorage. Use a real backend before relying on this for sensitive data.
- Overnight shifts are supported, but a shift longer than ~20 hours isn't (open sessions expire after shift length + 4 hours).
- Clearing browser data erases everything — use Settings → Download backup.
# QRAttendancePro
