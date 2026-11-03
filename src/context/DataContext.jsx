import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, KEYS, load, normalizeSettings, save } from '../utils/storage.js';
import { randomHex, uid } from '../utils/crypto.js';
import {
  BADGE_PREFIX,
  classify,
  lastRecordFor,
  nextType,
  resolveShift,
  shiftFor,
  workDateOf
} from '../utils/attendance.js';

export const DataContext = createContext(null);

const loadEmployees = () => load(KEYS.employees, []);
const loadRecords = () => load(KEYS.records, []);
const loadSettings = () => normalizeSettings(load(KEYS.settings, {}));
const loadPending = () => load(KEYS.pending, []);
const loadSchedule = () => load(KEYS.schedule, {});
const loadPatterns = () => load(KEYS.patterns, {});

function nextEmployeeCode(employees) {
  let max = 0;
  for (const e of employees) {
    const m = /^EMP-(\d+)$/.exec(e.employeeCode);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EMP-${String(max + 1).padStart(4, '0')}`;
}

export function DataProvider({ children }) {
  const [employees, setEmployees] = useState(loadEmployees);
  const [records, setRecords] = useState(loadRecords);
  const [settings, setSettings] = useState(loadSettings);
  const [pending, setPending] = useState(loadPending);
  const [schedule, setSchedule] = useState(loadSchedule);
  const [patterns, setPatterns] = useState(loadPatterns);

  // Keep every open tab in sync (e.g. kiosk tab + admin tab in the same browser).
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === null || e.key === KEYS.employees) setEmployees(loadEmployees());
      if (e.key === null || e.key === KEYS.records) setRecords(loadRecords());
      if (e.key === null || e.key === KEYS.settings) setSettings(loadSettings());
      if (e.key === null || e.key === KEYS.pending) setPending(loadPending());
      if (e.key === null || e.key === KEYS.schedule) setSchedule(loadSchedule());
      if (e.key === null || e.key === KEYS.patterns) setPatterns(loadPatterns());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commitEmployees = useCallback((list) => {
    save(KEYS.employees, list);
    setEmployees(list);
  }, []);

  const commitRecords = useCallback((list) => {
    save(KEYS.records, list);
    setRecords(list);
  }, []);

  const commitPending = useCallback((list) => {
    save(KEYS.pending, list);
    setPending(list);
  }, []);

  const commitSchedule = useCallback((obj) => {
    save(KEYS.schedule, obj);
    setSchedule(obj);
  }, []);

  // Day-by-day roster. entries: [{ employeeId, date, value }] where value is a
  // shift id, 'off', or null to clear the day (back to the employee's default).
  const setScheduleEntries = useCallback(
    (entries) => {
      const next = { ...loadSchedule() };
      for (const { employeeId, date, value } of entries) {
        const row = { ...(next[employeeId] || {}) };
        if (value == null) delete row[date];
        else row[date] = value;
        if (Object.keys(row).length) next[employeeId] = row;
        else delete next[employeeId];
      }
      commitSchedule(next);
    },
    [commitSchedule]
  );

  const commitPatterns = useCallback((obj) => {
    save(KEYS.patterns, obj);
    setPatterns(obj);
  }, []);

  // pattern: { anchor: 'YYYY-MM-DD' (a Monday), weeks: [[7 x ('' | 'off' | shiftId)], ...] }, or null to remove.
  const setPattern = useCallback(
    (employeeId, pattern) => {
      const next = { ...loadPatterns() };
      if (pattern) next[employeeId] = pattern;
      else delete next[employeeId];
      commitPatterns(next);
    },
    [commitPatterns]
  );

  // ---------- Employees ----------
  const addEmployee = useCallback(
    (data) => {
      const list = loadEmployees();
      const employee = {
        id: uid(),
        employeeCode: nextEmployeeCode(list),
        name: data.name,
        department: data.department || 'General',
        position: data.position || '',
        email: data.email || '',
        shiftId: data.shiftId || shiftFor(null, loadSettings()).id,
        badgeToken: randomHex(12),
        active: true,
        createdAt: new Date().toISOString()
      };
      commitEmployees([...list, employee]);
      return employee;
    },
    [commitEmployees]
  );

  const updateEmployee = useCallback(
    (id, patch) => commitEmployees(loadEmployees().map((e) => (e.id === id ? { ...e, ...patch } : e))),
    [commitEmployees]
  );

  const removeEmployee = useCallback(
    (id) => commitEmployees(loadEmployees().filter((e) => e.id !== id)),
    [commitEmployees]
  );

  // Issues a new QR token; the old badge stops working immediately.
  const regenerateBadge = useCallback(
    (id) => updateEmployee(id, { badgeToken: randomHex(12) }),
    [updateEmployee]
  );

  // ---------- Scanning ----------
  // Always reads fresh data from storage because it is called from the
  // camera callback, where React state could be stale.
  const recordScan = useCallback(
    (raw, source = 'qr') => {
      const emps = loadEmployees();
      const recs = loadRecords();
      const cfg = loadSettings();
      const text = String(raw || '').trim();

      let employee;
      if (source === 'face') {
        employee = emps.find((e) => e.id === text);
      } else if (source === 'qr') {
        employee = text.startsWith(BADGE_PREFIX)
          ? emps.find((e) => e.badgeToken === text.slice(BADGE_PREFIX.length))
          : undefined;
      } else {
        employee = emps.find((e) => e.employeeCode.toLowerCase() === text.toLowerCase());
      }

      if (!employee) {
        // A badge from a signup that hasn't been approved yet.
        if (source === 'qr' && text.startsWith(BADGE_PREFIX)) {
          const token = text.slice(BADGE_PREFIX.length);
          if (loadPending().some((r) => r.badgeToken === token)) {
            return { ok: false, reason: 'pending' };
          }
        }
        return { ok: false, reason: 'unknown' };
      }
      if (!employee.active) return { ok: false, reason: 'inactive', employee };

      const now = new Date();
      const last = lastRecordFor(recs, employee.id);
      if (last) {
        const elapsed = (now - new Date(last.timestamp)) / 1000;
        if (elapsed < cfg.minScanIntervalSec) {
          return {
            ok: false,
            reason: 'too-soon',
            employee,
            wait: Math.ceil(cfg.minScanIntervalSec - elapsed)
          };
        }
      }

      const lastShift = last?.shiftId ? (cfg.shifts || []).find((s) => s.id === last.shiftId) : null;
      const type = nextType(recs, employee.id, now, lastShift || shiftFor(employee, cfg));
      const { shift, scheduled, workDate } = resolveShift({
        employee,
        type,
        when: now,
        recs,
        settings: cfg,
        schedule: loadSchedule(),
        patterns: loadPatterns()
      });
      const record = {
        id: uid(),
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        type,
        status: classify(type, now, shift),
        shiftId: shift.id,
        workDate,
        ...(type === 'in' && !scheduled ? { unscheduled: true } : {}),
        timestamp: now.toISOString(),
        source,
        note: ''
      };
      commitRecords([...recs, record]);
      return { ok: true, employee, record };
    },
    [commitRecords]
  );

  // ---------- Manual record management ----------
  const addManualRecord = useCallback(
    ({ employeeId, type, timestamp, note }) => {
      const employee = loadEmployees().find((e) => e.id === employeeId);
      if (!employee) return;
      const when = new Date(timestamp);
      const { shift, scheduled, workDate } = resolveShift({
        employee,
        type,
        when,
        recs: loadRecords(),
        settings: loadSettings(),
        schedule: loadSchedule(),
        patterns: loadPatterns()
      });
      const record = {
        id: uid(),
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        type,
        status: classify(type, when, shift),
        shiftId: shift.id,
        workDate,
        ...(type === 'in' && !scheduled ? { unscheduled: true } : {}),
        timestamp,
        source: 'manual',
        note: note || ''
      };
      commitRecords([...loadRecords(), record]);
    },
    [commitRecords]
  );

  const updateRecord = useCallback(
    (id, patch) => {
      const emps = loadEmployees();
      const cfg = loadSettings();
      const all = loadRecords();
      const sched = loadSchedule();
      const pats = loadPatterns();
      const next = all.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        const emp = emps.find((e) => e.id === merged.employeeId);
        if (emp) {
          merged.employeeName = emp.name;
          merged.employeeCode = emp.employeeCode;
          merged.department = emp.department;
        }
        const when = new Date(merged.timestamp);
        let resolved;
        if (emp) {
          resolved = resolveShift({
            employee: emp,
            type: merged.type,
            when,
            recs: all,
            settings: cfg,
            schedule: sched,
            patterns: pats,
            ignoreId: id
          });
        } else {
          const stored = (cfg.shifts || []).find((s) => s.id === merged.shiftId) || shiftFor(null, cfg);
          resolved = { shift: stored, scheduled: true, workDate: workDateOf(when, stored) };
        }
        merged.shiftId = resolved.shift.id;
        merged.workDate = resolved.workDate;
        merged.status = classify(merged.type, when, resolved.shift);
        if (merged.type === 'in' && !resolved.scheduled) merged.unscheduled = true;
        else delete merged.unscheduled;
        merged.edited = true;
        return merged;
      });
      commitRecords(next);
    },
    [commitRecords]
  );

  const deleteRecord = useCallback(
    (id) => commitRecords(loadRecords().filter((r) => r.id !== id)),
    [commitRecords]
  );

  // ---------- Self-signup ----------
  // The registrant's QR token is created now (so they can save their badge),
  // but it only works once an admin approves the registration.
  const submitSignup = useCallback(
    (data) => {
      const cfg = loadSettings();
      if (!cfg.selfSignupEnabled) return { ok: false, error: 'Signup is turned off.' };
      if (cfg.signupCode && String(data.code || '').trim() !== cfg.signupCode) {
        return { ok: false, error: 'Incorrect signup code.' };
      }
      const name = String(data.name || '').trim();
      if (!name) return { ok: false, error: 'Enter your name.' };
      if (!data.consent) return { ok: false, error: 'Consent is required to register.' };

      const list = loadPending();
      if (list.length >= 100) {
        return { ok: false, error: 'Too many pending signups. Please ask an admin to review them.' };
      }

      const now = new Date().toISOString();
      const registration = {
        id: uid(),
        name,
        department: String(data.department || '').trim() || 'General',
        position: String(data.position || '').trim(),
        email: String(data.email || '').trim(),
        badgeToken: randomHex(12),
        photo: data.photo || '',
        faceDescriptors: data.faceDescriptors || [],
        consentAt: now,
        submittedAt: now
      };
      commitPending([...list, registration]);
      return { ok: true, registration };
    },
    [commitPending]
  );

  const approveSignup = useCallback(
    (id, shiftId) => {
      const list = loadPending();
      const reg = list.find((r) => r.id === id);
      if (!reg) return null;
      const emps = loadEmployees();
      const employee = {
        id: uid(),
        employeeCode: nextEmployeeCode(emps),
        name: reg.name,
        department: reg.department,
        position: reg.position,
        email: reg.email,
        badgeToken: reg.badgeToken,
        shiftId: shiftId || shiftFor(null, loadSettings()).id,
        active: true,
        createdAt: new Date().toISOString(),
        ...(reg.faceDescriptors?.length
          ? {
              faceDescriptors: reg.faceDescriptors,
              faceEnrolledAt: reg.submittedAt,
              faceConsentAt: reg.consentAt
            }
          : {})
      };
      commitEmployees([...emps, employee]);
      commitPending(list.filter((r) => r.id !== id)); // the review photo is discarded
      return employee;
    },
    [commitEmployees, commitPending]
  );

  const rejectSignup = useCallback(
    (id) => commitPending(loadPending().filter((r) => r.id !== id)),
    [commitPending]
  );

  // ---------- Settings & data management ----------
  const updateSettings = useCallback((patch) => {
    const next = { ...loadSettings(), ...patch };
    save(KEYS.settings, next);
    setSettings(next);
  }, []);

  const exportData = useCallback(
    () => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      employees: loadEmployees(),
      records: loadRecords(),
      settings: loadSettings(),
      schedule: loadSchedule(),
      patterns: loadPatterns()
    }),
    []
  );

  const importData = useCallback((data) => {
    if (!data || !Array.isArray(data.employees) || !Array.isArray(data.records)) {
      return { ok: false, error: 'This is not a valid backup file.' };
    }
    const emps = data.employees.map((e) => ({
      active: true,
      position: '',
      badgeToken: randomHex(12),
      ...e
    }));
    save(KEYS.employees, emps);
    setEmployees(emps);
    save(KEYS.records, data.records);
    setRecords(data.records);
    const sched = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
    save(KEYS.schedule, sched);
    setSchedule(sched);
    const pats = data.patterns && typeof data.patterns === 'object' ? data.patterns : {};
    save(KEYS.patterns, pats);
    setPatterns(pats);
    if (data.settings && typeof data.settings === 'object') {
      const s = normalizeSettings(data.settings);
      save(KEYS.settings, s);
      setSettings(s);
    }
    return { ok: true };
  }, []);

  const clearRecords = useCallback(() => commitRecords([]), [commitRecords]);

  const resetAll = useCallback(() => {
    commitEmployees([]);
    commitRecords([]);
    commitPending([]);
    commitSchedule({});
    commitPatterns({});
    save(KEYS.settings, DEFAULT_SETTINGS);
    setSettings({ ...DEFAULT_SETTINGS });
  }, [commitEmployees, commitRecords, commitPending, commitSchedule, commitPatterns]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const value = {
    mode: 'local',
    employees,
    records,
    settings,
    employeeById,
    addEmployee,
    updateEmployee,
    removeEmployee,
    regenerateBadge,
    recordScan,
    addManualRecord,
    updateRecord,
    deleteRecord,
    updateSettings,
    exportData,
    importData,
    clearRecords,
    resetAll,
    pending,
    submitSignup,
    approveSignup,
    rejectSignup,
    schedule,
    setScheduleEntries,
    patterns,
    setPattern
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
