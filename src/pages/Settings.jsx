import React, { useEffect, useState } from 'react';
import { MIN_PASSWORD_LENGTH, useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { downloadJSON } from '../utils/csv.js';
import { dateKey, fmtDateTime } from '../utils/time.js';
import { logoFromFile } from '../utils/image.js';
import { branchUsage, makeBranch, validateBranchName } from '../utils/branches.js';
import { isMissingFunction } from '../utils/errorText.js';
import ProfileModal from '../components/ProfileModal.jsx';
import {
  btnDanger,
  btnPrimary,
  btnSecondary,
  cardCls,
  inputCls,
  muted,
  PageHeader
} from '../components/ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Section({ title, description, children }) {
  return (
    <section className={`${cardCls} mb-6 p-6`}>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className={`mb-4 text-sm ${muted}`}>{description}</p>}
      {children}
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className={`mt-1 text-xs ${muted}`}>{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings, exportData, importData, clearRecords, resetAll, records, employees, mode, importLocalData, hasLocalData, testConnection,
    getKioskAccess, setKioskCode, revokeKioskDevice, revokeAllKioskDevices,
    listAccounts, setAccountBranch, listAllAccounts, setAccountRole, removeAccountAccess,
    refreshAccountCount } =
    useData();
  const { changePassword, adminUsername, displayName, email } = useAuth();

  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }
  const [logoError, setLogoError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [kiosk, setKiosk] = useState(null); // { installed, codeSet, devices } once loaded
  const [newCode, setNewCode] = useState('');
  const [kioskMsg, setKioskMsg] = useState('');
  const [branchForm, setBranchForm] = useState({ name: '', address: '' });
  const [branchEdit, setBranchEdit] = useState(null); // { id, name, address } while renaming
  const [branchMsg, setBranchMsg] = useState('');
  const [accounts, setAccounts] = useState(null); // null = loading, 'missing' = SQL not re-run
  const [acctList, setAcctList] = useState(null); // every login; null = loading, 'missing' = SQL not re-run
  const [acctMsg, setAcctMsg] = useState('');

  useEffect(() => setForm(settings), [settings]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };
  const toggleDay = (d) =>
    set(
      'workDays',
      form.workDays.includes(d) ? form.workDays.filter((x) => x !== d) : [...form.workDays, d].sort()
    );

  async function onLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');
    try {
      set('logo', await logoFromFile(file));
    } catch (err) {
      setLogoError(err.message);
    }
  }

  const setShift = (index, patch) => {
    setForm((f) => ({
      ...f,
      shifts: f.shifts.map((s, i) => (i === index ? { ...s, ...patch } : s))
    }));
    setSaved(false);
  };

  function saveSettings(e) {
    e.preventDefault();
    const shifts = form.shifts.map((s, i) => ({
      ...s,
      name: s.name.trim() || `Shift ${i + 1}`,
      grace: Math.max(0, Number(s.grace) || 0)
    }));
    if (!shifts.some((s) => s.enabled)) {
      window.alert('Turn on at least one shift.');
      return;
    }
    updateSettings({
      ...form,
      shifts,
      companyName: form.companyName.trim() || 'My Company',
      minScanIntervalSec: Math.max(0, Number(form.minScanIntervalSec) || 0),
      sessionTimeoutMin: Math.max(0, Number(form.sessionTimeoutMin) || 0),
      faceThreshold: Math.min(0.6, Math.max(0.2, Number(form.faceThreshold) || 0.45)),
      faceMargin: Math.min(0.3, Math.max(0, Number(form.faceMargin) || 0.08)),
      signupCode: String(form.signupCode || '').trim()
    });
    setSaved(true);
  }

  async function submitPassword(e) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    const res = await changePassword(pw.current, pw.next);
    if (res.ok) {
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Password updated.' });
    } else {
      setPwMsg({ ok: false, text: res.error });
    }
  }

  function backup() {
    downloadJSON(`attendance-backup-${dateKey(new Date())}.json`, exportData());
    setDataMsg('Backup downloaded.');
  }

  async function restore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const msg = `Replace ALL current data with this backup (${data.employees?.length ?? 0} employees, ${data.records?.length ?? 0} records)?`;
      if (!window.confirm(msg)) return;
      const res = await importData(data);
      setDataMsg(res.ok ? 'Backup restored.' : res.error);
    } catch {
      setDataMsg('Could not read that file.');
    }
  }

  const branches = settings.branches || [];

  async function addBranch(e) {
    e.preventDefault();
    const problem = validateBranchName(branchForm.name, branches);
    if (problem) {
      setBranchMsg(problem);
      return;
    }
    await updateSettings({ branches: [...branches, makeBranch(branchForm.name, branchForm.address)] });
    setBranchForm({ name: '', address: '' });
    setBranchMsg('');
  }

  async function saveBranchEdit() {
    const problem = validateBranchName(branchEdit.name, branches, branchEdit.id);
    if (problem) {
      setBranchMsg(problem);
      return;
    }
    await updateSettings({
      branches: branches.map((b) =>
        b.id === branchEdit.id
          ? { ...b, name: branchEdit.name.trim().slice(0, 60), address: branchEdit.address.trim().slice(0, 120) }
          : b
      )
    });
    setBranchEdit(null);
    setBranchMsg('');
  }

  const toggleBranch = (b) =>
    updateSettings({ branches: branches.map((x) => (x.id === b.id ? { ...x, active: x.active === false } : x)) });

  async function deleteBranch(b) {
    const use = branchUsage(b.id, employees, records);
    if (use.employees || use.records) {
      setBranchMsg(
        `"${b.name}" is used by ${use.employees} employee(s) and ${use.records} record(s), so it cannot be deleted. Archive it instead.`
      );
      return;
    }
    if (!window.confirm(`Delete the branch "${b.name}"?`)) return;
    await updateSettings({ branches: branches.filter((x) => x.id !== b.id) });
  }

  async function loadAccounts() {
    try {
      setAccounts(await listAccounts());
    } catch (err) {
      if (isMissingFunction(err)) setAccounts('missing');
      else {
        setAccounts([]);
        setBranchMsg(`Could not load accounts: ${err.message}`);
      }
    }
  }

  useEffect(() => {
    if (listAccounts) loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listAccounts]);

  async function changeAccountBranch(userId, branchId) {
    try {
      await setAccountBranch(userId, branchId);
      await loadAccounts();
    } catch (err) {
      setBranchMsg(err.message);
    }
  }

  const waiting = Array.isArray(acctList) ? acctList.filter((a) => !a.role) : [];
  const members = Array.isArray(acctList) ? acctList.filter((a) => a.role) : [];

  async function loadAcctList() {
    try {
      setAcctList(await listAllAccounts());
    } catch (err) {
      if (isMissingFunction(err)) {
        setAcctList('missing');
        setAcctMsg(`Details from the database: ${err.message}`);
      } else {
        setAcctList([]);
        setAcctMsg(`Could not load accounts: ${err.message}`);
      }
    }
  }

  useEffect(() => {
    if (listAllAccounts) loadAcctList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listAllAccounts]);

  async function afterAccountChange() {
    await loadAcctList();
    if (listAccounts) loadAccounts(); // keep the branch-linking list below in step
    if (refreshAccountCount) refreshAccountCount();
  }

  async function giveRole(account, role) {
    setAcctMsg('');
    try {
      const res = await setAccountRole(account.user_id, role);
      setAcctMsg(
        res?.ok
          ? `${account.email} is now ${role === 'admin' ? 'an admin' : 'a kiosk account'}. If they are signed in, they should sign out and back in.`
          : res?.error || 'Could not change the role.'
      );
      await afterAccountChange();
    } catch (err) {
      setAcctMsg(err.message);
    }
  }

  async function revokeRole(account) {
    if (!window.confirm(`Remove access for ${account.email}? They can still sign in but will see "No access yet".`)) return;
    setAcctMsg('');
    try {
      const res = await removeAccountAccess(account.user_id);
      setAcctMsg(res?.ok ? `${account.email} no longer has access.` : res?.error || 'Could not remove access.');
      await afterAccountChange();
    } catch (err) {
      setAcctMsg(err.message);
    }
  }

  async function changeBranchHere(userId, branchId) {
    await changeAccountBranch(userId, branchId);
    await loadAcctList();
  }

  async function loadKiosk() {
    try {
      setKiosk(await getKioskAccess());
    } catch (err) {
      setKioskMsg(`Could not load kiosk access: ${err.message}`);
    }
  }

  useEffect(() => {
    if (getKioskAccess) loadKiosk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getKioskAccess]);

  async function handleSetCode() {
    const warning = kiosk?.codeSet
      ? 'Change the kiosk code? Every authorised device is signed out and must enter the new code.'
      : 'Turn on the kiosk code? Kiosk accounts will need to be activated with it on each device.';
    if (!window.confirm(warning)) return;
    setKioskMsg('');
    try {
      const res = await setKioskCode(newCode);
      if (res?.ok) {
        setNewCode('');
        setKioskMsg('Saved. Tell each kiosk operator the new code; devices must activate again.');
      } else {
        setKioskMsg(res?.error || 'Could not save the code.');
      }
      await loadKiosk();
    } catch (err) {
      setKioskMsg(err.message);
    }
  }

  async function handleClearCode() {
    if (!window.confirm('Turn off the kiosk code? Any signed-in kiosk account will work on any device again.')) return;
    setKioskMsg('');
    try {
      await setKioskCode('');
      setKioskMsg('Kiosk code turned off.');
      await loadKiosk();
    } catch (err) {
      setKioskMsg(err.message);
    }
  }

  async function handleRevoke(device) {
    if (!window.confirm(`Revoke "${device.label || 'Kiosk device'}"? It must enter the code again to be used.`)) return;
    try {
      await revokeKioskDevice(device.id);
      await loadKiosk();
    } catch (err) {
      setKioskMsg(err.message);
    }
  }

  async function handleRevokeAll() {
    if (!window.confirm('Revoke every authorised device?')) return;
    try {
      await revokeAllKioskDevices();
      await loadKiosk();
    } catch (err) {
      setKioskMsg(err.message);
    }
  }

  async function handleTest() {
    setDataMsg('Testing the connection…');
    const r = await testConnection();
    setDataMsg(
      r.ok
        ? `Connected as ${r.role} in ${r.ms} ms. This account can see ${r.employees} employees and ${r.records} attendance records. Live updates: ${r.realtime === 'SUBSCRIBED' ? 'on' : r.realtime}.`
        : `Connection failed: ${r.error}`
    );
  }

  async function handleImportLocal() {
    if (
      !window.confirm(
        'Copy the employees, attendance, schedule and settings saved in THIS browser into the shared database? This replaces what is in the database now.'
      )
    ) {
      return;
    }
    const res = await importLocalData();
    setDataMsg(res.ok ? 'Imported into the shared database.' : res.error);
  }

  function handleClear() {
    if (window.confirm(`Permanently delete all ${records.length} attendance records? Employees are kept.`)) {
      clearRecords();
      setDataMsg('Attendance records cleared.');
    }
  }

  function handleReset() {
    if (
      window.confirm(
        `Delete ALL ${employees.length} employees, every attendance record, and reset settings? The admin account is kept. ${mode === 'remote' ? 'This deletes it for every device. ' : ''}This cannot be undone.`
      )
    ) {
      resetAll();
      setDataMsg('All data reset.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Settings" subtitle="Work schedule, kiosk rules, security and data." />

      <form onSubmit={saveSettings}>
        <Section
          title="Company & schedule"
          description="Company name and the days your business operates. Shift times are set below."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <input className={inputCls} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium">Default work days</p>
            <p className={`mb-2 text-xs ${muted}`}>
              Used when an employee has nothing set on the Schedule page for that day.
            </p>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((label, d) => (
                <label key={label} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={form.workDays.includes(d)} onChange={() => toggleDay(d)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title="Logo"
          description="Shown in the top bar, on the sign-in and signup pages, on the kiosk, on badges, and as the browser tab icon."
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-600">
              {form.logo ? (
                <img src={form.logo} alt="Logo preview" className="h-full w-full object-contain p-1" />
              ) : (
                <span className={`px-2 text-center text-xs ${muted}`}>No logo</span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <label className={`${btnSecondary} cursor-pointer`}>
                  {form.logo ? 'Change logo…' : 'Upload logo…'}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
                {form.logo && (
                  <button type="button" className={btnSecondary} onClick={() => set('logo', '')}>
                    Remove
                  </button>
                )}
              </div>
              <p className={`text-xs ${muted}`}>
                A PNG with a transparent background looks best. It is resized to fit 256 px automatically. Click
                Save settings to apply it.
              </p>
              {logoError && <p className="text-xs text-red-600">{logoError}</p>}
            </div>
          </div>
        </Section>

        <Section
          title="Shifts"
          description="Up to four shifts. Each employee is assigned one, and late / early flags use their shift. If a shift ends before it starts it runs overnight (for example 22:00 to 06:00), and the sign-in and next-morning sign-out count as one work day."
        >
          <div className="space-y-3">
            {form.shifts.map((s, i) => (
              <div
                key={s.id}
                className="grid grid-cols-2 items-end gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[auto_1fr_auto_auto_auto] sm:border-0 sm:p-0"
              >
                <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1 sm:pb-2">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => setShift(i, { enabled: e.target.checked })}
                  />
                  On
                </label>
                <div className="col-span-2 sm:col-span-1">
                  <Field label="Name">
                    <input
                      className={inputCls}
                      value={s.name}
                      onChange={(e) => setShift(i, { name: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Start">
                  <input
                    type="time"
                    className={inputCls}
                    value={s.start}
                    onChange={(e) => setShift(i, { start: e.target.value })}
                    required
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    className={inputCls}
                    value={s.end}
                    onChange={(e) => setShift(i, { end: e.target.value })}
                    required
                  />
                </Field>
                <div className="col-span-2 sm:col-span-1">
                  <Field label="Grace (min)">
                    <input
                      type="number"
                      min="0"
                      className={`${inputCls} sm:w-24`}
                      value={s.grace}
                      onChange={(e) => setShift(i, { grace: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Employee self-signup"
          description="New employees register themselves: they fill in their details, take a photo and get a QR badge. An admin approves each one before the badge works."
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.selfSignupEnabled}
              onChange={(e) => set('selfSignupEnabled', e.target.checked)}
            />
            <span>
              Enable the signup page (/signup)
              <span className={`block text-xs ${muted}`}>
                {mode === 'remote'
                  ? 'Employees can register from any device; you approve them in Employees.'
                  : 'Signups are saved in this browser only, so employees must register on the same browser/device the admin uses (for example the kiosk).'}
              </span>
            </span>
          </label>
          <div className="mt-4 max-w-xs">
            <Field
              label="Signup code (optional)"
              hint="Share it with new hires. It is a speed bump, not real security: it is stored unencrypted in this browser."
            >
              <input
                className={inputCls}
                value={form.signupCode}
                onChange={(e) => set('signupCode', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Face recognition (experimental)"
          description="An alternative to QR: employees look at the kiosk camera to sign in or out."
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={form.faceEnabled}
              onChange={(e) => set('faceEnabled', e.target.checked)}
            />
            <span>
              Enable face sign-in
              <span className={`block text-xs ${muted}`}>
                Face data is sensitive biometric data. Get written consent from each employee, secure
                it, and have your data-privacy officer review the setup. Only numeric descriptors are
                stored (no photos), but backups include them. There is no liveness check, so a photo
                of a person could fool the camera: use it on a supervised kiosk.
              </span>
            </span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Match threshold"
              hint="Lower = stricter (fewer wrong matches, more misses). 0.40 to 0.50 is a sensible range."
            >
              <input
                type="number"
                step="0.01"
                min="0.2"
                max="0.6"
                className={inputCls}
                value={form.faceThreshold}
                onChange={(e) => set('faceThreshold', e.target.value)}
              />
            </Field>
            <Field
              label="Margin over runner-up"
              hint="The best match must beat the second-best employee by this much, otherwise it is rejected as ambiguous."
            >
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.3"
                className={inputCls}
                value={form.faceMargin}
                onChange={(e) => set('faceMargin', e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Kiosk & security" description="How the scanner and admin session behave.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum seconds between scans" hint="Stops an accidental double scan from toggling someone straight back out.">
              <input type="number" min="0" className={inputCls} value={form.minScanIntervalSec} onChange={(e) => set('minScanIntervalSec', e.target.value)} />
            </Field>
            <Field label="Admin inactivity timeout (minutes)" hint="0 = never sign out automatically.">
              <input type="number" min="0" className={inputCls} value={form.sessionTimeoutMin} onChange={(e) => set('sessionTimeoutMin', e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.soundEnabled} onChange={(e) => set('soundEnabled', e.target.checked)} />
              Play a sound on each scan
            </label>
            <label className="flex items-start gap-2">
              <input className="mt-1" type="checkbox" checked={form.kioskManualEntry} onChange={(e) => set('kioskManualEntry', e.target.checked)} />
              <span>
                Allow typing an employee code on the kiosk
                <span className={`block text-xs ${muted}`}>
                  Convenient when someone forgets their badge, but anyone can clock in for anyone. Leave off
                  unless the kiosk is supervised.
                </span>
              </span>
            </label>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className={btnPrimary}>
              Save settings
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </Section>
      </form>

      {mode === 'remote' && listAllAccounts && (
        <Section
          title="Accounts"
          description="Everyone who can sign in. A login you create in Supabase has no access until you give it a role here. Admins manage everything; kiosk accounts can only record scans."
        >
          {acctList === 'missing' ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Run <b>supabase/schema.sql</b> again in the Supabase SQL Editor to turn on account management. If you
              already did, run <code>notify pgrst, 'reload schema';</code> there too, then{' '}
              <button type="button" className="font-semibold underline" onClick={loadAcctList}>
                check again
              </button>
              .
            </p>
          ) : acctList === null ? (
            <p className={`text-sm ${muted}`}>Loading accounts…</p>
          ) : (
            <>
              {waiting.length > 0 && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                  <h3 className="mb-2 text-sm font-semibold">Waiting for a role ({waiting.length})</h3>
                  <ul className="divide-y divide-amber-100 dark:divide-amber-800">
                    {waiting.map((a) => (
                      <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{a.email}</div>
                          <div className={`text-xs ${muted}`}>Created {fmtDateTime(a.created_at)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button className={btnPrimary} onClick={() => giveRole(a, 'kiosk')}>
                            Approve as kiosk
                          </button>
                          <button className={btnSecondary} onClick={() => giveRole(a, 'admin')}>
                            Approve as admin
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {members.length === 0 ? (
                <p className={`text-sm ${muted}`}>No accounts have a role yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {members.map((a) => (
                    <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {a.display_name || a.email} {a.is_me && <span className={`text-xs ${muted}`}>(you)</span>}
                        </div>
                        <div className={`truncate text-xs ${muted}`}>
                          {a.email} · last sign-in {a.last_sign_in_at ? fmtDateTime(a.last_sign_in_at) : 'never'}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className={`${inputCls} sm:w-auto`}
                          value={a.role}
                          disabled={a.is_me}
                          onChange={(e) => giveRole(a, e.target.value)}
                          aria-label={`Role for ${a.email}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="kiosk">Kiosk</option>
                        </select>
                        {(settings.branches || []).length > 0 && (
                          <select
                            className={`${inputCls} sm:w-auto`}
                            value={a.branch_id || ''}
                            onChange={(e) => changeBranchHere(a.user_id, e.target.value)}
                            aria-label={`Branch for ${a.email}`}
                          >
                            <option value="">No branch</option>
                            {(settings.branches || [])
                              .filter((b) => b.active !== false || b.id === a.branch_id)
                              .map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name}
                                </option>
                              ))}
                          </select>
                        )}
                        <button className={btnSecondary} disabled={a.is_me} onClick={() => revokeRole(a)}>
                          Remove access
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className={`mt-3 text-xs ${muted}`}>
                Remove access keeps the login but takes its role away. To delete a login completely, use Supabase
                under Authentication, then Users. You cannot change or remove your own access, and there is always
                at least one admin.
              </p>
            </>
          )}
          {acctMsg && <p className={`mt-3 text-sm ${muted}`}>{acctMsg}</p>}
        </Section>
      )}

      {mode === 'remote' && (
        <Section
          title="Branches"
          description="Add your branches, assign employees to them on the Employees page, and link each branch's kiosk account below. Every scan is recorded at the branch of the account it came from, and the kiosk cannot change that."
        >
          <form onSubmit={addBranch} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[10rem] flex-1">
              <label className="mb-1 block text-sm font-medium">Branch name</label>
              <input
                className={inputCls}
                value={branchForm.name}
                maxLength={60}
                onChange={(e) => setBranchForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Makati"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1 block text-sm font-medium">Address (optional)</label>
              <input
                className={inputCls}
                value={branchForm.address}
                maxLength={120}
                onChange={(e) => setBranchForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <button type="submit" className={btnPrimary}>
              Add branch
            </button>
          </form>

          {branches.length === 0 ? (
            <p className={`mt-4 text-sm ${muted}`}>No branches yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-700">
              {branches.map((b) => {
                const editing = branchEdit?.id === b.id;
                return (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    {editing ? (
                      <div className="flex min-w-[14rem] flex-1 flex-wrap gap-2">
                        <input
                          className={`${inputCls} flex-1`}
                          value={branchEdit.name}
                          maxLength={60}
                          onChange={(e) => setBranchEdit((v) => ({ ...v, name: e.target.value }))}
                        />
                        <input
                          className={`${inputCls} flex-1`}
                          value={branchEdit.address}
                          maxLength={120}
                          placeholder="Address"
                          onChange={(e) => setBranchEdit((v) => ({ ...v, address: e.target.value }))}
                        />
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <div className={`font-medium ${b.active === false ? 'text-slate-400 line-through' : ''}`}>
                          {b.name}
                          {b.active === false && <span className="ml-2 text-xs no-underline">(archived)</span>}
                        </div>
                        {b.address && <div className={`truncate text-xs ${muted}`}>{b.address}</div>}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {editing ? (
                        <>
                          <button type="button" className={btnPrimary} onClick={saveBranchEdit}>
                            Save
                          </button>
                          <button type="button" className={btnSecondary} onClick={() => setBranchEdit(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={btnSecondary}
                            onClick={() => setBranchEdit({ id: b.id, name: b.name, address: b.address || '' })}
                          >
                            Edit
                          </button>
                          <button type="button" className={btnSecondary} onClick={() => toggleBranch(b)}>
                            {b.active === false ? 'Restore' : 'Archive'}
                          </button>
                          <button type="button" className={btnSecondary} onClick={() => deleteBranch(b)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="mb-2 mt-6 text-sm font-semibold">Kiosk accounts and their branch</h3>
          {accounts === 'missing' ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Run <b>supabase/schema.sql</b> again in the Supabase SQL Editor to enable linking accounts to branches.
            </p>
          ) : accounts === null ? (
            <p className={`text-sm ${muted}`}>Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className={`text-sm ${muted}`}>No accounts found.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {accounts.map((a) => (
                <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.display_name || a.email}</div>
                    <div className={`truncate text-xs ${muted}`}>
                      {a.email} · {a.role}
                    </div>
                  </div>
                  <select
                    className={`${inputCls} sm:w-auto`}
                    value={a.branch_id || ''}
                    onChange={(e) => changeAccountBranch(a.user_id, e.target.value)}
                    aria-label={`Branch for ${a.email}`}
                  >
                    <option value="">No branch</option>
                    {branches
                      .filter((b) => b.active !== false || b.id === a.branch_id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
          <p className={`mt-2 text-xs ${muted}`}>
            Give each branch tablet its own kiosk account and link it here. An admin account can be linked too; its
            scans then count at that branch. Changes apply the next time that account signs in.
          </p>
          {branchMsg && <p className={`mt-3 text-sm ${muted}`}>{branchMsg}</p>}
        </Section>
      )}

      {getKioskAccess && (
        <Section
          title="Kiosk access"
          description="Require a code before a device can be used as a kiosk, so a leaked kiosk login or link is useless on any other device."
        >
          {!kiosk && !kioskMsg && <p className={`text-sm ${muted}`}>Checking…</p>}
          {kiosk && !kiosk.installed && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Not installed yet. In Supabase, open the SQL Editor and run <b>supabase/kiosk-access.sql</b> once, then
              reload this page.
            </p>
          )}
          {kiosk?.installed && (
            <>
              <p className="mb-3 text-sm">
                Status:{' '}
                <b>{kiosk.codeSet ? 'Code required' : 'Off (any signed-in kiosk account works anywhere)'}</b>
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[14rem] flex-1">
                  <label className="mb-1 block text-sm font-medium">
                    {kiosk.codeSet ? 'New kiosk code' : 'Kiosk code'}
                  </label>
                  <input
                    className={inputCls}
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="off"
                  />
                </div>
                <button className={btnPrimary} onClick={handleSetCode} disabled={newCode.trim().length < 6}>
                  {kiosk.codeSet ? 'Change code' : 'Turn on'}
                </button>
                {kiosk.codeSet && (
                  <button className={btnDanger} onClick={handleClearCode}>
                    Turn off
                  </button>
                )}
              </div>
              <p className={`mt-2 text-xs ${muted}`}>
                Changing or removing the code signs out every authorised device. Admin accounts are not affected and
                can still open the kiosk page anywhere.
              </p>

              {kiosk.codeSet && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Authorised devices ({kiosk.devices.length})</h3>
                    <div className="flex gap-2">
                      <button className={btnSecondary} onClick={loadKiosk}>
                        Refresh
                      </button>
                      {kiosk.devices.length > 1 && (
                        <button className={btnSecondary} onClick={handleRevokeAll}>
                          Revoke all
                        </button>
                      )}
                    </div>
                  </div>
                  {kiosk.devices.length === 0 ? (
                    <p className={`text-sm ${muted}`}>
                      No device is authorised yet. Sign in with the kiosk account on a tablet and enter the code.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                      {kiosk.devices.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{d.label || 'Kiosk device'}</div>
                            <div className={`text-xs ${muted}`}>
                              Activated {fmtDateTime(d.created_at)} · last seen{' '}
                              {d.last_seen_at ? fmtDateTime(d.last_seen_at) : 'never'}
                            </div>
                          </div>
                          <button className={btnSecondary} onClick={() => handleRevoke(d)}>
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
          {kioskMsg && <p className={`mt-3 text-sm ${muted}`}>{kioskMsg}</p>}
        </Section>
      )}

      <Section
        title="Your account"
        description={`Signed in as ${displayName}${email ? ` (${email})` : ''}.`}
      >
        <div className="mb-5">
          <button type="button" className={btnSecondary} onClick={() => setProfileOpen(true)}>
            Edit display name
          </button>
          <p className={`mt-1 text-xs ${muted}`}>Shown in the top bar instead of your email.</p>
        </div>
        <h3 className="mb-2 text-sm font-semibold">Change password</h3>
        <form onSubmit={submitPassword} className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <input type="password" className={inputCls} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <input type="password" className={inputCls} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm new password">
            <input type="password" className={inputCls} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" required />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-3">
            <button type="submit" className={btnPrimary}>
              Update password
            </button>
            {pwMsg && (
              <span className={`text-sm ${pwMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{pwMsg.text}</span>
            )}
          </div>
        </form>
      </Section>

      <Section
        title="Data"
        description={
          mode === 'remote'
            ? 'Stored in the shared database, so every device sees the same data. A backup is still a good idea.'
            : "Everything lives in this browser's storage. Download a backup regularly."
        }
      >
        <div className="flex flex-wrap gap-2">
          <button className={btnSecondary} onClick={backup}>
            Download backup (JSON)
          </button>
          <label className={`${btnSecondary} cursor-pointer`}>
            Restore from backup…
            <input type="file" accept="application/json,.json" className="hidden" onChange={restore} />
          </label>
          {testConnection && (
            <button className={btnSecondary} onClick={handleTest}>
              Test database connection
            </button>
          )}
          {importLocalData && hasLocalData && (
            <button className={btnSecondary} onClick={handleImportLocal}>
              Import data saved in this browser
            </button>
          )}
          <button className={btnDanger} onClick={handleClear}>
            Clear attendance records
          </button>
          <button className={btnDanger} onClick={handleReset}>
            Reset all data
          </button>
        </div>
        {dataMsg && <p className={`mt-3 text-sm ${muted}`}>{dataMsg}</p>}
      </Section>
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
