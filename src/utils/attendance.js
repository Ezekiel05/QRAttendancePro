import { addDays, dateKey, minutesOfDay, parseHM, rangeKeys } from './time.js';

export const BADGE_PREFIX = 'QRA1:';

// An open sign-in older than (shift length + this buffer) is treated as a
// forgotten sign-out, so the next scan starts a new session instead of closing it.
const STALE_BUFFER_MIN = 240;

// ---- Shifts ---------------------------------------------------------------
const FALLBACK_SHIFT = { id: 'default', name: 'Day', start: '09:00', end: '18:00', grace: 10, enabled: true };

// The employee's shift; falls back to the first enabled shift (e.g. legacy employees).
export function shiftFor(employee, settings) {
  const all = settings.shifts || [];
  return (
    all.find((s) => s.id === employee?.shiftId) ||
    all.find((s) => s.enabled) ||
    all[0] ||
    FALLBACK_SHIFT
  );
}

// A shift whose end is at or before its start runs overnight (e.g. 22:00 -> 06:00).
export const isOvernight = (shift) => parseHM(shift.end) <= parseHM(shift.start);

function shiftLengthMin(shift) {
  const len = (parseHM(shift.end) - parseHM(shift.start) + 1440) % 1440;
  return len === 0 ? 1440 : len;
}

// Overnight shifts roll the "work day" over in the middle of their off-period,
// so a 22:00 sign-in and the 06:00 sign-out next morning belong to the same day.
function dayOffsetMin(shift) {
  if (!isOvernight(shift)) return 0;
  const s = parseHM(shift.start);
  const e = parseHM(shift.end);
  return Math.round(e + (s - e) / 2);
}

export function workDateOf(value, shift) {
  const offset = shift ? dayOffsetMin(shift) : 0;
  return dateKey(new Date(new Date(value).getTime() - offset * 60000));
}

// Work date of a record (older records without one fall back to the calendar day).
export const recordDay = (record) => record.workDate || dateKey(record.timestamp);

// Has the shift's start time passed (or is the shift currently running)?
export function shiftHasStarted(shift, now = new Date()) {
  const m = minutesOfDay(now);
  const s = parseHM(shift.start);
  const e = parseHM(shift.end);
  return isOvernight(shift) ? m >= s || m < e : m >= s;
}

// ---- Classification --------------------------------------------------------
// Signed difference between two times of day in minutes, in [-720, 720).
const circularDiff = (minutes) => {
  let d = ((minutes % 1440) + 1440) % 1440;
  if (d >= 720) d -= 1440;
  return d;
};

// Sign in  -> 'on-time' | 'late'      (after shift start + grace)
// Sign out -> 'on-time' | 'early-out' (before shift end)
export function classify(type, date, shift) {
  const mins = minutesOfDay(date);
  if (type === 'in') {
    return circularDiff(mins - parseHM(shift.start)) > Number(shift.grace || 0) ? 'late' : 'on-time';
  }
  return circularDiff(mins - parseHM(shift.end)) < 0 ? 'early-out' : 'on-time';
}

// ---- Per-employee state ----------------------------------------------------
export function lastRecordFor(records, employeeId) {
  let last = null;
  for (const r of records) {
    if (r.employeeId !== employeeId) continue;
    if (!last || r.timestamp > last.timestamp) last = r;
  }
  return last;
}

export function isOpenSession(last, now, shift) {
  if (!last || last.type !== 'in') return false;
  const ageMin = (new Date(now) - new Date(last.timestamp)) / 60000;
  return ageMin <= (shift ? shiftLengthMin(shift) : 480) + STALE_BUFFER_MIN;
}

// Next scan toggles in/out, unless the last sign-in is stale (forgotten sign-out).
export function nextType(records, employeeId, now = new Date(), shift) {
  const last = lastRecordFor(records, employeeId);
  if (!last || last.type === 'out') return 'in';
  return isOpenSession(last, now, shift) ? 'out' : 'in';
}

export function isPresentNow(records, employeeId, now, shift) {
  return isOpenSession(lastRecordFor(records, employeeId), now, shift);
}

// ---- Daily summaries -------------------------------------------------------
function buildSessions(dayRecords) {
  const sessions = [];
  let open = null;
  for (const r of dayRecords) {
    if (r.type === 'in') {
      if (open) sessions.push({ inRec: open, outRec: null });
      open = r;
    } else if (open) {
      sessions.push({ inRec: open, outRec: r });
      open = null;
    } else {
      sessions.push({ inRec: null, outRec: r });
    }
  }
  if (open) sessions.push({ inRec: open, outRec: null });
  return sessions;
}

// dayRecords must be sorted ascending by timestamp.
export function summarizeDay(dayRecords) {
  let minutes = 0;
  let missingOut = false;
  let missingIn = false;
  for (const s of buildSessions(dayRecords)) {
    if (s.inRec && s.outRec) {
      minutes += (new Date(s.outRec.timestamp) - new Date(s.inRec.timestamp)) / 60000;
    } else if (s.inRec) {
      missingOut = true;
    } else {
      missingIn = true;
    }
  }
  const firstIn = dayRecords.find((r) => r.type === 'in') || null;
  const lastOut = [...dayRecords].reverse().find((r) => r.type === 'out') || null;
  return {
    minutes,
    missingOut,
    missingIn,
    firstIn,
    lastOut,
    late: !!firstIn && firstIn.status === 'late',
    earlyOut: !!lastOut && lastOut.status === 'early-out'
  };
}

// One row per employee per work day that has at least one record.
export function buildReport(records, employees, fromKey, toKey) {
  const groups = new Map();
  for (const r of records) {
    const k = recordDay(r);
    if (k < fromKey || k > toKey) continue;
    const id = `${r.employeeId}|${k}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(r);
  }
  const byId = new Map(employees.map((e) => [e.id, e]));
  const rows = [];
  for (const [id, recs] of groups) {
    const [employeeId, date] = id.split('|');
    recs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const emp = byId.get(employeeId);
    rows.push({
      employeeId,
      date,
      name: emp ? emp.name : recs[0].employeeName,
      code: emp ? emp.employeeCode : recs[0].employeeCode,
      department: emp ? emp.department : recs[0].department,
      ...summarizeDay(recs)
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  return rows;
}

export function isWorkDay(key, settings) {
  return settings.workDays.includes(new Date(`${key}T00:00:00`).getDay());
}

// Per-employee totals for a range, including absences on scheduled work days.
export function employeeTotals(rows, employees, fromKey, toKey, settings, todayK, schedule) {
  const end = toKey > todayK ? todayK : toKey;
  const totals = [];
  for (const emp of employees) {
    const mine = rows.filter((r) => r.employeeId === emp.id);
    if (!emp.active && mine.length === 0) continue;
    const created = dateKey(emp.createdAt);
    const start = created > fromKey ? created : fromKey;
    const workdays =
      start <= end
        ? rangeKeys(start, end).filter((k) => scheduledShift(emp, k, settings, schedule))
        : [];
    const presentDays = new Set(mine.filter((r) => r.firstIn).map((r) => r.date));
    totals.push({
      employeeId: emp.id,
      name: emp.name,
      code: emp.employeeCode,
      department: emp.department,
      days: mine.length,
      minutes: mine.reduce((sum, r) => sum + r.minutes, 0),
      late: mine.filter((r) => r.late).length,
      earlyOut: mine.filter((r) => r.earlyOut).length,
      missing: mine.filter((r) => r.missingOut || r.missingIn).length,
      absent: workdays.filter((k) => !presentDays.has(k)).length
    });
  }
  return totals.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Day-by-day schedule ----------------------------------------------------
// schedule = { [employeeId]: { 'YYYY-MM-DD': shiftId | 'off' } }
// A day with no entry uses the employee's default shift on the company's work days.

// The shift an employee is scheduled for on a date, or null if they are off.
export function scheduledShift(employee, key, settings, schedule) {
  const entry = schedule?.[employee.id]?.[key];
  if (entry === 'off') return null;
  if (entry) {
    const found = (settings.shifts || []).find((s) => s.id === entry);
    if (found) return found;
  }
  return isWorkDay(key, settings) ? shiftFor(employee, settings) : null;
}

// Which shift does a scan at `when` belong to? Looks at today's shift and at
// yesterday's overnight shift (still running after midnight) and picks the one
// that starts closest to now. `scheduled` is false when nothing is planned.
export function shiftForScan(employee, when, settings, schedule) {
  const today = dateKey(when);
  const candidates = [];
  const todays = scheduledShift(employee, today, settings, schedule);
  if (todays) candidates.push(todays);
  const yesterdays = scheduledShift(employee, addDays(today, -1), settings, schedule);
  // Yesterday's overnight shift only counts while it is still running.
  if (yesterdays && isOvernight(yesterdays) && minutesOfDay(when) < parseHM(yesterdays.end)) {
    candidates.push(yesterdays);
  }

  if (candidates.length === 0) return { shift: shiftFor(employee, settings), scheduled: false };

  const mins = minutesOfDay(when);
  let best = candidates[0];
  let bestGap = Infinity;
  for (const c of candidates) {
    const gap = Math.abs(circularDiff(mins - parseHM(c.start)));
    if (gap < bestGap) {
      best = c;
      bestGap = gap;
    }
  }
  return { shift: best, scheduled: true };
}

// Shift, work date and "scheduled" flag for a new/edited record.
// A sign-out is paired with the latest sign-in before it (within 24h) so the
// session is judged against, and filed under, the shift it started in.
export function resolveShift({ employee, type, when, recs, settings, schedule, ignoreId }) {
  const ts = when.toISOString();
  if (type === 'out') {
    let prevIn = null;
    for (const r of recs) {
      if (r.id === ignoreId || r.employeeId !== employee.id || r.type !== 'in') continue;
      if (r.timestamp > ts) continue;
      if (!prevIn || r.timestamp > prevIn.timestamp) prevIn = r;
    }
    if (prevIn && when - new Date(prevIn.timestamp) <= 24 * 3600 * 1000) {
      const shift = (settings.shifts || []).find((x) => x.id === prevIn.shiftId);
      if (shift) return { shift, scheduled: true, workDate: recordDay(prevIn) };
    }
  }
  const { shift, scheduled } = shiftForScan(employee, when, settings, schedule);
  return { shift, scheduled, workDate: workDateOf(when, shift) };
}
