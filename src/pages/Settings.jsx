import React, { useEffect, useState } from 'react';
import { MIN_PASSWORD_LENGTH, useAuth } from '../context/AuthContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { downloadJSON } from '../utils/csv.js';
import { dateKey } from '../utils/time.js';
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
  const { settings, updateSettings, exportData, importData, clearRecords, resetAll, records, employees, mode, importLocalData, hasLocalData } =
    useData();
  const { changePassword, adminUsername } = useAuth();

  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [dataMsg, setDataMsg] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

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

      <Section title="Change password" description={`Signed in as ${adminUsername}.`}>
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
    </div>
  );
}
