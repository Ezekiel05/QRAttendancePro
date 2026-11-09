import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataContext } from './DataContext.jsx';
import { useAuth } from './AuthContext.jsx';
import { supabase, supabaseHost } from '../lib/supabase.js';
import { describeLoadError, isMissingFunction } from '../utils/errorText.js';
import { DEFAULT_SETTINGS, KEYS, load, normalizeSettings, save } from '../utils/storage.js';
import { randomHex } from '../utils/crypto.js';
import { computeScan, makeEmployee, makeManualRecord, rebuildRecord } from '../utils/recordOps.js';
import * as M from '../utils/remoteMap.js';

// Same data and actions as DataContext, but stored in the shared Supabase database
// and kept live across devices. Scans are written through a small on-device outbox
// so a Wi-Fi blip at the kiosk never loses a sign-in.

const OUTBOX_KEY = 'qrap_outbox';
const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const CHUNK = 500;

const readOutbox = () => load(OUTBOX_KEY, []);

// Key of this device once it was activated with the kiosk code (kept only in this browser).
const KIOSK_TOKEN_KEY = 'qrap_kiosk_token';
const readKioskToken = () => {
  try {
    return localStorage.getItem(KIOSK_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};
const unwrap = ({ error }) => {
  if (error) throw error;
};

async function fetchAll(table, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function insertChunks(table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    unwrap(await supabase.from(table).insert(rows.slice(i, i + CHUNK)));
  }
}

async function deleteAll(table, pk) {
  unwrap(await supabase.from(table).delete().not(pk, 'is', null));
}

async function fetchEverything(admin) {
  const [emps, recs, settingsRes, entries, pats, pend] = await Promise.all([
    fetchAll('employees', ['created_at', 'id']),
    fetchAll('attendance_records', ['ts', 'id']),
    supabase.from('app_settings').select('data').eq('id', 1).maybeSingle(),
    fetchAll('schedule_entries', ['employee_id', 'day']),
    fetchAll('schedule_patterns', ['employee_id']),
    admin ? fetchAll('pending_signups', ['submitted_at', 'id']) : Promise.resolve([])
  ]);
  unwrap(settingsRes);

  const schedule = {};
  for (const e of entries) {
    if (!schedule[e.employee_id]) schedule[e.employee_id] = {};
    schedule[e.employee_id][e.day] = e.value;
  }
  const patterns = {};
  for (const p of pats) patterns[p.employee_id] = p.pattern;

  const records = recs.map(M.recordFromDb);
  // Scans still waiting in this device's outbox count as part of the data here.
  const known = new Set(records.map((r) => r.id));
  for (const r of readOutbox()) if (!known.has(r.id)) records.push(r);

  return {
    employees: emps.map(M.employeeFromDb),
    records,
    settings: normalizeSettings(settingsRes.data?.data || {}),
    pending: pend.map(M.pendingFromDb),
    schedule,
    patterns
  };
}

// ---- applying live changes -----------------------------------------------------
// Kiosk accounts read everything through one database function that checks the device key.
async function fetchKioskSnapshot(token) {
  const { data, error } = await supabase.rpc('kiosk_load', { p_token: token });
  if (error) throw error;
  return M.snapshotFromKioskLoad(data, readOutbox());
}

function applyRow(setList, mapper, payload) {
  setList((list) => {
    if (payload.eventType === 'DELETE') return list.filter((x) => x.id !== payload.old.id);
    const row = mapper(payload.new);
    return list.some((x) => x.id === row.id)
      ? list.map((x) => (x.id === row.id ? row : x))
      : [...list, row];
  });
}

function applyEntries(prev, entries) {
  const next = { ...prev };
  for (const { employeeId, date, value } of entries) {
    const row = { ...(next[employeeId] || {}) };
    if (value == null) delete row[date];
    else row[date] = value;
    if (Object.keys(row).length) next[employeeId] = row;
    else delete next[employeeId];
  }
  return next;
}

function applyEntryEvent(prev, payload) {
  if (payload.eventType === 'DELETE') {
    return applyEntries(prev, [{ employeeId: payload.old.employee_id, date: payload.old.day, value: null }]);
  }
  const { employee_id: employeeId, day, value } = payload.new;
  return applyEntries(prev, [{ employeeId, date: day, value }]);
}

function applyPatternEvent(prev, payload) {
  const next = { ...prev };
  if (payload.eventType === 'DELETE') delete next[payload.old.employee_id];
  else next[payload.new.employee_id] = payload.new.pattern;
  return next;
}

export default function RemoteDataProvider({ children }) {
  const auth = useAuth();
  const staff = auth.isStaff;
  const admin = auth.isAdmin;
  const authLoading = auth.loading;

  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [pending, setPending] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [patterns, setPatterns] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [outboxCount, setOutboxCount] = useState(() => readOutbox().length);
  const [realtime, setRealtime] = useState('NOT_CONNECTED');
  const [kioskMode, setKioskMode] = useState('direct'); // 'direct' | 'device'
  const [needsActivation, setNeedsActivation] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const [pendingAccountCount, setPendingAccountCount] = useState(0); // logins waiting for a role

  // Always-fresh copy of the data for callbacks (camera scans, long-lived handlers).
  const stateRef = useRef({});
  stateRef.current = { employees, records, settings, pending, schedule, patterns };
  const kioskModeRef = useRef('direct');
  kioskModeRef.current = kioskMode;
  // The branch of the signed-in kiosk account (kept in a ref so the scan callback always sees it).
  const branchRef = useRef(null);
  branchRef.current = auth.branchId;

  const fail = useCallback((err, fallback) => {
    console.error(err);
    setError(err?.message ? `${fallback} (${err.message})` : fallback);
  }, []);
  const clearError = useCallback(() => setError(''), []);

  // Admin: how many new logins are waiting for a role (shown as a badge on the menu).
  const refreshAccountCount = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_all_accounts');
    if (!e) setPendingAccountCount((data || []).filter((a) => !a.role).length);
  }, []);

  const apply = useCallback((d) => {
    setEmployees(d.employees);
    setRecords(d.records);
    setSettings(d.settings);
    setPending(d.pending);
    setSchedule(d.schedule);
    setPatterns(d.patterns);
  }, []);

  // ---- load + live updates ----------------------------------------------------
  useEffect(() => {
    if (authLoading) return undefined;
    let cancelled = false;
    let channel = null;

    async function boot() {
      setLoading(true);
      setNeedsActivation(false);
      try {
        if (!staff) {
          // Signed out: only the public signup info is available.
          const { data, error: e } = await supabase.rpc('get_public_info');
          if (e) throw e;
          if (cancelled) return;
          apply({
            employees: [],
            records: [],
            settings: { ...DEFAULT_SETTINGS, ...(data || {}) },
            pending: [],
            schedule: {},
            patterns: {}
          });
          return;
        }

        if (auth.role === 'kiosk') {
          const token = readKioskToken();
          const { data: gate, error: gateError } = await supabase.rpc('kiosk_status', { p_token: token });
          if (gateError && !isMissingFunction(gateError)) throw gateError;
          if (!gateError) {
            // The kiosk-access SQL is installed: kiosk accounts always go through its functions.
            if (gate.codeRequired && !gate.deviceOk) {
              if (token) {
                try {
                  localStorage.removeItem(KIOSK_TOKEN_KEY);
                } catch {
                  /* ignore */
                }
              }
              if (cancelled) return;
              apply({
                employees: [],
                records: [],
                settings: { ...DEFAULT_SETTINGS },
                pending: [],
                schedule: {},
                patterns: {}
              });
              setKioskMode('device');
              setNeedsActivation(true);
              return;
            }
            const snapshot = await fetchKioskSnapshot(token);
            if (cancelled) return;
            apply(snapshot);
            setKioskMode('device');
            return;
          }
        }
        setKioskMode('direct');

        const d = await fetchEverything(admin);
        if (cancelled) return;
        apply(d);
        if (admin) refreshAccountCount();

        const ch = supabase.channel('qrap-sync');
        const on = (table, handler) =>
          ch.on('postgres_changes', { event: '*', schema: 'public', table }, handler);
        on('employees', (p) => applyRow(setEmployees, M.employeeFromDb, p));
        on('attendance_records', (p) => applyRow(setRecords, M.recordFromDb, p));
        on('app_settings', (p) => {
          if (p.new?.data) setSettings(normalizeSettings(p.new.data));
        });
        on('schedule_entries', (p) => setSchedule((prev) => applyEntryEvent(prev, p)));
        on('schedule_patterns', (p) => setPatterns((prev) => applyPatternEvent(prev, p)));
        if (admin) on('pending_signups', (p) => applyRow(setPending, M.pendingFromDb, p));
        ch.subscribe((status) => {
          if (!cancelled) setRealtime(status);
        });
        channel = ch;
      } catch (e) {
        if (!cancelled) {
          fail(e, describeLoadError(e, supabaseHost) || 'Could not load data from the database.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [authLoading, staff, admin, auth.role, bootKey, apply, fail]);

  // Re-sync after the device was offline or the tab was in the background.
  useEffect(() => {
    if (!staff) return undefined;
    let last = Date.now();
    const refresh = async () => {
      if (Date.now() - last < 5000) return;
      last = Date.now();
      try {
        apply(await (kioskModeRef.current === 'device' ? fetchKioskSnapshot(readKioskToken()) : fetchEverything(admin)));
      } catch {
        /* still offline: try again next time */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [staff, admin, apply]);

  // ---- scan outbox ------------------------------------------------------------
  const flushOutbox = useCallback(async () => {
    const items = readOutbox();
    if (!items.length) {
      setOutboxCount(0);
      return;
    }
    const sent = new Set();
    for (const item of items) {
      const row = M.recordToDb(item);
      const { error: e } =
        kioskModeRef.current === 'device'
          ? await supabase.rpc('kiosk_record', { p_token: readKioskToken(), p_record: row })
          : await supabase
              .from('attendance_records')
              .upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      if (!e) sent.add(item.id);
    }
    // Re-read so scans added while we were uploading are not lost.
    const left = readOutbox().filter((r) => !sent.has(r.id));
    save(OUTBOX_KEY, left);
    setOutboxCount(left.length);
  }, []);

  // Check for new logins waiting for a role every minute (accounts cannot be watched live).
  useEffect(() => {
    if (!admin) return undefined;
    const timer = setInterval(refreshAccountCount, 60000);
    return () => clearInterval(timer);
  }, [admin, refreshAccountCount]);

  // A kiosk device has no live channel (the server only serves it through functions), so refresh
  // every minute. If its key was revoked or the code changed, go back to the activation screen.
  useEffect(() => {
    if (kioskMode !== 'device' || needsActivation) return undefined;
    const timer = setInterval(async () => {
      try {
        apply(await fetchKioskSnapshot(readKioskToken()));
      } catch (e) {
        if (/not authorized/i.test(e?.message || '')) setBootKey((k) => k + 1);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [kioskMode, needsActivation, apply]);

  useEffect(() => {
    if (!staff) return undefined;
    flushOutbox();
    const timer = setInterval(flushOutbox, 20000);
    window.addEventListener('online', flushOutbox);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flushOutbox);
    };
  }, [staff, flushOutbox]);

  // ---- scanning ---------------------------------------------------------------
  const recordScan = useCallback(
    async (raw, source = 'qr') => {
      const s = stateRef.current;
      let { result, record } = computeScan({
        raw,
        source,
        employees: s.employees,
        records: s.records,
        settings: s.settings,
        schedule: s.schedule,
        patterns: s.patterns,
        now: new Date(),
        isPendingToken: () => false,
        branchId: branchRef.current || undefined
      });

      // A badge nobody owns might belong to a signup that is still awaiting approval.
      if (!record && result.reason === 'unknown' && result.token) {
        try {
          const { data } =
            kioskModeRef.current === 'device'
              ? await supabase.rpc('kiosk_pending_token', { p_token: readKioskToken(), p_badge: result.token })
              : await supabase.rpc('pending_token_exists', { token: result.token });
          if (data === true) result = { ok: false, reason: 'pending' };
        } catch {
          /* leave as unknown */
        }
      }

      if (record) {
        const next = [...stateRef.current.records, record];
        stateRef.current = { ...stateRef.current, records: next };
        setRecords(next);
        save(OUTBOX_KEY, [...readOutbox(), record]);
        setOutboxCount(readOutbox().length);
        flushOutbox();
      }
      return result;
    },
    [flushOutbox]
  );

  // ---- employees --------------------------------------------------------------
  const addEmployee = useCallback(
    async (data) => {
      try {
        const s = stateRef.current;
        const employee = makeEmployee(data, s.employees, s.settings);
        unwrap(await supabase.from('employees').insert(M.employeeToDb(employee)));
        setEmployees((list) => (list.some((e) => e.id === employee.id) ? list : [...list, employee]));
        return employee;
      } catch (e) {
        fail(e, 'Could not add the employee.');
        return null;
      }
    },
    [fail]
  );

  const updateEmployee = useCallback(
    async (id, patch) => {
      try {
        const current = stateRef.current.employees.find((e) => e.id === id);
        if (!current) return;
        const next = { ...current, ...patch };
        unwrap(await supabase.from('employees').update(M.employeeToDb(next)).eq('id', id));
        setEmployees((list) => list.map((e) => (e.id === id ? next : e)));
      } catch (e) {
        fail(e, 'Could not save the employee.');
      }
    },
    [fail]
  );

  const removeEmployee = useCallback(
    async (id) => {
      try {
        unwrap(await supabase.from('employees').delete().eq('id', id));
        unwrap(await supabase.from('schedule_entries').delete().eq('employee_id', id));
        unwrap(await supabase.from('schedule_patterns').delete().eq('employee_id', id));
        setEmployees((list) => list.filter((e) => e.id !== id));
        setSchedule((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setPatterns((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (e) {
        fail(e, 'Could not delete the employee.');
      }
    },
    [fail]
  );

  const regenerateBadge = useCallback((id) => updateEmployee(id, { badgeToken: randomHex(12) }), [updateEmployee]);

  // ---- records ----------------------------------------------------------------
  const addManualRecord = useCallback(
    async ({ employeeId, type, timestamp, note, branchId }) => {
      try {
        const s = stateRef.current;
        const employee = s.employees.find((e) => e.id === employeeId);
        if (!employee) return;
        const record = makeManualRecord({
          employee,
          type,
          timestamp,
          note,
          branchId,
          records: s.records,
          settings: s.settings,
          schedule: s.schedule,
          patterns: s.patterns
        });
        unwrap(await supabase.from('attendance_records').insert(M.recordToDb(record)));
        setRecords((list) => (list.some((r) => r.id === record.id) ? list : [...list, record]));
      } catch (e) {
        fail(e, 'Could not add the entry.');
      }
    },
    [fail]
  );

  const updateRecord = useCallback(
    async (id, patch) => {
      try {
        const s = stateRef.current;
        const current = s.records.find((r) => r.id === id);
        if (!current) return;
        const next = rebuildRecord({
          record: current,
          patch,
          employees: s.employees,
          records: s.records,
          settings: s.settings,
          schedule: s.schedule,
          patterns: s.patterns
        });
        unwrap(await supabase.from('attendance_records').update(M.recordToDb(next)).eq('id', id));
        setRecords((list) => list.map((r) => (r.id === id ? next : r)));
      } catch (e) {
        fail(e, 'Could not save the record.');
      }
    },
    [fail]
  );

  const deleteRecord = useCallback(
    async (id) => {
      try {
        unwrap(await supabase.from('attendance_records').delete().eq('id', id));
        setRecords((list) => list.filter((r) => r.id !== id));
      } catch (e) {
        fail(e, 'Could not delete the record.');
      }
    },
    [fail]
  );

  // ---- settings, schedule, patterns ---------------------------------------------
  const updateSettings = useCallback(
    async (patch) => {
      try {
        const next = { ...stateRef.current.settings, ...patch };
        unwrap(await supabase.from('app_settings').upsert({ id: 1, data: next }));
        setSettings(next);
      } catch (e) {
        fail(e, 'Could not save the settings.');
      }
    },
    [fail]
  );

  const setScheduleEntries = useCallback(
    async (entries) => {
      try {
        const upserts = [];
        const deletes = new Map();
        for (const { employeeId, date, value } of entries) {
          if (value == null) {
            if (!deletes.has(employeeId)) deletes.set(employeeId, []);
            deletes.get(employeeId).push(date);
          } else {
            upserts.push({ employee_id: employeeId, day: date, value });
          }
        }
        for (let i = 0; i < upserts.length; i += CHUNK) {
          unwrap(
            await supabase
              .from('schedule_entries')
              .upsert(upserts.slice(i, i + CHUNK), { onConflict: 'employee_id,day' })
          );
        }
        await Promise.all(
          [...deletes].map(async ([employeeId, days]) =>
            unwrap(await supabase.from('schedule_entries').delete().eq('employee_id', employeeId).in('day', days))
          )
        );
        setSchedule((prev) => applyEntries(prev, entries));
      } catch (e) {
        fail(e, 'Could not save the schedule.');
      }
    },
    [fail]
  );

  const setPattern = useCallback(
    async (employeeId, pattern) => {
      try {
        if (pattern) {
          unwrap(await supabase.from('schedule_patterns').upsert({ employee_id: employeeId, pattern }));
        } else {
          unwrap(await supabase.from('schedule_patterns').delete().eq('employee_id', employeeId));
        }
        setPatterns((prev) => {
          const next = { ...prev };
          if (pattern) next[employeeId] = pattern;
          else delete next[employeeId];
          return next;
        });
      } catch (e) {
        fail(e, 'Could not save the pattern.');
      }
    },
    [fail]
  );

  // ---- backup / restore / reset -------------------------------------------------
  const exportData = useCallback(() => {
    const s = stateRef.current;
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      employees: s.employees,
      records: s.records,
      settings: s.settings,
      schedule: s.schedule,
      patterns: s.patterns
    };
  }, []);

  const importData = useCallback(
    async (data) => {
      if (!admin) return { ok: false, error: 'Only admins can restore data.' };
      if (!data || !Array.isArray(data.employees) || !Array.isArray(data.records)) {
        return { ok: false, error: 'This is not a valid backup file.' };
      }
      try {
        const emps = data.employees.map((e) => ({
          active: true,
          position: '',
          badgeToken: randomHex(12),
          ...e
        }));
        const recs = data.records.filter(
          (r) => r && r.id && r.employeeId && r.timestamp && (r.type === 'in' || r.type === 'out')
        );
        await deleteAll('attendance_records', 'id');
        await deleteAll('employees', 'id');
        await deleteAll('schedule_entries', 'employee_id');
        await deleteAll('schedule_patterns', 'employee_id');

        await insertChunks('employees', emps.map(M.employeeToDb));
        await insertChunks('attendance_records', recs.map(M.recordToDb));

        const entryRows = [];
        for (const [employeeId, days] of Object.entries(data.schedule || {})) {
          for (const [day, value] of Object.entries(days || {})) {
            entryRows.push({ employee_id: employeeId, day, value });
          }
        }
        await insertChunks('schedule_entries', entryRows);
        await insertChunks(
          'schedule_patterns',
          Object.entries(data.patterns || {}).map(([employee_id, pattern]) => ({ employee_id, pattern }))
        );
        if (data.settings && typeof data.settings === 'object') {
          unwrap(
            await supabase.from('app_settings').upsert({ id: 1, data: normalizeSettings(data.settings) })
          );
        }
        apply(await fetchEverything(true));
        return { ok: true };
      } catch (e) {
        fail(e, 'Restore failed.');
        return { ok: false, error: e?.message || 'Restore failed.' };
      }
    },
    [admin, apply, fail]
  );

  const hasLocalData = useMemo(
    () => load(KEYS.employees, []).length > 0 || load(KEYS.records, []).length > 0,
    []
  );

  // One-time move of the data saved in this browser (local mode) into the database.
  const importLocalData = useCallback(
    () =>
      importData({
        employees: load(KEYS.employees, []),
        records: load(KEYS.records, []),
        settings: load(KEYS.settings, {}),
        schedule: load(KEYS.schedule, {}),
        patterns: load(KEYS.patterns, {})
      }),
    [importData]
  );

  const clearRecords = useCallback(async () => {
    try {
      await deleteAll('attendance_records', 'id');
      save(OUTBOX_KEY, []);
      setOutboxCount(0);
      setRecords([]);
    } catch (e) {
      fail(e, 'Could not clear the records.');
    }
  }, [fail]);

  const resetAll = useCallback(async () => {
    try {
      await deleteAll('attendance_records', 'id');
      await deleteAll('employees', 'id');
      await deleteAll('schedule_entries', 'employee_id');
      await deleteAll('schedule_patterns', 'employee_id');
      await deleteAll('pending_signups', 'id');
      unwrap(await supabase.from('app_settings').upsert({ id: 1, data: {} }));
      save(OUTBOX_KEY, []);
      setOutboxCount(0);
      apply({
        employees: [],
        records: [],
        settings: normalizeSettings({}),
        pending: [],
        schedule: {},
        patterns: {}
      });
    } catch (e) {
      fail(e, 'Could not reset the data.');
    }
  }, [apply, fail]);

  // ---- self-signup --------------------------------------------------------------
  // ---- kiosk access code ---------------------------------------------------------
  // Admin: every account with its role and branch, and linking an account to a branch.
  const listAccounts = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_accounts');
    if (e) throw e;
    return data || [];
  }, []);

  const setAccountBranch = useCallback(async (userId, branch) => {
    const { error: e } = await supabase.rpc('set_account_branch', { p_user: userId, p_branch: branch || null });
    if (e) throw e;
  }, []);

  // Admin: all login accounts, approving them (giving a role) and removing access.
  const listAllAccounts = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('list_all_accounts');
    if (e) throw e;
    return data || [];
  }, []);

  const setAccountRole = useCallback(async (userId, role) => {
    const { data, error: e } = await supabase.rpc('set_account_role', { p_user: userId, p_role: role });
    if (e) throw e;
    return data;
  }, []);

  const removeAccountAccess = useCallback(async (userId) => {
    const { data, error: e } = await supabase.rpc('remove_account_access', { p_user: userId });
    if (e) throw e;
    return data;
  }, []);

  const activateKiosk = useCallback(async (code, label) => {
    try {
      const { data, error: e } = await supabase.rpc('activate_kiosk', { p_code: code, p_label: label });
      if (e) throw e;
      if (!data?.ok) return { ok: false, error: data?.error || 'Could not activate this device.' };
      try {
        localStorage.setItem(KIOSK_TOKEN_KEY, data.token);
      } catch {
        return { ok: false, error: 'This browser blocked saving the device key.' };
      }
      setBootKey((k) => k + 1);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeLoadError(e, supabaseHost) || e?.message || 'Activation failed.' };
    }
  }, []);

  // Admin: is a code set, and which devices are authorised?
  const getKioskAccess = useCallback(async () => {
    const { data: gate, error: e } = await supabase.rpc('kiosk_status', { p_token: null });
    if (e) {
      if (isMissingFunction(e)) return { installed: false };
      throw e;
    }
    const { data: devices, error: e2 } = await supabase
      .from('kiosk_devices')
      .select('id,label,created_at,last_seen_at')
      .order('created_at', { ascending: false });
    if (e2) throw e2;
    return { installed: true, codeSet: Boolean(gate?.codeRequired), devices: devices || [] };
  }, []);

  const setKioskCode = useCallback(async (code) => {
    const { data, error: e } = await supabase.rpc('set_kiosk_code', { p_code: code });
    if (e) throw e;
    return data;
  }, []);

  const revokeKioskDevice = useCallback(async (id) => {
    unwrap(await supabase.from('kiosk_devices').delete().eq('id', id));
  }, []);

  const revokeAllKioskDevices = useCallback(async () => {
    unwrap(await supabase.from('kiosk_devices').delete().not('id', 'is', null));
  }, []);

  const submitSignup = useCallback(async (data) => {
    try {
      const { data: res, error: e } = await supabase.rpc('submit_signup', {
        p: {
          name: data.name,
          department: data.department,
          position: data.position,
          email: data.email,
          code: data.code,
          consent: Boolean(data.consent),
          photo: data.photo || '',
          faceDescriptors: data.faceDescriptors || []
        }
      });
      if (e) throw e;
      if (!res?.ok) return { ok: false, error: res?.error || 'Signup failed.' };
      return { ok: true, registration: M.pendingFromDb(res.registration) };
    } catch (e) {
      console.error(e);
      return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
    }
  }, []);

  const approveSignup = useCallback(
    async (id, shiftId, branchId) => {
      try {
        const { data, error: e } = await supabase.rpc('approve_signup', {
          p_id: id,
          p_shift: shiftId || null,
          p_branch: branchId || null
        });
        if (e) throw e;
        const employee = M.employeeFromDb(data);
        setEmployees((list) => (list.some((x) => x.id === employee.id) ? list : [...list, employee]));
        setPending((list) => list.filter((r) => r.id !== id));
        return employee;
      } catch (e) {
        fail(e, 'Could not approve the signup.');
        return null;
      }
    },
    [fail]
  );

  const rejectSignup = useCallback(
    async (id) => {
      try {
        unwrap(await supabase.from('pending_signups').delete().eq('id', id));
        setPending((list) => list.filter((r) => r.id !== id));
      } catch (e) {
        fail(e, 'Could not reject the signup.');
      }
    },
    [fail]
  );

  // A real round trip to the database as the signed-in account: proves the keys, the
  // schema, the security rules and the role all work, and reports the live-updates state.
  const testConnection = useCallback(async () => {
    const started = performance.now();
    try {
      const count = async (table) => {
        const { count: n, error: e } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        if (e) throw e;
        return n ?? 0;
      };
      const [employeesCount, recordsCount] = await Promise.all([count('employees'), count('attendance_records')]);
      const fn = await supabase.rpc('get_public_info');
      if (fn.error) throw fn.error;
      return {
        ok: true,
        ms: Math.round(performance.now() - started),
        role: auth.role,
        employees: employeesCount,
        records: recordsCount,
        realtime
      };
    } catch (e) {
      return { ok: false, error: describeLoadError(e, supabaseHost) || e?.message || String(e) };
    }
  }, [auth.role, realtime]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const value = {
    mode: 'remote',
    realtime,
    testConnection,
    kioskMode,
    listAccounts,
    setAccountBranch,
    listAllAccounts,
    setAccountRole,
    removeAccountAccess,
    refreshAccountCount,
    pendingAccountCount,
    needsActivation,
    activateKiosk,
    getKioskAccess,
    setKioskCode,
    revokeKioskDevice,
    revokeAllKioskDevices,
    loading,
    error,
    clearError,
    outboxCount,
    hasLocalData,
    importLocalData,
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
