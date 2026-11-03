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
